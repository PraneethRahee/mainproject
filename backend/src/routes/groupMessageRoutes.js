const express = require('express');
const mongoose = require('mongoose');
const DOMPurify = require('isomorphic-dompurify');
const { Channel, ChannelMember, FileAsset, GroupMessage, GROUP_MESSAGE_TYPES } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { getUserPresence } = require('../redis');

const router = express.Router();

router.use(requireAuth);

function encodeCursor({ timestamp, id }) {
  const payload = JSON.stringify({ ts: new Date(timestamp).toISOString(), id: String(id) });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  const raw = Buffer.from(String(cursor), 'base64url').toString('utf8');
  const parsed = JSON.parse(raw);
  const ts = parsed && parsed.ts;
  const id = parsed && parsed.id;

  if (!ts || typeof ts !== 'string') return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;

  if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) return null;

  return { timestamp: date, id };
}

function sanitizeContent(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  const MAX_LENGTH = 4000;
  if (trimmed.length > MAX_LENGTH) {
    const err = new Error(`content exceeds maximum length of ${MAX_LENGTH} characters`);
    err.code = 'CONTENT_TOO_LONG';
    throw err;
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

async function requireGroupMember(groupId, userId) {
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    const err = new Error('Invalid groupId');
    err.statusCode = 400;
    throw err;
  }

  const membership = await ChannelMember.findOne({ channel: groupId, user: userId })
    .select('canPost isAdmin')
    .lean()
    .exec();

  if (!membership) {
    const err = new Error('Not a member of this group');
    err.statusCode = 403;
    throw err;
  }

  const channel = await Channel.findById(groupId).select('name type metadata').lean().exec();
  if (!channel) {
    const err = new Error('Group not found');
    err.statusCode = 404;
    throw err;
  }

  const memberDocs = await ChannelMember.find({ channel: groupId })
    .select('user isAdmin')
    .lean()
    .exec();

  const members = memberDocs.map((d) => String(d.user));
  const admins = memberDocs.filter((d) => d.isAdmin).map((d) => String(d.user));

  // Phase 3 (announcement-only / policy): whoCanSend controls posting for non-admins.
  const whoCanSend = channel?.metadata?.whoCanSend;
  let canPostEffective = Boolean(membership.canPost);
  if (whoCanSend === 'adminsOnly') {
    canPostEffective = Boolean(membership.canPost) && Boolean(membership.isAdmin);
  } else if (whoCanSend === 'everyone') {
    canPostEffective = Boolean(membership.canPost);
  }

  return {
    _id: String(channel._id),
    groupId: String(channel._id),
    groupName: channel.name,
    members,
    admins,
    canPost: canPostEffective,
  };
}

function isAdmin(group, userId) {
  const uid = String(userId);
  return Array.isArray(group.admins) && group.admins.some((a) => String(a) === uid);
}

const CLIENT_ALLOWED_TYPES = GROUP_MESSAGE_TYPES.filter((t) => t !== 'system');

function inferTypeFromAttachments(files) {
  if (!files || files.length === 0) return 'text';
  const mimes = (files || []).map((f) => String(f.mimeType || '')).map((m) => m.toLowerCase());
  if (mimes.some((m) => m.startsWith('image/'))) return 'image';
  if (mimes.some((m) => m.startsWith('video/'))) return 'video';
  return 'file';
}

// POST /group/messages
router.post('/group/messages', async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId, senderId, content, type, replyTo, attachmentIds } = req.body || {};

    if (senderId && String(senderId) !== String(userId)) {
      return res.status(403).json({ error: 'senderId must match authenticated user' });
    }

    if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: 'groupId is required' });
    }

    const desiredType = type ? String(type) : null;
    if (desiredType && !CLIENT_ALLOWED_TYPES.includes(desiredType)) {
      return res.status(400).json({ error: `type must be one of: ${CLIENT_ALLOWED_TYPES.join(', ')}` });
    }

    let sanitizedContent;
    try {
      sanitizedContent = sanitizeContent(content);
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Invalid content' });
    }

    if (!sanitizedContent) {
      return res.status(400).json({ error: 'content is required' });
    }

    const group = await requireGroupMember(groupId, userId);
    if (!group.canPost) {
      return res.status(403).json({ error: 'Not allowed to post in this group' });
    }

    let replyToId = null;
    let replyToInfo = null;
    if (replyTo) {
      if (!mongoose.Types.ObjectId.isValid(replyTo)) {
        return res.status(400).json({ error: 'replyTo must be a valid message id' });
      }
      replyToId = replyTo;
    }

    if (replyToId) {
      const parent = await GroupMessage.findOne({
        _id: replyToId,
        groupId,
        deleted: false,
      })
        .select('_id senderId content')
        .lean()
        .exec();

      if (!parent) {
        return res.status(400).json({ error: 'replyTo must reference a non-deleted message in this group' });
      }

      replyToInfo = {
        id: String(parent._id),
        sender: parent.senderId ? String(parent.senderId) : null,
        content: parent.content,
      };
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

    const inferredType = inferTypeFromAttachments(attachments ? attachmentDetails : []);
    // If content exists without attachments, inferredType will be 'text'.
    const messageType = desiredType || (attachmentDetails.length > 0 ? inferTypeFromAttachments(attachmentDetails) : 'text');

    const message = await GroupMessage.create({
      groupId,
      senderId: userId,
      content: sanitizedContent,
      type: messageType,
      status: 'sent',
      edited: false,
      editedAt: null,
      deleted: false,
      deliveredTo: [userId],
      readBy: [userId],
      replyTo: replyToId,
      attachments,
    });

    const createdAt = message.timestamp;

    const payloadOut = {
      id: String(message._id),
      channel: String(message.groupId),
      sender: String(message.senderId),
      type: String(message.type || 'text'),
      content: message.content,
      attachments: (message.attachments || []).map(String),
      attachmentDetails,
      createdAt: createdAt.toISOString(),
      editedAt: null,
      reactions: [],
      replyTo: replyToId ? replyToInfo : null,
      status: message.status,
      deleted: false,
    };

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('group:message:new', payloadOut);
    }

    return res.status(201).json({
      ...payloadOut,
      deleted: false,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) {
      console.error('POST /group/messages error', err);
    }
    return res.status(status).json({ error: err.message || 'Failed to store group message' });
  }
});

// DELETE /group/messages/:messageId (soft delete)
router.delete('/group/messages/:messageId', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid messageId' });
    }

    const message = await GroupMessage.findById(messageId)
      .select('_id groupId senderId deleted')
      .lean()
      .exec();

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const group = await requireGroupMember(String(message.groupId), userId);

    const isSender = String(message.senderId) === String(userId);
    const allowed = isSender || isAdmin(group, userId);
    if (!allowed) {
      return res.status(403).json({ error: 'Not allowed to delete this message' });
    }

    if (message.deleted) {
      return res.status(200).json({ ok: true, id: String(message._id), deleted: true });
    }

    await GroupMessage.updateOne(
      { _id: messageId },
      {
        $set: {
          deleted: true,
          status: 'sent',
          edited: false,
          editedAt: null,
          content: 'This message was deleted',
          type: 'system',
          reactions: [],
          attachments: [],
          deliveredTo: [],
          readBy: [],
        },
      },
    ).exec();

    return res.status(200).json({ ok: true, id: String(message._id), deleted: true });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) {
      console.error('DELETE /group/messages/:messageId error', err);
    }
    return res.status(status).json({ error: err.message || 'Failed to delete message' });
  }
});

// PATCH /group/messages/:messageId (edit message content)
router.patch('/group/messages/:messageId', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;
    const { content } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid messageId' });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    let sanitizedContent;
    try {
      sanitizedContent = sanitizeContent(content);
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Invalid content' });
    }
    if (!sanitizedContent) {
      return res.status(400).json({ error: 'content is required' });
    }

    const message = await GroupMessage.findById(messageId)
      .select('groupId senderId deleted type')
      .lean()
      .exec();

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (message.deleted) {
      return res.status(400).json({ error: 'Cannot edit a deleted message' });
    }
    if (message.type === 'system') {
      return res.status(400).json({ error: 'Cannot edit a system message' });
    }

    const group = await requireGroupMember(String(message.groupId), userId);
    const isSender = String(message.senderId) === String(userId);
    const allowed = isSender || isAdmin(group, userId);
    if (!allowed) {
      return res.status(403).json({ error: 'Not allowed to edit this message' });
    }

    await GroupMessage.updateOne(
      { _id: messageId },
      { $set: { content: sanitizedContent, edited: true, editedAt: new Date() } },
    ).exec();

    const updated = await GroupMessage.findById(messageId)
      .select('_id groupId senderId content type timestamp status edited deleted editedAt')
      .lean()
      .exec();

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${message.groupId}`).emit('group:message:edited', {
        groupId: String(message.groupId),
        messageId,
        userId,
        content: updated.content,
        editedAt: updated.editedAt || null,
      });
    }

    return res.status(200).json({
      id: String(updated._id),
      groupId: String(updated.groupId),
      senderId: String(updated.senderId),
      content: updated.content,
      type: updated.type,
      timestamp: updated.timestamp,
      status: updated.status,
      edited: !!updated.edited,
      editedAt: updated.editedAt || null,
      deleted: !!updated.deleted,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('PATCH /group/messages/:messageId error', err);
    return res.status(status).json({ error: err.message || 'Failed to edit message' });
  }
});

// POST /group/messages/:messageId/reactions (add/remove/toggle emoji reactions)
// Body: { emoji: string, action?: 'add' | 'remove' }
router.post('/group/messages/:messageId/reactions', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;
    const { emoji, action } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid messageId' });
    }
    if (!emoji || typeof emoji !== 'string') {
      return res.status(400).json({ error: 'emoji is required' });
    }

    const cleanEmoji = emoji.trim().slice(0, 16);
    if (!cleanEmoji) {
      return res.status(400).json({ error: 'emoji is required' });
    }

    const message = await GroupMessage.findById(messageId)
      .select('groupId deleted reactions')
      .lean()
      .exec();

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (message.deleted) {
      return res.status(400).json({ error: 'Cannot react to a deleted message' });
    }

    await requireGroupMember(String(message.groupId), userId);

    const existing = Array.isArray(message.reactions) ? message.reactions : [];
    const idx = existing.findIndex((r) => r && r.emoji === cleanEmoji);
    const userExists = idx !== -1 && Array.isArray(existing[idx].userIds) && existing[idx].userIds.some((u) => String(u) === String(userId));

    const desiredAction = action ? String(action) : 'toggle';
    if (!['add', 'remove', 'toggle'].includes(desiredAction)) {
      return res.status(400).json({ error: "action must be 'add' | 'remove' | 'toggle'" });
    }

    if (desiredAction === 'remove') {
      if (idx !== -1 && userExists) {
        existing[idx].userIds = existing[idx].userIds.filter((u) => String(u) !== String(userId));
      }
    } else if (desiredAction === 'add') {
      if (idx === -1) {
        existing.push({ emoji: cleanEmoji, userIds: [userId] });
      } else if (!userExists) {
        existing[idx].userIds = Array.from(new Set([...(existing[idx].userIds || []), userId]));
      }
    } else {
      // toggle
      if (idx === -1) {
        existing.push({ emoji: cleanEmoji, userIds: [userId] });
      } else if (userExists) {
        existing[idx].userIds = existing[idx].userIds.filter((u) => String(u) !== String(userId));
      } else {
        existing[idx].userIds = Array.from(new Set([...(existing[idx].userIds || []), userId]));
      }
    }

    // Remove empty reaction buckets and normalize userIds to strings for the client.
    const sanitizedReactions = existing.filter((r) => Array.isArray(r.userIds) && r.userIds.length > 0);
    const normalizedReactions = sanitizedReactions.map((r) => ({
      emoji: r.emoji,
      userIds: (r.userIds || []).map((u) => String(u)),
    }));

    await GroupMessage.updateOne(
      { _id: messageId },
      { $set: { reactions: sanitizedReactions } },
    ).exec();

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${message.groupId}`).emit('group:message:reactions', {
        groupId: String(message.groupId),
        messageId,
        userId,
        emoji: cleanEmoji,
        reactions: normalizedReactions,
      });
    }

    return res.status(200).json({
      ok: true,
      messageId,
      reactions: normalizedReactions,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('POST /group/messages/:messageId/reactions error', err);
    return res.status(status).json({ error: err.message || 'Failed to update reactions' });
  }
});

// GET /group/messages/:groupId?limit=&cursor=
router.get('/group/messages/:groupId', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const { limit, cursor } = req.query;

    const group = await requireGroupMember(groupId, userId);

    const pageSize = Math.min(parseInt(limit, 10) || 50, 100);
    const query = { groupId };

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
      query.$or = [
        { timestamp: { $lt: decoded.timestamp } },
        { timestamp: decoded.timestamp, _id: { $lt: decoded.id } },
      ];
    }

    const docs = await GroupMessage.find(query)
      .sort({ timestamp: -1, _id: -1 })
      .limit(pageSize + 1)
      .lean()
      .exec();

    let nextCursor = null;
    let items = docs;
    if (docs.length > pageSize) {
      items = docs.slice(0, pageSize);
      const last = items[items.length - 1];
      nextCursor = encodeCursor({ timestamp: last.timestamp, id: last._id });
    }

    const allAttachmentIds = Array.from(
      new Set(items.flatMap((m) => (m.attachments || []).map((id) => String(id)))),
    );

    let fileMap = new Map();
    if (allAttachmentIds.length > 0) {
      const files = await FileAsset.find({
        _id: { $in: allAttachmentIds },
      })
        .select('_id cloudinarySecureUrl cloudinaryUrl mimeType originalName')
        .lean()
        .exec();

      fileMap = new Map(files.map((f) => [String(f._id), f]));
    }

    const replyToIds = Array.from(
      new Set(items.map((m) => (m.replyTo ? String(m.replyTo) : null)).filter(Boolean)),
    );

    let replyToMap = new Map();
    if (replyToIds.length > 0) {
      const parents = await GroupMessage.find({
        _id: { $in: replyToIds },
      })
        .select('_id senderId content')
        .lean()
        .exec();

      replyToMap = new Map(
        parents.map((p) => [
          String(p._id),
          {
            id: String(p._id),
            sender: p.senderId ? String(p.senderId) : null,
            content: p.content,
          },
        ]),
      );
    }

    const messages = items.map((m) => ({
      id: String(m._id),
      channel: String(m.groupId),
      sender: String(m.senderId),
      content: m.content,
      type: m.type,
      status: m.status,
      attachments: (m.attachments || []).map(String),
      attachmentDetails: (m.attachments || [])
        .map((id) => {
          const file = fileMap.get(String(id));
          if (!file) return null;
          return {
            id: String(id),
            url: file.cloudinarySecureUrl || file.cloudinaryUrl || null,
            mimeType: file.mimeType,
            fileName: file.originalName || null,
          };
        })
        .filter(Boolean),
      createdAt: m.timestamp,
      editedAt: m.editedAt || null,
      deleted: !!m.deleted,
      reactions: (m.reactions || []).map((r) => ({
        emoji: r.emoji,
        userIds: (r.userIds || []).map(String),
      })),
      replyTo: m.replyTo ? replyToMap.get(String(m.replyTo)) || { id: String(m.replyTo), sender: null, content: null } : null,
    }));

    return res.status(200).json({
      group: {
        groupId: group.groupId,
        groupName: group.groupName,
        members: group.members || [],
        admins: group.admins || [],
      },
      messages,
      nextCursor,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) {
      console.error('GET /group/messages/:groupId error', err);
    }
    return res.status(status).json({ error: err.message || 'Failed to fetch group messages' });
  }
});

// POST /group/messages/:groupId/read
// Intended to be called when user opens the group chat.
router.post('/group/messages/:groupId/read', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;

    const group = await requireGroupMember(groupId, userId);
    const memberCount = Array.isArray(group.members) ? group.members.length : 0;

    const upToTimestampRaw = req.body && req.body.upToTimestamp;
    const upToTimestamp = upToTimestampRaw ? new Date(upToTimestampRaw) : new Date();
    if (Number.isNaN(upToTimestamp.getTime())) {
      return res.status(400).json({ error: 'upToTimestamp must be a valid date' });
    }

    const filter = { groupId, deleted: false, timestamp: { $lte: upToTimestamp } };

    const addRes = await GroupMessage.updateMany(filter, {
      $addToSet: { readBy: userId },
    }).exec();

    // If all group members are in readBy, mark overall status as "read".
    await GroupMessage.updateMany(
      { groupId, deleted: false, status: { $ne: 'read' }, $expr: { $eq: [{ $size: '$readBy' }, memberCount] } },
      { $set: { status: 'read' } },
    ).exec();

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('group:message:read', {
        groupId: String(groupId),
        userId: String(userId),
        upToTimestamp: upToTimestamp.toISOString(),
      });
    }

    return res.status(200).json({
      ok: true,
      matched: addRes.matchedCount ?? addRes.n ?? 0,
      modified: addRes.modifiedCount ?? addRes.nModified ?? 0,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) {
      console.error('POST /group/messages/:groupId/read error', err);
    }
    return res.status(status).json({ error: err.message || 'Failed to update read state' });
  }
});

// POST /group/messages/:messageId/delivered
// Storage hook: client can call once it has received the message.
router.post('/group/messages/:messageId/delivered', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid messageId' });
    }

    const message = await GroupMessage.findById(messageId)
      .select('groupId deleted deliveredTo status')
      .lean()
      .exec();
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (message.deleted) {
      return res.status(200).json({ ok: true });
    }

    const group = await requireGroupMember(String(message.groupId), userId);
    const presenceArr = await Promise.all(
      (group.members || []).map((uid) => getUserPresence(String(uid))),
    );
    const onlineUserIds = (group.members || [])
      .filter((_uid, idx) => {
        const p = presenceArr[idx];
        return p && p.status && p.status !== 'offline';
      })
      .map(String);

    await GroupMessage.updateOne({ _id: messageId }, { $addToSet: { deliveredTo: userId } }).exec();

    const updated = await GroupMessage.findById(messageId).select('deliveredTo status').lean().exec();
    const deliveredToIds = new Set((updated?.deliveredTo || []).map(String));

    const allOnlineDelivered =
      onlineUserIds.length > 0 && onlineUserIds.every((uid) => deliveredToIds.has(String(uid)));

    if (allOnlineDelivered && updated?.status !== 'read') {
      await GroupMessage.updateOne(
        { _id: messageId, status: { $ne: 'read' } },
        { $set: { status: 'delivered' } },
      ).exec();
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${message.groupId}`).emit('group:message:delivered', {
        groupId: String(message.groupId),
        messageId,
        userId,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) {
      console.error('POST /group/messages/:messageId/delivered error', err);
    }
    return res.status(status).json({ error: err.message || 'Failed to update delivered state' });
  }
});

module.exports = router;

