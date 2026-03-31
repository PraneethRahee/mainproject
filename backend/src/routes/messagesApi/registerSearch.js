const mongoose = require('mongoose');
const { Channel, ChannelMember, ChatMessage, GroupMessage } = require('../../models');
const { requireChatUnlocked } = require('../../middleware/chatLock');
const { escapeRegex, getBlockedUserIds, isBlockedPair } = require('./helpers');

module.exports = function registerMessageSearchRoutes(router) {
// GET /messages/:conversationId/search?q=&limit=
router.get('/messages/:conversationId/search', requireChatUnlocked, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.conversationId;
    const q = String(req.query.q || '').trim();
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 20, 50);

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversationId' });
    }
    if (!q) {
      return res.status(400).json({ error: 'q is required' });
    }

    const channel = await Channel.findById(conversationId).select('type isArchived').lean().exec();
    if (!channel || channel.isArchived) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const membership = await ChannelMember.findOne({ channel: conversationId, user: userId })
      .select('_id')
      .lean()
      .exec();
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    const pattern = new RegExp(escapeRegex(q), 'i');
    const isPrivateLike = channel.type === 'private' || channel.type === 'dm';
    const isGroupLike = channel.type === 'group';

    if (isPrivateLike) {
      // Phase 4: block list enforcement (DM only).
      const participantDocs = await ChannelMember.find({ channel: conversationId }).select('user').lean().exec();
      const participantIds = participantDocs.map((d) => String(d.user));
      const otherUserId = participantIds.find((id) => id !== String(userId)) || null;
      if (otherUserId) {
        const dmBlocked = await isBlockedPair(String(userId), otherUserId);
        if (dmBlocked) return res.status(200).json({ messages: [] });
      }

      const now = new Date();
      const EXPIRED_PLACEHOLDER = 'This message has disappeared';

      const docs = await ChatMessage.find({
        conversationId,
        deleted: false,
        deletedFor: { $ne: userId },
        content: { $regex: pattern },
      })
        .select('_id conversationId senderId receiverId content type expiresAt timestamp status isPinned isStarredBy')
        .sort({ timestamp: -1, _id: -1 })
        .limit(limit)
        .lean()
        .exec();

      const messages = docs.map((m) => {
        const expired = m.expiresAt && m.expiresAt <= now && m.type !== 'system';
        return {
          id: String(m._id),
          channelId: String(m.conversationId),
          kind: 'dm',
          senderId: String(m.senderId),
          receiverId: m.receiverId ? String(m.receiverId) : null,
          content: expired ? EXPIRED_PLACEHOLDER : m.content || '',
          type: expired ? 'system' : m.type,
          timestamp: m.timestamp,
          status: expired ? 'sent' : m.status,
          isPinned: expired ? false : !!m.isPinned,
          isStarred: expired
            ? false
            : Array.isArray(m.isStarredBy) && m.isStarredBy.some((id) => String(id) === String(userId)),
        };
      });
      return res.status(200).json({ messages });
    }

    if (isGroupLike) {
      // Phase 4: block list enforcement (group).
      const blockedSenderIds = await getBlockedUserIds(userId);
      const now = new Date();
      const EXPIRED_PLACEHOLDER = 'This message has disappeared';

      const query = {
        groupId: conversationId,
        deleted: false,
        content: { $regex: pattern },
      };
      if (blockedSenderIds.length > 0) {
        query.senderId = { $nin: blockedSenderIds };
      }

      const docs = await GroupMessage.find(query)
        .select('_id groupId senderId content type expiresAt timestamp status isPinned isStarredBy')
        .sort({ timestamp: -1, _id: -1 })
        .limit(limit)
        .lean()
        .exec();

      const messages = docs.map((m) => {
        const expired = m.expiresAt && m.expiresAt <= now && m.type !== 'system';
        return {
          id: String(m._id),
          channelId: String(m.groupId),
          kind: 'group',
          senderId: String(m.senderId),
          receiverId: null,
          content: expired ? EXPIRED_PLACEHOLDER : m.content || '',
          type: expired ? 'system' : m.type,
          timestamp: m.timestamp,
          status: expired ? 'sent' : m.status,
          isPinned: expired ? false : !!m.isPinned,
          isStarred: expired
            ? false
            : Array.isArray(m.isStarredBy) && m.isStarredBy.some((id) => String(id) === String(userId)),
        };
      });
      return res.status(200).json({ messages });
    }

    return res.status(400).json({ error: 'Unsupported conversation type' });
  } catch (err) {
    console.error('GET /messages/:conversationId/search error', err);
    return res.status(500).json({ error: 'Failed to search messages' });
  }
});
};
