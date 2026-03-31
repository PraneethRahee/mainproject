const mongoose = require('mongoose');
const { ChatMessage, Conversation, ConversationUserState } = require('../../models');
const { requireConversationMember, requirePrivateConversationOrThrow } = require('./helpers');

module.exports = function registerMessageDeliveryReadRoutes(router) {
// POST /messages/:messageId/delivered
// Storage hook: client can call once it has received the message.
router.post('/messages/:messageId/delivered', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid messageId' });
    }

    const message = await ChatMessage.findById(messageId)
      .select('_id conversationId senderId receiverId status deleted deletedFor')
      .lean()
      .exec();

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (message.deleted) {
      return res.status(200).json({ ok: true });
    }
    if ((message.deletedFor || []).map(String).includes(String(userId))) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await requirePrivateConversationOrThrow(String(message.conversationId));

    const membership = await requireConversationMember(String(message.conversationId), userId);
    if (!membership) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    if (!message.receiverId || String(message.receiverId) !== String(userId)) {
      return res.status(403).json({ error: 'Only the receiver can mark delivered' });
    }

    await ChatMessage.updateOne(
      { _id: messageId, deleted: false, deletedFor: { $ne: userId }, status: 'sent' },
      { $set: { status: 'delivered', deliveredAt: new Date() } },
    ).exec();

    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${message.conversationId}`).emit('message:delivered', {
        channelId: String(message.conversationId),
        messageId: String(messageId),
        userId: String(userId),
        at: new Date().toISOString(),
      });
    }

    // Update per-user conversation state for chat list (seen).
    const convo = await Conversation.findOne({ channel: String(message.conversationId) })
      .select('_id')
      .lean()
      .exec();
    if (convo && convo._id) {
      const now = new Date();
      await ConversationUserState.updateOne(
        { conversation: convo._id, user: userId },
        { $set: { lastSeenAt: now }, $setOnInsert: { conversation: convo._id, user: userId } },
        { upsert: true },
      ).exec();
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('POST /messages/:messageId/delivered error', err);
    return res.status(status).json({ error: err.message || 'Failed to update delivered state' });
  }
});

// POST /messages/:messageId/read
// Intended to be called when receiver opens the private chat.
router.post('/messages/:messageId/read', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid messageId' });
    }

    const message = await ChatMessage.findById(messageId)
      .select('_id conversationId receiverId status deleted deletedFor')
      .lean()
      .exec();

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (message.deleted) {
      return res.status(200).json({ ok: true });
    }
    if ((message.deletedFor || []).map(String).includes(String(userId))) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await requirePrivateConversationOrThrow(String(message.conversationId));

    const membership = await requireConversationMember(String(message.conversationId), userId);
    if (!membership) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    if (!message.receiverId || String(message.receiverId) !== String(userId)) {
      return res.status(403).json({ error: 'Only the receiver can mark read' });
    }

    await ChatMessage.updateOne(
      { _id: messageId, deleted: false, deletedFor: { $ne: userId }, status: { $in: ['sent', 'delivered'] } },
      {
        $set: {
          status: 'read',
          deliveredAt: new Date(),
          readAt: new Date(),
        },
      },
    ).exec();

    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${message.conversationId}`).emit('message:read', {
        channelId: String(message.conversationId),
        messageId: String(messageId),
        userId: String(userId),
        at: new Date().toISOString(),
      });
    }

    // Update per-user conversation state for chat list (read).
    const convo = await Conversation.findOne({ channel: String(message.conversationId) })
      .select('_id')
      .lean()
      .exec();
    if (convo && convo._id) {
      const now = new Date();
      await ConversationUserState.updateOne(
        { conversation: convo._id, user: userId },
        {
          $set: { lastSeenAt: now, lastReadAt: now },
          $setOnInsert: { conversation: convo._id, user: userId },
        },
        { upsert: true },
      ).exec();
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('POST /messages/:messageId/read error', err);
    return res.status(status).json({ error: err.message || 'Failed to update read state' });
  }
});
};
