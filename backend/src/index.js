const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const mongoose = require('mongoose');
const DOMPurify = require('isomorphic-dompurify');
const { config } = require('./config');
const { connectMongo } = require('./db');
const { startScanWorker } = require('./scanWorker');
const { startExpiryWorker } = require('./expiryWorker');
const { startNotificationWorker } = require('./notificationWorker');
const { startStoryExpiryWorker } = require('./storyExpiryWorker');
const { getUserFromToken } = require('./middleware/auth');
const { setUserPresence, checkRateLimit, getUserPresence } = require('./redis');
const { Message, FileAsset, Channel, ChannelMember, GroupMessage, User, Call } = require('./models');
const { writeAuditLog } = require('./middleware/audit');
const { enqueueNotificationEvent } = require('./services/notificationService');
const { logTelemetry, incMetric, safeErrorMessage } = require('./utils/telemetry');
const {
  app,
  featurePushNotificationsEnabled,
  featureStoriesEnabled,
  featureCallsEnabled,
} = require('./expressApp');

const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
});

// Allow route handlers to emit socket events.
app.set('io', io);

function sanitizeMessageContent(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return null;
  }

  const MAX_LENGTH = 4000;
  if (trimmed.length > MAX_LENGTH) {
    throw new Error(`content exceeds maximum length of ${MAX_LENGTH} characters`);
  }

  let sanitized = DOMPurify.sanitize(trimmed, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'code', 'pre', 'span', 'br', 'p', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href'],
  });

  const lowered = sanitized.toLowerCase();
  if (lowered.includes('<script') || lowered.includes('javascript:')) {
    sanitized = DOMPurify.sanitize(sanitized, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }

  return sanitized;
}

async function ensureChannelMember(userId, channelId) {
  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new Error('Invalid channel id');
  }

  const membership = await ChannelMember.findOne({
    channel: channelId,
    user: userId,
  })
    .select('channel user canPost')
    .lean()
    .exec();

  if (!membership) {
    const err = new Error('Not a member of this channel');
    err.code = 'NOT_MEMBER';
    throw err;
  }
}

async function ensureChannelCanPost(userId, channelId) {
  const membership = await ChannelMember.findOne({ channel: channelId, user: userId })
    .select('canPost')
    .lean()
    .exec();
  if (!membership) {
    const err = new Error('Not a member of this channel');
    err.code = 'NOT_MEMBER';
    throw err;
  }
  if (!membership.canPost) {
    const err = new Error('Not allowed to post in this channel');
    err.code = 'CANNOT_POST';
    throw err;
  }
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.data.user = null;

  socket.on('auth:resume', (token, cb) => {
    const user = getUserFromToken(token);
    if (!user) {
      socket.data.user = null;
      if (typeof cb === 'function') {
        cb({ ok: false, error: 'Invalid or expired token' });
      }
      return;
    }

    socket.data.user = user;
    // Give the socket a per-user room for Phase 5 features
    // (calls/signals/targeted notifications in future).
    socket.join(`user:${user.id}`);

    // Mobile readiness: re-emit any active ringing calls so clients that were
    // background/offline can catch up on reconnect.
    if (featureCallsEnabled) {
      (async () => {
        try {
          const pendingCalls = await Call.find({
            calleeId: user.id,
            status: 'ringing',
          })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('callerId calleeId conversationId callType offer createdAt')
            .lean()
            .exec();

          for (const c of pendingCalls) {
            socket.emit('call:invite', {
              callId: String(c._id),
              callerId: String(c.callerId),
              calleeId: String(c.calleeId),
              conversationId: c.conversationId ? String(c.conversationId) : null,
              callType: c.callType,
              offer: c.offer || null,
            });
          }
        } catch (err) {
          // Best-effort only.
          console.error('auth:resume re-emit pending calls failed', err);
        }
      })();
    }
    if (typeof cb === 'function') {
      cb({ ok: true, user: { id: user.id, role: user.role } });
    }
  });

  socket.on('channel:join', async (payload, cb) => {
    try {
      const user = socket.data.user;
      if (!user) {
        throw new Error('Authentication required');
      }

      const channelId = payload && payload.channelId;
      if (!channelId) {
        throw new Error('channelId is required');
      }

      await ensureChannelMember(user.id, channelId);

      const room = `channel:${channelId}`;
      await socket.join(room);

      await writeAuditLog({
        actorId: user.id,
        action: 'channel.join',
        targetType: 'channel',
        targetId: String(channelId),
        result: 'success',
        ip: socket.handshake.address || null,
        userAgent: socket.handshake.headers['user-agent'] || '',
        metadata: { via: 'socket' },
      });

      if (typeof cb === 'function') {
        cb({ ok: true });
      }
    } catch (err) {
      if (typeof cb === 'function') {
        cb({ ok: false, error: err.message || 'Failed to join channel' });
      }
    }
  });

  socket.on('channel:leave', async (payload, cb) => {
    try {
      const user = socket.data.user;
      if (!user) {
        throw new Error('Authentication required');
      }

      const channelId = payload && payload.channelId;
      if (!channelId) {
        throw new Error('channelId is required');
      }

      const room = `channel:${channelId}`;
      await socket.leave(room);

      await writeAuditLog({
        actorId: user.id,
        action: 'channel.leave',
        targetType: 'channel',
        targetId: String(channelId),
        result: 'success',
        ip: socket.handshake.address || null,
        userAgent: socket.handshake.headers['user-agent'] || '',
        metadata: { via: 'socket' },
      });

      if (typeof cb === 'function') {
        cb({ ok: true });
      }
    } catch (err) {
      if (typeof cb === 'function') {
        cb({ ok: false, error: err.message || 'Failed to leave channel' });
      }
    }
  });

  // GROUP CHAT: socket room is `group:${groupId}`
  socket.on('group:join', async (payload, cb) => {
    try {
      const user = socket.data.user;
      if (!user) throw new Error('Authentication required');

      const groupId = payload && payload.groupId;
      if (!groupId) throw new Error('groupId is required');
      if (!mongoose.Types.ObjectId.isValid(groupId)) throw new Error('Invalid groupId');

      const membership = await ChannelMember.findOne({ channel: groupId, user: user.id })
        .select('user channel')
        .lean()
        .exec();
      if (!membership) throw new Error('Not a member of this group');

      const room = `group:${groupId}`;
      await socket.join(room);

      // Mark the user as having read all existing (non-deleted) messages up to now.
      const now = new Date();
      await GroupMessage.updateMany(
        { groupId, deleted: false, timestamp: { $lte: now } },
        { $addToSet: { readBy: user.id } },
      ).exec();

      const memberCount = await ChannelMember.countDocuments({ channel: groupId }).exec();
      if (memberCount > 0) {
        await GroupMessage.updateMany(
          {
            groupId,
            deleted: false,
            status: { $ne: 'read' },
            $expr: { $eq: [{ $size: '$readBy' }, memberCount] },
          },
          { $set: { status: 'read' } },
        ).exec();
      }

      io.to(room).emit('group:message:read', { groupId, userId: user.id });

      // Optional system message: user joined.
      const userDoc = await User.findById(user.id).select('displayName').lean().exec();
      const joinedContent = `${userDoc?.displayName || 'Someone'} joined`;
      const sysMsg = await GroupMessage.create({
        groupId,
        senderId: user.id,
        content: joinedContent,
        type: 'system',
        status: 'sent',
        edited: false,
        deleted: false,
        deliveredTo: [user.id],
        readBy: [user.id],
        replyTo: null,
        reactions: [],
      });
      io.to(room).emit('group:message:new', {
        id: String(sysMsg._id),
        channel: String(sysMsg.groupId),
        sender: String(sysMsg.senderId),
        content: sysMsg.content,
        type: sysMsg.type,
        attachments: [],
        attachmentDetails: [],
        createdAt: sysMsg.timestamp.toISOString(),
        editedAt: sysMsg.editedAt || null,
        reactions: [],
        replyTo: null,
        deleted: false,
      });

      if (typeof cb === 'function') cb({ ok: true });
    } catch (err) {
      if (typeof cb === 'function') cb({ ok: false, error: err.message || 'Failed to join group' });
    }
  });

  socket.on('group:leave', async (payload, cb) => {
    try {
      const user = socket.data.user;
      if (!user) throw new Error('Authentication required');

      const groupId = payload && payload.groupId;
      if (!groupId) throw new Error('groupId is required');
      if (!mongoose.Types.ObjectId.isValid(groupId)) throw new Error('Invalid groupId');
      const membership = await ChannelMember.findOne({ channel: groupId, user: user.id })
        .select('user channel')
        .lean()
        .exec();
      if (!membership) {
        const room = `group:${groupId}`;
        await socket.leave(room);
        if (typeof cb === 'function') cb({ ok: true });
        return;
      }

      const room = `group:${groupId}`;
      await socket.leave(room);

      // Optional system message: user left.
      const userDoc = await User.findById(user.id).select('displayName').lean().exec();
      const leftContent = `${userDoc?.displayName || 'Someone'} left`;
      const sysMsg = await GroupMessage.create({
        groupId,
        senderId: user.id,
        content: leftContent,
        type: 'system',
        status: 'sent',
        edited: false,
        deleted: false,
        deliveredTo: [user.id],
        readBy: [user.id],
        replyTo: null,
        reactions: [],
      });
      io.to(room).emit('group:message:new', {
        id: String(sysMsg._id),
        channel: String(sysMsg.groupId),
        sender: String(sysMsg.senderId),
        content: sysMsg.content,
        type: sysMsg.type,
        attachments: [],
        attachmentDetails: [],
        createdAt: sysMsg.timestamp.toISOString(),
        editedAt: sysMsg.editedAt || null,
        reactions: [],
        replyTo: null,
        deleted: false,
      });

      if (typeof cb === 'function') cb({ ok: true });
    } catch (err) {
      if (typeof cb === 'function') cb({ ok: false, error: err.message || 'Failed to leave group' });
    }
  });

  socket.on('message:send', async (payload, cb) => {
    try {
      const user = socket.data.user;
      if (!user) {
        throw new Error('Authentication required');
      }

      const { channelId, content, attachmentIds } = payload || {};
      if (!channelId) {
        throw new Error('channelId is required');
      }

      await ensureChannelMember(user.id, channelId);
      await ensureChannelCanPost(user.id, channelId);

      const rateKey = `msg:${user.id}:${channelId}`;
      const rate = await checkRateLimit({ key: rateKey, limit: 20, windowSeconds: 10 });
      if (!rate.allowed) {
        const err = new Error('Rate limit exceeded for sending messages');
        err.code = 'RATE_LIMIT';
        throw err;
      }

      const sanitizedContent = sanitizeMessageContent(content);
      if (!sanitizedContent) {
        throw new Error('content cannot be empty');
      }

      let attachments = [];
      let attachmentDetails = [];
      if (Array.isArray(attachmentIds) && attachmentIds.length > 0) {
        const cleanIds = attachmentIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
        if (cleanIds.length > 0) {
          const files = await FileAsset.find({
            _id: { $in: cleanIds },
            scanStatus: 'scanned_clean',
          })
            .select('_id cloudinarySecureUrl cloudinaryUrl mimeType originalName')
            .lean()
            .exec();
          attachments = files.map((f) => f._id);
          attachmentDetails = files.map((f) => ({
            id: String(f._id),
            url: f.cloudinarySecureUrl || f.cloudinaryUrl || null,
            mimeType: f.mimeType,
            fileName: f.originalName || null,
          }));
        }
      }

      const message = await Message.create({
        channel: channelId,
        sender: user.id,
        content: sanitizedContent,
        attachments,
      });

      await Channel.findByIdAndUpdate(channelId, { $set: { lastMessageAt: new Date() } }).exec();

      await writeAuditLog({
        actorId: user.id,
        action: 'chat.message.send',
        targetType: 'message',
        targetId: String(message._id),
        result: 'success',
        ip: socket.handshake.address || null,
        userAgent: socket.handshake.headers['user-agent'] || '',
        metadata: {
          channelId,
          hasAttachments: attachments.length > 0,
          via: 'socket',
        },
      });

      const payloadOut = {
        id: String(message._id),
        channel: String(message.channel),
        sender: String(message.sender),
        content: message.content,
        attachments: message.attachments.map(String),
        attachmentDetails,
        createdAt: message.createdAt,
        editedAt: message.editedAt || null,
      };

      const room = `channel:${channelId}`;
      io.to(room).emit('message:new', payloadOut);

      if (typeof cb === 'function') {
        cb({ ok: true, message: payloadOut });
      }
    } catch (err) {
      if (typeof cb === 'function') {
        cb({
          ok: false,
          error: err.message || 'Failed to send message',
        });
      }
    }
  });

  socket.on('typing:start', async (payload) => {
    try {
      const user = socket.data.user;
      if (!user) return;

      const channelId = payload && payload.channelId;
      if (!channelId) return;

      await ensureChannelMember(user.id, channelId);
      await ensureChannelCanPost(user.id, channelId);

      const room = `channel:${channelId}`;
      io.to(room).emit('typing:update', {
        channelId,
        userId: user.id,
        typing: true,
      });
    } catch {
      // ignore typing errors
    }
  });

  socket.on('typing:stop', async (payload) => {
    try {
      const user = socket.data.user;
      if (!user) return;

      const channelId = payload && payload.channelId;
      if (!channelId) return;

      await ensureChannelMember(user.id, channelId);
      await ensureChannelCanPost(user.id, channelId);

      const room = `channel:${channelId}`;
      io.to(room).emit('typing:update', {
        channelId,
        userId: user.id,
        typing: false,
      });
    } catch {
      // ignore typing errors
    }
  });

  socket.on('presence:ping', async (payload, cb) => {
    try {
      const user = socket.data.user;
      if (!user) {
        throw new Error('Authentication required');
      }

      const status = (payload && payload.status) || 'online';
      const presence = await setUserPresence(user.id, status);

      io.emit('presence:update', {
        userId: user.id,
        status,
        updatedAt: presence.updatedAt,
      });

      if (typeof cb === 'function') {
        cb({ ok: true });
      }
    } catch (err) {
      if (typeof cb === 'function') {
        cb({ ok: false, error: err.message || 'Failed to update presence' });
      }
    }
  });

  // Phase 5: Calls (minimal signaling + persistence + call logs).
  // The actual media (WebRTC) happens on clients; the server forwards SDP/ICE between users.
  socket.on('call:invite', async (payload, cb) => {
    if (!featureCallsEnabled) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Calls disabled' });
      return;
    }
    try {
      const user = socket.data.user;
      if (!user) throw new Error('Authentication required');

      const calleeId = payload && payload.calleeId;
      const callType = payload && payload.callType;
      const conversationId = payload && payload.conversationId;
      const offer = payload && payload.offer;

      if (!calleeId || !mongoose.Types.ObjectId.isValid(calleeId)) {
        throw new Error('calleeId is required');
      }
      if (!['audio', 'video'].includes(callType)) {
        throw new Error("callType must be 'audio' or 'video'");
      }
      if (conversationId && !mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new Error('conversationId must be a valid ObjectId');
      }

      const rateKey = `call:invite:${user.id}`;
      const rate = await checkRateLimit({ key: rateKey, limit: 10, windowSeconds: 60 });
      if (!rate.allowed) {
        const err = new Error('Rate limit exceeded for call invites');
        err.code = 'RATE_LIMIT';
        throw err;
      }

      const call = await Call.create({
        callerId: user.id,
        calleeId: String(calleeId),
        conversationId: conversationId ? String(conversationId) : null,
        callType,
        status: 'ringing',
        offer: offer || null,
      });

      // Forward to callee.
      io.to(`user:${calleeId}`).emit('call:invite', {
        callId: String(call._id),
        callerId: user.id,
        calleeId: String(calleeId),
        conversationId: conversationId ? String(conversationId) : null,
        callType,
        offer: offer || null,
      });

      logTelemetry('info', 'call_invite_emitted', {
        callId: String(call._id),
        callerId: String(user.id),
        calleeId: String(calleeId),
        conversationId: conversationId ? String(conversationId) : null,
        callType,
      });
      void incMetric('call_invite_emitted_total', 1);

      // Offline call notification.
      try {
        const calleePresence = await getUserPresence(String(calleeId));
        const calleeOffline = !calleePresence || calleePresence.status === 'offline';
        if (calleeOffline) {
          await enqueueNotificationEvent({
            type: 'call',
            createdBy: user.id,
            recipientUserIds: [String(calleeId)],
            payload: {
              kind: 'call',
              callId: String(call._id),
              callerId: user.id,
              conversationId: conversationId ? String(conversationId) : null,
              callType,
            },
          });
        }
      } catch {
        // ignore best-effort notifications
      }

      if (typeof cb === 'function') cb({ ok: true, callId: String(call._id) });
    } catch (err) {
      logTelemetry('error', 'call_invite_error', {
        // Best-effort: user/callee may not be available.
        error: safeErrorMessage(err),
      });
      void incMetric('call_invite_error_total', 1);
      if (typeof cb === 'function') cb({ ok: false, error: err.message || 'Failed to invite call' });
    }
  });

  socket.on('call:signal', async (payload, cb) => {
    if (!featureCallsEnabled) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Calls disabled' });
      return;
    }
    try {
      const user = socket.data.user;
      if (!user) throw new Error('Authentication required');

      const callId = payload && payload.callId;
      const toUserId = payload && payload.toUserId;
      const signal = payload && payload.signal;

      if (!callId || !mongoose.Types.ObjectId.isValid(callId)) throw new Error('callId is required');
      if (!toUserId || !mongoose.Types.ObjectId.isValid(toUserId)) throw new Error('toUserId is required');
      if (!signal) throw new Error('signal is required');

      // Abuse protection: prevent excessive signaling spam per-user/per-call.
      // ICE candidate bursts can be large, so the threshold is intentionally high.
      const rateKey = `call:signal:${user.id}:${callId}`;
      const rate = await checkRateLimit({ key: rateKey, limit: 300, windowSeconds: 10 });
      if (!rate.allowed) {
        if (typeof cb === 'function') cb({ ok: false, error: 'Rate limit exceeded for call signaling' });
        return;
      }

      const call = await Call.findById(callId).select('callerId calleeId status').lean().exec();
      if (!call) {
        if (typeof cb === 'function') cb({ ok: false, error: 'Call not found' });
        return;
      }
      if (call.status === 'ended') {
        if (typeof cb === 'function') cb({ ok: false, error: 'Call already ended' });
        return;
      }

      const isCaller = String(call.callerId) === String(user.id);
      const isCallee = String(call.calleeId) === String(user.id);
      if (!isCaller && !isCallee) throw new Error('Not a participant in this call');

      const otherUserId = isCaller ? String(call.calleeId) : String(call.callerId);
      if (String(toUserId) !== otherUserId) throw new Error('toUserId must target the other participant');

      io.to(`user:${toUserId}`).emit('call:signal', {
        callId: String(callId),
        fromUserId: String(user.id),
        signal,
      });

      logTelemetry('info', 'call_signal_forwarded', {
        callId: String(callId),
        fromUserId: String(user.id),
        toUserId: String(toUserId),
      });
      void incMetric('call_signal_forwarded_total', 1);

      if (typeof cb === 'function') cb({ ok: true });
    } catch (err) {
      logTelemetry('error', 'call_signal_error', {
        error: safeErrorMessage(err),
      });
      void incMetric('call_signal_error_total', 1);
      if (typeof cb === 'function') cb({ ok: false, error: err.message || 'Failed to forward call signal' });
    }
  });

  socket.on('call:end', async (payload, cb) => {
    if (!featureCallsEnabled) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Calls disabled' });
      return;
    }
    try {
      const user = socket.data.user;
      if (!user) throw new Error('Authentication required');

      const callId = payload && payload.callId;
      const endedReason = payload && payload.endedReason;
      const status = payload && payload.status;

      if (!callId || !mongoose.Types.ObjectId.isValid(callId)) throw new Error('callId is required');

      // Abuse protection: prevent repeated end/cancel spam.
      const rateKey = `call:end:${user.id}:${callId}`;
      const rate = await checkRateLimit({ key: rateKey, limit: 5, windowSeconds: 60 });
      if (!rate.allowed) {
        if (typeof cb === 'function') cb({ ok: false, error: 'Rate limit exceeded for ending call' });
        return;
      }

      const call = await Call.findById(callId).select('callerId calleeId status').lean().exec();
      if (!call) {
        if (typeof cb === 'function') cb({ ok: false, error: 'Call not found' });
        return;
      }

      const isCaller = String(call.callerId) === String(user.id);
      const isCallee = String(call.calleeId) === String(user.id);
      if (!isCaller && !isCallee) throw new Error('Not a participant in this call');

      const otherUserId = isCaller ? String(call.calleeId) : String(call.callerId);
      const desiredStatus = status === 'missed' ? 'missed' : 'ended';

      await Call.updateOne(
        { _id: callId },
        {
          $set: {
            status: desiredStatus,
            endedReason: endedReason ? String(endedReason) : null,
            endedAt: new Date(),
            endedBy: user.id,
          },
        },
      ).exec();

      io.to(`user:${otherUserId}`).emit('call:ended', {
        callId: String(callId),
        endedReason: endedReason ? String(endedReason) : null,
        status: desiredStatus,
        endedBy: String(user.id),
      });

      logTelemetry('info', 'call_ended_recorded', {
        callId: String(callId),
        status: desiredStatus,
        endedBy: String(user.id),
        otherUserId,
      });
      void incMetric('call_ended_recorded_total', 1);

      if (typeof cb === 'function') cb({ ok: true });
    } catch (err) {
      logTelemetry('error', 'call_end_error', {
        error: safeErrorMessage(err),
      });
      void incMetric('call_end_error_total', 1);
      if (typeof cb === 'function') cb({ ok: false, error: err.message || 'Failed to end call' });
    }
  });

  socket.on('message:delivered', async (payload) => {
    try {
      const user = socket.data.user;
      if (!user) return;

      const { messageId, channelId } = payload || {};
      if (!messageId || !channelId) return;

      if (!mongoose.Types.ObjectId.isValid(messageId)) return;

      await ensureChannelMember(user.id, channelId);

      await Message.findByIdAndUpdate(messageId, {
        $addToSet: {
          deliveredTo: { user: user.id, at: new Date() },
        },
      }).exec();

      const room = `channel:${channelId}`;
      io.to(room).emit('message:delivered', {
        messageId,
        userId: user.id,
        at: new Date().toISOString(),
      });
    } catch {
      // ignore
    }
  });

  socket.on('message:read', async (payload) => {
    try {
      const user = socket.data.user;
      if (!user) return;

      const { messageId, channelId } = payload || {};
      if (!messageId || !channelId) return;

      if (!mongoose.Types.ObjectId.isValid(messageId)) return;

      await ensureChannelMember(user.id, channelId);

      await Message.findByIdAndUpdate(messageId, {
        $addToSet: {
          readBy: { user: user.id, at: new Date() },
        },
      }).exec();

      const room = `channel:${channelId}`;
      io.to(room).emit('message:read', {
        messageId,
        userId: user.id,
        at: new Date().toISOString(),
      });
    } catch {
      // ignore
    }
  });

  // GROUP CHAT: delivered tracking
  socket.on('group:message:delivered', async (payload, cb) => {
    try {
      const user = socket.data.user;
      if (!user) return;

      const { messageId } = payload || {};
      if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) return;

      const message = await GroupMessage.findById(messageId)
        .select('groupId deleted deliveredTo status')
        .lean()
        .exec();
      if (!message || message.deleted) return;

      const membership = await ChannelMember.findOne({ channel: message.groupId, user: user.id })
        .select('_id')
        .lean()
        .exec();
      if (!membership) return;

      // "Online members" inferred from presence TTL.
      const members = await ChannelMember.find({ channel: message.groupId })
        .select('user')
        .lean()
        .exec();
      const presenceArr = await Promise.all(members.map((m) => getUserPresence(String(m.user))));
      const onlineUserIds = members
        .filter((_m, idx) => {
          const p = presenceArr[idx];
          return p && p.status && p.status !== 'offline';
        })
        .map((m) => String(m.user));

      await GroupMessage.updateOne(
        { _id: messageId },
        { $addToSet: { deliveredTo: user.id } },
      ).exec();

      const updated = await GroupMessage.findById(messageId).select('deliveredTo status').lean().exec();
      const deliveredToIds = new Set((updated?.deliveredTo || []).map(String));
      const allOnlineDelivered =
        onlineUserIds.length > 0 && onlineUserIds.every((uid) => deliveredToIds.has(String(uid)));

      const shouldMarkDelivered =
        allOnlineDelivered && updated?.status !== 'read' && updated?.status !== 'delivered';
      if (shouldMarkDelivered) {
        await GroupMessage.updateOne(
          { _id: messageId, status: { $ne: 'read' } },
          { $set: { status: 'delivered' } },
        ).exec();

        io.to(`group:${message.groupId}`).emit('group:message:delivered', {
          groupId: String(message.groupId),
          messageId,
          userId: user.id,
        });
      }

      if (typeof cb === 'function') cb({ ok: true });
    } catch (err) {
      if (typeof cb === 'function') cb({ ok: false, error: err.message || 'Failed to mark delivered' });
    }
  });

  // GROUP CHAT: per-message read tracking
  socket.on('group:message:read', async (payload, cb) => {
    try {
      const user = socket.data.user;
      if (!user) return;

      const { messageId } = payload || {};
      if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) return;

      const message = await GroupMessage.findById(messageId)
        .select('groupId deleted readBy status')
        .lean()
        .exec();
      if (!message || message.deleted) return;

      const membership = await ChannelMember.findOne({ channel: message.groupId, user: user.id })
        .select('_id')
        .lean()
        .exec();
      if (!membership) return;

      await GroupMessage.updateOne(
        { _id: messageId },
        { $addToSet: { readBy: user.id } },
      ).exec();

      const memberCount = await ChannelMember.countDocuments({ channel: message.groupId }).exec();
      if (memberCount > 0) {
        const statusUpdate = await GroupMessage.updateOne(
          {
            _id: messageId,
            deleted: false,
            status: { $ne: 'read' },
            $expr: { $eq: [{ $size: '$readBy' }, memberCount] },
          },
          { $set: { status: 'read' } },
        ).exec();

        if (statusUpdate && (statusUpdate.modifiedCount > 0 || statusUpdate.nModified > 0)) {
          io.to(`group:${message.groupId}`).emit('group:message:read', {
            groupId: String(message.groupId),
            messageId,
            userId: user.id,
          });
        }
      }

      if (typeof cb === 'function') cb({ ok: true });
    } catch (err) {
      if (typeof cb === 'function') cb({ ok: false, error: err.message || 'Failed to mark read' });
    }
  });

  socket.on('disconnect', async (reason) => {
    try {
      const user = socket.data.user;
      if (user && user.id) {
        const presence = await setUserPresence(user.id, 'offline');
        io.emit('presence:update', {
          userId: user.id,
          status: 'offline',
          updatedAt: presence.updatedAt,
        });
      }
    } catch {
      // best effort presence update
    }
    console.log(`Socket disconnected: ${socket.id} (${reason})`);
  });
});

async function start() {
  await connectMongo();

  httpServer.listen(config.port, () => {
    console.log(`Backend listening on http://localhost:${config.port}`);
  });

  // Start background scan worker after server and database are ready
  startScanWorker(io);
  startExpiryWorker();
  if (featurePushNotificationsEnabled) startNotificationWorker();
  if (featureStoriesEnabled) startStoryExpiryWorker();
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});

