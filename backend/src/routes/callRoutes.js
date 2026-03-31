const express = require('express');
const mongoose = require('mongoose');

const { Call } = require('../models');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/calls/logs', async (req, res) => {
  try {
    const userId = req.user.id;
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 30, 100);

    const calls = await Call.find({
      $or: [{ callerId: userId }, { calleeId: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('callerId calleeId conversationId callType status startedAt endedAt endedReason endedBy createdAt')
      .lean()
      .exec();

    return res.status(200).json({
      calls: calls.map((c) => ({
        id: String(c._id),
        callerId: String(c.callerId),
        calleeId: String(c.calleeId),
        conversationId: c.conversationId ? String(c.conversationId) : null,
        callType: c.callType,
        status: c.status,
        startedAt: c.startedAt ? c.startedAt.toISOString() : null,
        endedAt: c.endedAt ? c.endedAt.toISOString() : null,
        endedReason: c.endedReason || null,
        endedBy: c.endedBy ? String(c.endedBy) : null,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('GET /calls/logs error', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch call logs' });
  }
});

router.get('/calls/:callId', async (req, res) => {
  try {
    const viewerId = req.user.id;
    const { callId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(callId)) {
      return res.status(400).json({ error: 'Invalid callId' });
    }

    const call = await Call.findById(callId)
      .select('callerId calleeId conversationId callType status offer createdAt')
      .lean()
      .exec();

    if (!call) return res.status(404).json({ error: 'Call not found' });
    if (String(call.calleeId) !== String(viewerId) && String(call.callerId) !== String(viewerId)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    if (call.status === 'ended' || call.status === 'missed') {
      return res.status(404).json({ error: 'Call is not active' });
    }

    return res.status(200).json({
      id: String(call._id),
      callerId: String(call.callerId),
      calleeId: String(call.calleeId),
      conversationId: call.conversationId ? String(call.conversationId) : null,
      callType: call.callType,
      status: call.status,
      offer: call.offer || null,
      createdAt: call.createdAt ? call.createdAt.toISOString() : null,
    });
  } catch (err) {
    console.error('GET /calls/:callId error', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch call' });
  }
});

module.exports = router;

