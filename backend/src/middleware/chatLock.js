const crypto = require('crypto');
const mongoose = require('mongoose');
const { ChatLock, ChatLockUnlockToken } = require('../models');

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function getConversationIdFromReq(req) {
  return (
    req.params?.conversationId ||
    req.body?.conversationId ||
    req.params?.groupId ||
    req.params?.channelId ||
    null
  );
}

/**
 * Enforces Phase 4 chat-lock for message read/send endpoints.
 * Returns 423 Locked when the user has a lock configured and does not provide a valid unlock token.
 */
async function requireChatUnlocked(req, res, next) {
  const conversationId = getConversationIdFromReq(req);
  if (!conversationId) return next();

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return res.status(400).json({ error: 'Invalid conversation/channel id' });
  }

  // Endpoint is protected already by requireAuth, so req.user should exist.
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authorization required' });

  const lock = await ChatLock.findOne({ userId, channelId: conversationId }).lean().exec();
  if (!lock) return next();

  const unlockToken = req.headers['x-chat-lock-token'];
  if (!unlockToken || typeof unlockToken !== 'string') {
    return res.status(423).json({ error: 'Chat is locked' });
  }

  const tokenHash = sha256Hex(unlockToken);
  const unlocked = await ChatLockUnlockToken.findOne({
    userId,
    channelId: conversationId,
    tokenHash,
    expiresAt: { $gt: new Date() },
  })
    .lean()
    .exec();

  if (!unlocked) {
    return res.status(423).json({ error: 'Chat is locked' });
  }

  return next();
}

module.exports = {
  requireChatUnlocked,
  sha256Hex,
};

