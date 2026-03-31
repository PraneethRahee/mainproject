const mongoose = require('mongoose');
const { ChatMessage } = require('../../models');
const { writeAuditLog, getRequestClientInfo } = require('../../middleware/audit');
const {
  sanitizeContent,
  requireConversationMember,
  requirePrivateConversationOrThrow,
  DELETE_FOR_EVERYONE_WINDOW_MS,
} = require('./helpers');

module.exports = function registerMessagePatchDeleteRoutes(router) {
// PATCH /messages/:messageId (edit private message content)
router.patch('/messages/:messageId', async (req, res) => {
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

    const message = await ChatMessage.findById(messageId)
      .select('_id conversationId senderId receiverId deleted deletedFor type timestamp status replyTo')
      .lean()
      .exec();

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (message.deleted) {
      return res.status(400).json({ error: 'Cannot edit a deleted message' });
    }
    if ((message.deletedFor || []).map(String).includes(String(userId))) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (message.type === 'system') {
      return res.status(400).json({ error: 'Cannot edit a system message' });
    }

    await requirePrivateConversationOrThrow(String(message.conversationId));

    const membership = await requireConversationMember(String(message.conversationId), userId);
    if (!membership) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    const isSender = String(message.senderId) === String(userId);
    if (!isSender) {
      return res.status(403).json({ error: 'Not allowed to edit this message' });
    }

    await ChatMessage.updateOne(
      { _id: messageId },
      { $set: { content: sanitizedContent, edited: true } },
    ).exec();

    const updated = await ChatMessage.findById(messageId)
      .select('_id conversationId senderId receiverId content type timestamp status edited deleted replyTo')
      .lean()
      .exec();

    return res.status(200).json({
      id: String(updated._id),
      conversationId: String(updated.conversationId),
      senderId: String(updated.senderId),
      receiverId: updated.receiverId ? String(updated.receiverId) : null,
      content: updated.content,
      type: updated.type,
      timestamp: updated.timestamp,
      status: updated.status,
      edited: !!updated.edited,
      deleted: !!updated.deleted,
      replyTo: updated.replyTo ? String(updated.replyTo) : null,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('PATCH /messages/:messageId error', err);
    return res.status(status).json({ error: err.message || 'Failed to edit message' });
  }
});

// DELETE /messages/:messageId (soft delete private message)
router.delete('/messages/:messageId', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;
    const modeRaw = String(req.query.mode || '').toLowerCase();
    const mode = modeRaw === 'me' ? 'me' : modeRaw === 'everyone' ? 'everyone' : 'everyone';

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid messageId' });
    }

    const message = await ChatMessage.findById(messageId)
      .select('_id conversationId senderId receiverId deleted deletedFor timestamp')
      .lean()
      .exec();

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await requirePrivateConversationOrThrow(String(message.conversationId));

    const membership = await requireConversationMember(String(message.conversationId), userId);
    if (!membership) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    const isSender = String(message.senderId) === String(userId);
    const isReceiver = message.receiverId && String(message.receiverId) === String(userId);
    const isParticipant = isSender || isReceiver;
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not allowed to delete this message' });
    }

    // Delete for me: hide only for the requesting user (sender or receiver).
    if (mode === 'me') {
      if (message.deleted) {
        // Already globally deleted; treat as success.
        return res.status(200).json({ ok: true, id: String(message._id), deleted: true, mode: 'me' });
      }

      await ChatMessage.updateOne(
        { _id: messageId, deleted: false },
        { $addToSet: { deletedFor: userId } },
      ).exec();

      return res.status(200).json({ ok: true, id: String(message._id), deleted: false, mode: 'me' });
    }

    // Delete for everyone: only sender can do this (backwards-compatible default).
    if (!isSender) {
      return res.status(403).json({ error: 'Only the sender can delete for everyone' });
    }
    const messageTs = new Date(message.timestamp).getTime();
    if (Number.isFinite(messageTs) && Date.now() - messageTs > DELETE_FOR_EVERYONE_WINDOW_MS) {
      return res.status(403).json({ error: 'Delete for everyone window has expired' });
    }

    if (message.deleted) {
      return res.status(200).json({ ok: true, id: String(message._id), deleted: true, mode: 'everyone' });
    }

    await ChatMessage.updateOne(
      { _id: messageId },
      {
        $set: {
          deleted: true,
          edited: false,
          content: 'This message was deleted',
          type: 'system',
          status: 'sent',
          replyTo: null,
          receiverId: message.receiverId || null,
        },
      },
    ).exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'chat.message.delete_everyone',
      targetType: 'message',
      targetId: String(message._id),
      result: 'success',
      ip,
      userAgent,
      metadata: { conversationId: String(message.conversationId), mode: 'everyone' },
    });

    return res.status(200).json({ ok: true, id: String(message._id), deleted: true, mode: 'everyone' });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('DELETE /messages/:messageId error', err);
    return res.status(status).json({ error: err.message || 'Failed to delete message' });
  }
});
};
