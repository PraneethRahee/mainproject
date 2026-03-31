const express = require('express');
const mongoose = require('mongoose');

const { requireAuth } = require('../middleware/auth');
const { UserBlock, UserReport } = require('../models');
const { writeAuditLog, getRequestClientInfo } = require('../middleware/audit');
const { checkRateLimit } = require('../redis');

const router = express.Router();
router.use(requireAuth);

function asTrimmedString(v, max = 120) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

router.get('/blocks', async (req, res) => {
  try {
    const userId = req.user.id;
    const blocks = await UserBlock.find({ blockerId: userId }).select('blockedId reason createdAt').lean().exec();
    return res.status(200).json({
      blocks: blocks.map((b) => ({
        userId: String(b.blockedId),
        reason: b.reason || '',
        createdAt: b.createdAt || null,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load blocks' });
  }
});

router.post('/blocks/:targetUserId', async (req, res) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.params.targetUserId;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) return res.status(400).json({ error: 'Invalid user id' });
    if (String(targetUserId) === String(userId)) return res.status(400).json({ error: 'Cannot block yourself' });

    const reason = asTrimmedString(req.body?.reason || '', 120);

    await UserBlock.updateOne(
      { blockerId: userId, blockedId: targetUserId },
      { $setOnInsert: { blockerId: userId, blockedId: targetUserId, reason } },
      { upsert: true },
    ).exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'abuse.user_block',
      targetType: 'user',
      targetId: String(targetUserId),
      result: 'success',
      ip,
      userAgent,
      metadata: { reason },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to block user' });
  }
});

router.delete('/blocks/:targetUserId', async (req, res) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.params.targetUserId;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) return res.status(400).json({ error: 'Invalid user id' });

    await UserBlock.deleteOne({ blockerId: userId, blockedId: targetUserId }).exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'abuse.user_unblock',
      targetType: 'user',
      targetId: String(targetUserId),
      result: 'success',
      ip,
      userAgent,
      metadata: {},
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to unblock user' });
  }
});

router.post('/reports', async (req, res) => {
  try {
    const reporterId = req.user.id;
    const { targetUserId, reason, conversationId, messageId, details } = req.body || {};

    if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ error: 'targetUserId is required' });
    }

    const cleanReason = asTrimmedString(reason, 60) || 'other';
    const ipUser = getRequestClientInfo(req);

    const rateKey = `abuse:report:${reporterId}:${targetUserId}`;
    const rate = await checkRateLimit({ key: rateKey, limit: 10, windowSeconds: 60 });
    if (!rate.allowed) return res.status(429).json({ error: 'Too many reports in a short time' });

    const report = await UserReport.create({
      reporterId,
      targetUserId,
      reason: cleanReason,
      conversationId: conversationId && mongoose.Types.ObjectId.isValid(conversationId) ? conversationId : null,
      messageId: messageId && mongoose.Types.ObjectId.isValid(messageId) ? messageId : null,
      metadata: typeof details === 'object' && details ? details : {},
      status: 'received',
    });

    const { ip, userAgent } = ipUser;
    await writeAuditLog({
      actorId: reporterId,
      action: 'abuse.user_report',
      targetType: 'user',
      targetId: String(targetUserId),
      result: 'success',
      ip,
      userAgent,
      metadata: { reportId: String(report._id), reason: cleanReason },
    });

    return res.status(201).json({ ok: true, reportId: String(report._id) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to submit report' });
  }
});

module.exports = router;

