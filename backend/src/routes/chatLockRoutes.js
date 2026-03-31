const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { requireAuth } = require('../middleware/auth');
const { Channel, ChannelMember, ChatLock, ChatLockUnlockToken } = require('../models');
const { writeAuditLog, getRequestClientInfo } = require('../middleware/audit');

const router = express.Router();
router.use(requireAuth);

function normalizePin(pin) {
  if (pin === null || pin === undefined) return null;
  if (typeof pin === 'number') pin = String(pin);
  if (typeof pin !== 'string') return null;
  const s = pin.trim();
  if (!/^\d{4,8}$/.test(s)) return null;
  return s;
}

async function requireMember(conversationId, userId) {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) return false;
  const membership = await ChannelMember.findOne({ channel: conversationId, user: userId }).lean().exec();
  return Boolean(membership);
}

router.get('/:conversationId', async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.conversationId;
    if (!mongoose.Types.ObjectId.isValid(conversationId)) return res.status(400).json({ error: 'Invalid id' });

    const member = await requireMember(conversationId, userId);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const lock = await ChatLock.findOne({ userId, channelId: conversationId }).lean().exec();
    if (!lock) return res.status(200).json({ locked: false });
    return res.status(200).json({ locked: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load chat lock state' });
  }
});

// POST /chat-lock/:conversationId
router.post('/:conversationId', async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.conversationId;
    const { pin } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(conversationId)) return res.status(400).json({ error: 'Invalid id' });
    const normalized = normalizePin(pin);
    if (!normalized) return res.status(400).json({ error: 'Pin must be 4-8 digits' });

    const member = await requireMember(conversationId, userId);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const pinHash = await bcrypt.hash(normalized, 10);
    await ChatLock.findOneAndUpdate(
      { userId, channelId: conversationId },
      { $set: { userId, channelId: conversationId, pinHash } },
      { upsert: true, new: true },
    ).exec();

    // Invalidate any existing unlock tokens.
    await ChatLockUnlockToken.deleteMany({ userId, channelId: conversationId }).exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'chat.lock.enable',
      targetType: 'channel',
      targetId: String(conversationId),
      result: 'success',
      ip,
      userAgent,
      metadata: {},
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to set chat lock' });
  }
});

// POST /chat-lock/:conversationId/clear
router.post('/:conversationId/clear', async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.conversationId;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) return res.status(400).json({ error: 'Invalid id' });

    const member = await requireMember(conversationId, userId);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    await ChatLock.deleteOne({ userId, channelId: conversationId }).exec();
    await ChatLockUnlockToken.deleteMany({ userId, channelId: conversationId }).exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'chat.lock.disable',
      targetType: 'channel',
      targetId: String(conversationId),
      result: 'success',
      ip,
      userAgent,
      metadata: {},
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to clear chat lock' });
  }
});

// POST /chat-lock/:conversationId/unlock
router.post('/:conversationId/unlock', async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.conversationId;
    const { pin } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(conversationId)) return res.status(400).json({ error: 'Invalid id' });
    const normalized = normalizePin(pin);
    if (!normalized) return res.status(400).json({ error: 'Pin must be 4-8 digits' });

    const member = await requireMember(conversationId, userId);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const lock = await ChatLock.findOne({ userId, channelId: conversationId }).lean().exec();
    if (!lock) return res.status(200).json({ ok: true, alreadyUnlocked: true });

    const ok = await bcrypt.compare(normalized, lock.pinHash);
    if (!ok) return res.status(401).json({ error: 'Invalid pin' });

    // Short-lived unlock token so sensitive routes remain enforceable.
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await ChatLockUnlockToken.create({
      userId,
      channelId: conversationId,
      tokenHash,
      expiresAt,
    });

    return res.status(200).json({ ok: true, unlockToken: rawToken, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to unlock chat' });
  }
});

module.exports = router;

