const mongoose = require('mongoose');
const {
  ChatMessage,
  Channel,
  ChannelMember,
  GroupMessage,
  FileAsset,
  Conversation,
  ConversationUserState,
} = require('../../models');
const { requireChatUnlocked } = require('../../middleware/chatLock');
const {
  encodeCursor,
  decodeCursor,
  getBlockedUserIds,
  isBlockedPair,
} = require('./helpers');

module.exports = function registerMessageListAndMediaRoutes(router) {
// GET /messages/:conversationId?limit=&cursor=
router.get('/messages/:conversationId', requireChatUnlocked, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.conversationId;
    const { limit, cursor } = req.query;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversationId' });
    }

    const channel = await Channel.findById(conversationId).select('type').lean().exec();
    if (!channel || channel.isArchived) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const membership = await ChannelMember.findOne({
      channel: conversationId,
      user: userId,
    })
      .select('channel user')
      .lean()
      .exec();

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    const pageSize = Math.min(parseInt(limit, 10) || 50, 100);
    const isPrivateLike = channel.type === 'private' || channel.type === 'dm';
    const isGroupLike = channel.type === 'group';

    if (isPrivateLike) {
      // Phase 4: block list enforcement (DM only).
      // If either side blocks the other, hide the DM thread content.
      const participantDocs = await ChannelMember.find({ channel: conversationId }).select('user').lean().exec();
      const participantIds = participantDocs.map((d) => String(d.user));
      const otherUserId = participantIds.find((id) => id !== String(userId)) || null;
      if (otherUserId) {
        const dmBlocked = await isBlockedPair(String(userId), otherUserId);
        if (dmBlocked) {
          return res.status(200).json({ messages: [], nextCursor: null });
        }
      }

      // Cursor-based pagination (latest messages first)
      const query = { conversationId, deleted: false, deletedFor: { $ne: userId } };
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

      // Status updates are opt-in for fetch consistency.
      // Prefer the explicit hooks:
      // - POST /messages/:messageId/delivered
      // - POST /messages/:messageId/read
      //
      // If clients still want server-side bulk updates on fetch, they must request them:
      // - ?markDelivered=true  -> sent -> delivered (for receiver)
      // - ?markRead=true       -> sent/delivered -> read (for receiver)
      const markDelivered = String(req.query.markDelivered ?? '').toLowerCase() === 'true';
      const markRead = String(req.query.markRead ?? '').toLowerCase() === 'true';

      if (markDelivered) {
        await ChatMessage.updateMany(
          { conversationId, receiverId: userId, deleted: false, deletedFor: { $ne: userId }, status: 'sent' },
          { $set: { status: 'delivered', deliveredAt: new Date() } },
        ).exec();
      }

      if (markRead) {
        await ChatMessage.updateMany(
          {
            conversationId,
            receiverId: userId,
            deleted: false,
            deletedFor: { $ne: userId },
            status: { $in: ['sent', 'delivered'] },
          },
          { $set: { status: 'read', deliveredAt: new Date(), readAt: new Date() } },
        ).exec();
      }

      // Optional per-user conversation state updates for chat list metadata.
      if (markRead || markDelivered) {
        const convo = await Conversation.findOne({ channel: conversationId })
          .select('_id')
          .lean()
          .exec();
        if (convo && convo._id) {
          const now = new Date();
          const $set = {};
          if (markDelivered) $set.lastSeenAt = now;
          if (markRead) {
            $set.lastSeenAt = now;
            $set.lastReadAt = now;
          }
          await ConversationUserState.updateOne(
            { conversation: convo._id, user: userId },
            { $set, $setOnInsert: { conversation: convo._id, user: userId } },
            { upsert: true },
          ).exec();
        }
      }

      const docs = await ChatMessage.find(query)
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

      const attachmentIdSet = new Set(
        items.flatMap((m) => (m.attachments || []).map((id) => String(id))),
      );

      let fileMap = new Map();
      const attachmentIdsArr = Array.from(attachmentIdSet);
      if (attachmentIdsArr.length > 0) {
        const files = await FileAsset.find({ _id: { $in: attachmentIdsArr } })
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
        const parents = await ChatMessage.find({
          _id: { $in: replyToIds },
          deleted: false,
          deletedFor: { $ne: userId },
        })
          .select('_id senderId content')
          .lean()
          .exec();

        replyToMap = new Map(
          parents.map((p) => [
            String(p._id),
            {
              id: String(p._id),
              senderId: p.senderId ? String(p.senderId) : null,
              content: p.content,
            },
          ]),
        );
      }

      const now = new Date();
      const EXPIRED_PLACEHOLDER = 'This message has disappeared';

      const messages = items.map((m) => {
        const expired = m.expiresAt && m.expiresAt <= now && m.type !== 'system';
        const isStarredByMe =
          !expired &&
          Array.isArray(m.isStarredBy) &&
          m.isStarredBy.some((id) => String(id) === String(userId));

        return {
          id: String(m._id),
          channelId: String(m.conversationId),
          kind: 'dm',
          senderId: String(m.senderId),
          receiverId: m.receiverId ? String(m.receiverId) : null,
          encryption: expired ? { mode: 'none' } : m.ciphertextType ? { mode: m.ciphertextType } : { mode: 'none' },
          content: expired ? EXPIRED_PLACEHOLDER : m.content,
          ciphertext: expired ? null : m.ciphertext || null,
          ciphertextType: expired ? null : m.ciphertextType || null,
          attachments: expired ? [] : (m.attachments || []).map(String),
          attachmentDetails: expired
            ? []
            : (m.attachments || [])
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
          type: expired ? 'system' : m.type,
          expiresAt: expired ? null : m.expiresAt || null,
          timestamp: m.timestamp,
          status: expired ? 'sent' : m.status,
          deliveredAt: expired ? null : m.deliveredAt || null,
          readAt: expired ? null : m.readAt || null,
          edited: expired ? false : !!m.edited,
          deleted: !!m.deleted,
          isPinned: expired ? false : !!m.isPinned,
          isStarred: isStarredByMe,
          replyTo: expired
            ? null
            : m.replyTo
              ? replyToMap.get(String(m.replyTo)) || { id: String(m.replyTo), senderId: null, content: null }
              : null,
        };
      });

      return res.status(200).json({ messages, nextCursor });
    }

    if (isGroupLike) {
      // Phase 4: block list enforcement (group).
      // Hide messages from users the viewer blocked OR users who blocked the viewer.
      const blockedSenderIds = await getBlockedUserIds(userId);
      const query = { groupId: conversationId, deleted: false };
      if (blockedSenderIds.length > 0) {
        query.senderId = { $nin: blockedSenderIds };
      }
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

      const attachmentIdSet = new Set(items.flatMap((m) => (m.attachments || []).map((id) => String(id))));
      const attachmentIdsArr = Array.from(attachmentIdSet);
      let fileMap = new Map();
      if (attachmentIdsArr.length > 0) {
        const files = await FileAsset.find({ _id: { $in: attachmentIdsArr } })
          .select('_id cloudinarySecureUrl cloudinaryUrl mimeType originalName')
          .lean()
          .exec();
        fileMap = new Map(files.map((f) => [String(f._id), f]));
      }

      const replyToIds = Array.from(new Set(items.map((m) => (m.replyTo ? String(m.replyTo) : null)).filter(Boolean)));
      let replyToMap = new Map();
      if (replyToIds.length > 0) {
        const parents = await GroupMessage.find({ _id: { $in: replyToIds } })
          .select('_id senderId content')
          .lean()
          .exec();
        replyToMap = new Map(
          parents.map((p) => [
            String(p._id),
            { id: String(p._id), senderId: p.senderId ? String(p.senderId) : null, content: p.content },
          ]),
        );
      }

      const now = new Date();
      const EXPIRED_PLACEHOLDER = 'This message has disappeared';

      const messages = items.map((m) => {
        const expired = m.expiresAt && m.expiresAt <= now && m.type !== 'system';
        const isStarredByMe =
          !expired &&
          Array.isArray(m.isStarredBy) &&
          m.isStarredBy.some((id) => String(id) === String(userId));

        return {
          id: String(m._id),
          channelId: String(m.groupId),
          kind: 'group',
          senderId: String(m.senderId),
          receiverId: null,
          encryption: expired ? { mode: 'none' } : m.ciphertextType ? { mode: m.ciphertextType } : { mode: 'none' },
          content: expired ? EXPIRED_PLACEHOLDER : m.content,
          ciphertext: expired ? null : m.ciphertext || null,
          ciphertextType: expired ? null : m.ciphertextType || null,
          attachments: expired ? [] : (m.attachments || []).map(String),
          attachmentDetails: expired
            ? []
            : (m.attachments || [])
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
          type: expired ? 'system' : m.type,
          expiresAt: expired ? null : m.expiresAt || null,
          timestamp: m.timestamp,
          status: expired ? 'sent' : m.status,
          edited: expired ? false : !!m.edited,
          deleted: !!m.deleted,
          isPinned: expired ? false : !!m.isPinned,
          isStarred: isStarredByMe,
          replyTo: expired
            ? null
            : m.replyTo
              ? replyToMap.get(String(m.replyTo)) || { id: String(m.replyTo), senderId: null, content: null }
              : null,
        };
      });

      return res.status(200).json({ messages, nextCursor });
    }

    return res.status(400).json({ error: `Unsupported channel type: ${channel.type}` });
  } catch (err) {
    console.error('GET /messages/:conversationId error', err);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// GET /messages/:conversationId/media?section=images|videos|documents|links&limit=&cursor=
// Read-only media feed for chat info panel.
router.get('/messages/:conversationId/media', requireChatUnlocked, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.conversationId;
    const { limit, cursor, section, type } = req.query;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversationId' });
    }

    const channel = await Channel.findById(conversationId).select('type isArchived').lean().exec();
    if (!channel || channel.isArchived) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const membership = await ChannelMember.findOne({ channel: conversationId, user: userId })
      .select('channel user')
      .lean()
      .exec();

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    const pageSize = Math.min(parseInt(limit, 10) || 20, 100);
    // Backward/wording compatibility: docs call this "filter type".
    const sectionStr = (section ? section : type ? type : 'all').toString().toLowerCase();
    const allowedSections = ['all', 'images', 'videos', 'documents', 'links', 'audio'];
    if (!allowedSections.includes(sectionStr)) {
      return res.status(400).json({ error: `section must be one of: ${allowedSections.join(', ')}` });
    }

    const needsAttachments = ['images', 'videos', 'documents', 'audio', 'all'].includes(sectionStr);
    const needsLinks = ['links', 'all'].includes(sectionStr);

    const isPrivateLike = channel.type === 'private' || channel.type === 'dm';
    const isGroupLike = channel.type === 'group';

    if (!isPrivateLike && !isGroupLike) {
      return res.status(400).json({ error: `Unsupported channel type: ${channel.type}` });
    }

    if (isPrivateLike) {
      // Phase 4: block list enforcement (DM only).
      const participantDocs = await ChannelMember.find({ channel: conversationId }).select('user').lean().exec();
      const participantIds = participantDocs.map((d) => String(d.user));
      const otherUserId = participantIds.find((id) => id !== String(userId)) || null;
      if (otherUserId) {
        const dmBlocked = await isBlockedPair(String(userId), otherUserId);
        if (dmBlocked) return res.status(200).json({ items: [], nextCursor: null });
      }
    }

    const query = isPrivateLike
      ? { conversationId, deleted: false, deletedFor: { $ne: userId } }
      : { groupId: conversationId, deleted: false };

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

    if (isGroupLike) {
      // Phase 4: block list enforcement (group).
      const blockedSenderIds = await getBlockedUserIds(userId);
      if (blockedSenderIds.length > 0) {
        query.senderId = { $nin: blockedSenderIds };
      }
    }

    // Phase 4: Disappearing messages - exclude expired messages from the media feed.
    // (If a worker hasn't converted them yet, they still have content/attachments. We hide them here.)
    const now = new Date();
    query.$and = query.$and || [];
    query.$and.push({
      $or: [
        { type: 'system' },
        { expiresAt: null },
        { expiresAt: { $gt: now } },
      ],
    });

    const docs = await (isPrivateLike ? ChatMessage : GroupMessage)
      .find(query)
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

    const attachmentKindFromMime = (mimeType) => {
      const m = String(mimeType || '').toLowerCase();
      if (m.startsWith('image/')) return 'image';
      if (m.startsWith('video/')) return 'video';
      if (m.startsWith('audio/')) return 'audio';
      if (m) return 'document';
      return 'document';
    };

    const matchesSection = (kind) => {
      if (sectionStr === 'all') return true;
      if (sectionStr === 'images') return kind === 'image';
      if (sectionStr === 'videos') return kind === 'video';
      if (sectionStr === 'audio') return kind === 'audio';
      if (sectionStr === 'documents') return kind === 'document';
      if (sectionStr === 'links') return kind === 'link';
      return false;
    };

    const attachmentIdSet = new Set();
    if (needsAttachments) {
      for (const m of items) {
        if (Array.isArray(m.attachments)) {
          for (const id of m.attachments) attachmentIdSet.add(String(id));
        }
      }
    }

    let fileMap = new Map();
    if (needsAttachments && attachmentIdSet.size > 0) {
      const attachmentIdsArr = Array.from(attachmentIdSet);
      const files = await FileAsset.find({ _id: { $in: attachmentIdsArr } })
        .select('_id cloudinarySecureUrl cloudinaryUrl mimeType originalName')
        .lean()
        .exec();
      fileMap = new Map(files.map((f) => [String(f._id), f]));
    }

    const extractLinks = (content) => {
      const text = typeof content === 'string' ? content : '';
      if (!text) return [];
      const rawMatches = text.match(/https?:\/\/[^\s<>"']+/g) || [];

      const out = [];
      const seen = new Set();
      for (const raw of rawMatches) {
        // Trim common trailing punctuation/brackets that often gets included in chat text.
        const cleaned = raw.replace(/[)\]\}\.,!?;:]+$/g, '');
        try {
          const u = new URL(cleaned);
          if (!['http:', 'https:'].includes(u.protocol)) continue;
          const key = u.toString();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(key);
        } catch {
          // ignore invalid URLs
        }
      }
      return out;
    };

    const mediaItems = [];

    for (const m of items) {
      const messageId = String(m._id);
      const createdAt = m.timestamp;
      const senderId = String(m.senderId);

      if (needsAttachments && Array.isArray(m.attachments) && m.attachments.length > 0) {
        for (const attachmentId of m.attachments) {
          const file = fileMap.get(String(attachmentId));
          if (!file) continue;
          const kind = attachmentKindFromMime(file.mimeType);
          if (!matchesSection(kind)) continue;

          mediaItems.push({
            id: `att:${messageId}:${String(attachmentId)}`,
            fileId: String(attachmentId),
            messageId,
            kind: kind === 'image' ? 'image' : kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'document',
            url: file.cloudinarySecureUrl || file.cloudinaryUrl || null,
            mimeType: file.mimeType,
            fileName: file.originalName || null,
            createdAt,
            senderId,
          });
        }
      }

      if (needsLinks) {
        const links = extractLinks(m.content);
        for (const url of links) {
          if (!matchesSection('link')) continue;
          mediaItems.push({
            id: `link:${messageId}:${url}`,
            messageId,
            kind: 'link',
            url,
            mimeType: 'text/uri-list',
            fileName: null,
            createdAt,
            senderId,
          });
        }
      }
    }

    return res.status(200).json({ items: mediaItems, nextCursor });
  } catch (err) {
    console.error('GET /messages/:conversationId/media error', err);
    return res.status(500).json({ error: 'Failed to fetch media' });
  }
});
};
