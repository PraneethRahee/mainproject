const mongoose = require('mongoose');
const {
  ChatMessage,
  Channel,
  ChannelMember,
  GroupMessage,
  FileAsset,
  Conversation,
  MESSAGE_TYPES,
  GROUP_MESSAGE_TYPES,
} = require('../../models');
const { requireChatUnlocked } = require('../../middleware/chatLock');
const { checkRateLimit, getUserPresence } = require('../../redis');
const { enqueueNotificationEvent } = require('../../services/notificationService');
const { config } = require('../../config');
const { sanitizeContent, isBlockedPair } = require('./helpers');

module.exports = function registerMessagePostRoutes(router) {
// POST /messages
router.post('/messages', requireChatUnlocked, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      conversationId,
      senderId,
      receiverId,
      content,
      ciphertext,
      ciphertextType,
      senderDeviceId,
      receiverDeviceId,
      type,
      replyTo,
      attachmentIds,
    } = req.body || {};

    const actualSenderId = senderId ? String(senderId) : String(userId);

    if (senderId && String(senderId) !== String(userId)) {
      return res.status(403).json({ error: 'senderId must match authenticated user' });
    }

    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    // Per-user, per-conversation rate limit: e.g. 20 messages per 10 seconds
    const rateKey = `msg:${actualSenderId}:${conversationId}`;
    const rate = await checkRateLimit({ key: rateKey, limit: 20, windowSeconds: 10 });
    if (!rate.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded for sending messages' });
    }

    const channel = await Channel.findById(conversationId)
      .select('type metadata.whoCanSend metadata.disappearingMessagesSeconds')
      .lean()
      .exec();
    if (!channel || channel.isArchived) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const cleanCiphertext = typeof ciphertext === 'string' ? ciphertext.trim() : null;
    const cleanCiphertextType = typeof ciphertextType === 'string' ? ciphertextType.trim() : null;
    const isE2E = !!(cleanCiphertext && cleanCiphertextType);

    let sanitizedContent = null;
    if (!isE2E) {
      try {
        sanitizedContent = sanitizeContent(content);
      } catch (e) {
        return res.status(400).json({ error: e.message || 'Invalid content' });
      }

      if (!sanitizedContent) {
        return res.status(400).json({ error: 'content is required (or provide ciphertext + ciphertextType for E2E)' });
      }
    } else {
      if (!['signal_v1', 'signal_senderkey_v1'].includes(cleanCiphertextType)) {
        return res.status(400).json({ error: "ciphertextType must be 'signal_v1' (dm) or 'signal_senderkey_v1' (group)" });
      }
      const MAX_CIPHERTEXT = 20000;
      if (cleanCiphertext.length > MAX_CIPHERTEXT) {
        return res.status(400).json({ error: `ciphertext exceeds maximum length of ${MAX_CIPHERTEXT}` });
      }
    }

    const membership = await ChannelMember.findOne({
      channel: conversationId,
      user: actualSenderId,
    })
      .select('channel user canPost isAdmin')
      .lean()
      .exec();

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }
    // Phase 3: Enforce whoCanSend for group chats.
    // - If `whoCanSend` is unset, keep legacy behavior (`membership.canPost`).
    // - If `whoCanSend === 'adminsOnly'`, only group admins can post.
    // - If `whoCanSend === 'everyone'`, any member can post.
    const whoCanSend = channel?.metadata?.whoCanSend;
    let canPostEffective = Boolean(membership.canPost);
    if (whoCanSend === 'adminsOnly') {
      canPostEffective = Boolean(membership.canPost) && Boolean(membership.isAdmin);
    } else if (whoCanSend === 'everyone') {
      canPostEffective = Boolean(membership.canPost);
    }
    if (!canPostEffective) {
      return res.status(403).json({ error: 'Not allowed to post in this conversation' });
    }

    // Private 1-to-1 (WhatsApp-style) uses ChatMessage (+ receiverId + sent/delivered/read).
    const isPrivateLike = channel.type === 'private' || channel.type === 'dm';
    const isGroupLike = channel.type === 'group';

    if (isPrivateLike) {
      if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
        return res.status(400).json({ error: 'receiverId is required for private conversations' });
      }

      const receiverIdStr = String(receiverId);
      if (receiverIdStr === String(actualSenderId)) {
        return res.status(400).json({ error: 'receiverId must be different from senderId' });
      }

      // Validate receiver belongs to the same conversation.
      const receiverMembership = await ChannelMember.findOne({
        channel: conversationId,
        user: receiverIdStr,
      })
        .select('_id')
        .lean()
        .exec();

      if (!receiverMembership) {
        return res.status(403).json({ error: 'receiverId is not a participant in this conversation' });
      }

      // Enforce "unique per 2 users" shape: exactly 2 members and they must be sender+receiver.
      const participantDocs = await ChannelMember.find({ channel: conversationId }).select('user').lean().exec();
      const participantIds = participantDocs.map((d) => String(d.user));
      if (participantIds.length !== 2) {
        return res.status(400).json({ error: 'Private conversations must have exactly 2 participants' });
      }
      if (!participantIds.includes(String(actualSenderId)) || !participantIds.includes(receiverIdStr)) {
        return res.status(400).json({ error: 'senderId/receiverId must match the conversation participants' });
      }

      // Phase 4: Block list enforcement (DM only).
      // If either side blocks the other, we treat the DM as blocked context.
      const dmBlocked = await isBlockedPair(String(actualSenderId), String(receiverIdStr));
      if (dmBlocked) {
        return res.status(403).json({ error: 'You cannot send messages to this user' });
      }

      const messageType = type ? String(type) : 'text';
      if (!MESSAGE_TYPES.includes(messageType)) {
        return res.status(400).json({ error: `type must be one of: ${MESSAGE_TYPES.join(', ')}` });
      }

      const disappearingSeconds = Number(channel?.metadata?.disappearingMessagesSeconds) || 0;
      const expiresAt =
        disappearingSeconds > 0 && messageType !== 'system'
          ? new Date(Date.now() + disappearingSeconds * 1000)
          : null;

      let replyToId = null;
      let replyToInfo = null;
      if (replyTo) {
        if (!mongoose.Types.ObjectId.isValid(replyTo)) {
          return res.status(400).json({ error: 'replyTo must be a valid message id' });
        }
        const parent = await ChatMessage.findOne({
          _id: replyTo,
          conversationId,
          deleted: false,
          deletedFor: { $ne: actualSenderId },
        })
          .select('_id senderId content')
          .lean()
          .exec();

        if (!parent) {
          return res.status(400).json({ error: 'replyTo must reference a non-deleted message in this conversation' });
        }
        replyToId = parent._id;
        replyToInfo = {
          id: String(parent._id),
          senderId: parent.senderId ? String(parent.senderId) : null,
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

      if (isE2E && cleanCiphertextType !== 'signal_v1') {
        return res.status(400).json({ error: "ciphertextType must be 'signal_v1' for dm messages" });
      }

      const message = await ChatMessage.create({
        conversationId,
        senderId: actualSenderId,
        receiverId: receiverIdStr,
        content: isE2E ? null : sanitizedContent,
        ciphertext: isE2E ? cleanCiphertext : null,
        ciphertextType: isE2E ? cleanCiphertextType : null,
        senderDeviceId: senderDeviceId ? String(senderDeviceId).trim().slice(0, 64) : 'web:1',
        receiverDeviceId: receiverDeviceId ? String(receiverDeviceId).trim().slice(0, 64) : 'web:1',
        attachments,
        type: messageType,
        expiresAt,
        replyTo: replyToId,
        status: 'sent',
        deliveredAt: null,
        readAt: null,
        edited: false,
        deleted: false,
        isPinned: false,
        isStarredBy: [],
      });

      // Keep channel + conversation list metadata in sync for chat list screens.
      await Channel.findByIdAndUpdate(conversationId, { $set: { lastMessageAt: new Date() } }).exec();
      await Conversation.updateOne(
        { channel: conversationId },
        { $set: { lastMessageId: message._id, lastMessageAt: message.timestamp } },
      ).exec();

      const payloadOut = {
        id: String(message._id),
        channelId: String(message.conversationId),
        kind: 'dm',
        senderId: String(message.senderId),
        receiverId: String(message.receiverId),
        encryption: message.ciphertextType ? { mode: message.ciphertextType } : { mode: 'none' },
        content: message.content,
        ciphertext: message.ciphertext || null,
        ciphertextType: message.ciphertextType || null,
        attachments: (message.attachments || []).map(String),
        attachmentDetails,
        type: message.type,
        timestamp: message.timestamp,
        status: message.status,
        deliveredAt: message.deliveredAt,
        readAt: message.readAt,
        edited: message.edited,
        deleted: message.deleted,
        isPinned: !!message.isPinned,
        isStarred: false,
        expiresAt: message.expiresAt || null,
        replyTo: replyToId ? replyToInfo : null,
      };

      const io = req.app.get('io');
      if (io) {
        io.to(`channel:${conversationId}`).emit('message:new', payloadOut);
      }

      // Phase 5: Offline notification event for non-connected recipients.
      // This is intentionally conservative (presence-based) and relies on the notification worker
      // for mute filtering and durable inbox delivery.
      try {
        if (config.featurePushNotificationsEnabled) {
          const recipientPresence = await getUserPresence(receiverIdStr);
          const recipientOffline = !recipientPresence || recipientPresence.status === 'offline';

          if (recipientOffline) {
            await enqueueNotificationEvent({
              type: 'message',
              createdBy: actualSenderId,
              recipientUserIds: [receiverIdStr],
              payload: {
                kind: 'dm',
                messageId: String(message._id),
                conversationId: String(message.conversationId),
                senderId: String(message.senderId),
                receiverId: receiverIdStr,
                contentPreview: isE2E ? null : sanitizedContent,
                // Clients can fall back to generic copy if preview is null.
              },
            });
          }
        }
      } catch (err) {
        // Notification enqueue must never break message send.
        console.error('enqueueNotificationEvent (dm) failed', err);
      }

      return res.status(201).json(payloadOut);
    }

    // Group messages: keep existing behavior via GroupMessage collection.
    if (isGroupLike) {
      const desiredType = type ? String(type) : null;
      if (desiredType && !GROUP_MESSAGE_TYPES.includes(desiredType)) {
        return res.status(400).json({ error: `type must be one of: ${GROUP_MESSAGE_TYPES.join(', ')}` });
      }

      let replyToId = null;
      let replyToInfo = null;
      if (replyTo) {
        if (!mongoose.Types.ObjectId.isValid(replyTo)) {
          return res.status(400).json({ error: 'replyTo must be a valid message id' });
        }
        const parent = await GroupMessage.findOne({
          _id: replyTo,
          groupId: conversationId,
          deleted: false,
        })
          .select('_id senderId content')
          .lean()
          .exec();
        if (!parent) {
          return res.status(400).json({ error: 'replyTo must reference a non-deleted group message' });
        }
        replyToId = parent._id;
        replyToInfo = {
          id: String(parent._id),
          senderId: parent.senderId ? String(parent.senderId) : null,
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

      const inferredTypeFromAttachments = () => {
        if (!attachmentDetails || attachmentDetails.length === 0) return 'text';
        const mimes = attachmentDetails.map((f) => String(f.mimeType || '').toLowerCase());
        if (mimes.some((m) => m.startsWith('image/'))) return 'image';
        if (mimes.some((m) => m.startsWith('video/'))) return 'video';
        return 'file';
      };

      const messageType = desiredType || inferredTypeFromAttachments();

      const disappearingSeconds = Number(channel?.metadata?.disappearingMessagesSeconds) || 0;
      const expiresAt =
        disappearingSeconds > 0 && messageType !== 'system'
          ? new Date(Date.now() + disappearingSeconds * 1000)
          : null;

      if (isE2E && cleanCiphertextType !== 'signal_senderkey_v1') {
        return res.status(400).json({ error: "ciphertextType must be 'signal_senderkey_v1' for group messages" });
      }

      const message = await GroupMessage.create({
        groupId: conversationId,
        senderId: actualSenderId,
        content: isE2E ? null : sanitizedContent,
        ciphertext: isE2E ? cleanCiphertext : null,
        ciphertextType: isE2E ? cleanCiphertextType : null,
        type: messageType,
        expiresAt,
        status: 'sent',
        edited: false,
        editedAt: null,
        deleted: false,
        deliveredTo: [actualSenderId],
        readBy: [actualSenderId],
        replyTo: replyToId,
        attachments,
        reactions: [],
        isPinned: false,
        isStarredBy: [],
      });

      const payloadOut = {
        id: String(message._id),
        channelId: String(message.groupId),
        kind: 'group',
        senderId: String(message.senderId),
        receiverId: null,
        encryption: message.ciphertextType ? { mode: message.ciphertextType } : { mode: 'none' },
        content: message.content,
        ciphertext: message.ciphertext || null,
        ciphertextType: message.ciphertextType || null,
        attachments: (message.attachments || []).map(String),
        attachmentDetails,
        type: message.type,
        timestamp: message.timestamp,
        status: message.status,
        edited: !!message.edited,
        deleted: !!message.deleted,
        isPinned: !!message.isPinned,
        isStarred: false,
        expiresAt: message.expiresAt || null,
        replyTo: replyToId ? replyToInfo : null,
      };

      const io = req.app.get('io');
      if (io) {
        io.to(`channel:${conversationId}`).emit('message:new', payloadOut);
      }

      // Phase 5: Offline notification event for non-connected group recipients.
      // We batch by sending a single event with many recipients; the worker will create
      // per-user inbox notifications and apply mute filtering.
      try {
        if (config.featurePushNotificationsEnabled) {
          const members = await ChannelMember.find({ channel: conversationId })
            .select('user')
            .lean()
            .exec();
          const recipientUserIds = members
            .map((m) => String(m.user))
            .filter((uid) => uid && uid !== String(actualSenderId));

          if (recipientUserIds.length > 0) {
            const presenceArr = await Promise.all(recipientUserIds.map((uid) => getUserPresence(uid)));
            const offlineUserIds = recipientUserIds.filter((uid, idx) => {
              const p = presenceArr[idx];
              return !p || p.status === 'offline';
            });

            if (offlineUserIds.length > 0) {
              const blockedFlags = await Promise.all(
                offlineUserIds.map((uid) => isBlockedPair(String(actualSenderId), String(uid))),
              );
              const allowedRecipients = offlineUserIds.filter((_uid, idx) => !blockedFlags[idx]);

              if (allowedRecipients.length > 0) {
                await enqueueNotificationEvent({
                  type: 'message',
                  createdBy: actualSenderId,
                  recipientUserIds: allowedRecipients,
                  payload: {
                    kind: 'group',
                    messageId: String(message._id),
                    conversationId: String(message.groupId),
                    senderId: String(message.senderId),
                    contentPreview: isE2E ? null : sanitizedContent,
                  },
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('enqueueNotificationEvent (group) failed', err);
      }

      return res.status(201).json(payloadOut);
    }

    return res.status(400).json({ error: `Unsupported channel type: ${channel.type}` });
  } catch (err) {
    console.error('POST /messages error', err);
    return res.status(500).json({ error: 'Failed to store message' });
  }
});
};
