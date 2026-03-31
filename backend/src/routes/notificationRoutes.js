const express = require('express');
const mongoose = require('mongoose');

const { NotificationInbox, NotificationSubscription, NotificationPreference, NOTIFICATION_TYPES } =
  require('../models');
const { requireAuth } = require('../middleware/auth');
const { config } = require('../config');
const { checkRateLimit } = require('../redis');

const router = express.Router();

router.use(requireAuth);

router.post('/notifications/push/subscribe', async (req, res) => {
  try {
    const userId = req.user.id;
    const rateKey = `push-sub:${userId}`;
    const rate = await checkRateLimit({ key: rateKey, limit: 5, windowSeconds: 10 * 60 });
    if (!rate.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded for push subscription' });
    }
    const subscription = req.body && req.body.subscription;

    const endpoint = subscription?.endpoint;
    const keys = subscription?.keys || {};
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;

    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ error: 'subscription.endpoint is required' });
    }
    if (!p256dh || typeof p256dh !== 'string' || !auth || typeof auth !== 'string') {
      return res.status(400).json({ error: 'subscription.keys.p256dh and keys.auth are required' });
    }

    const expirationTime = Number.isFinite(Number(subscription.expirationTime))
      ? Number(subscription.expirationTime)
      : null;

    await NotificationSubscription.findOneAndUpdate(
      { userId, endpoint },
      {
        $set: {
          keys: { p256dh, auth },
          expirationTime,
        },
      },
      { upsert: true, new: true },
    ).exec();

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('POST /notifications/push/subscribe error', err);
    return res.status(500).json({ error: err.message || 'Failed to store subscription' });
  }
});

router.get('/notifications/push/vapid-public-key', async (_req, res) => {
  if (!config.vapidPublicKey) {
    return res.status(404).json({ error: 'Web Push not configured on this server' });
  }
  return res.status(200).json({ publicKey: config.vapidPublicKey });
});

router.get('/notifications', async (req, res) => {
  try {
    const userId = req.user.id;
    const unreadOnly = req.query.unreadOnly !== 'false';
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50, 100);

    const query = {
      userId,
    };

    if (unreadOnly) {
      query.readAt = null;
    }

    const notifications = await NotificationInbox.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('_id userId type payload createdAt readAt')
      .lean()
      .exec();

    return res.status(200).json({
      notifications: notifications.map((n) => ({
        id: String(n._id),
        type: n.type,
        payload: n.payload || {},
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt ? n.readAt.toISOString() : null,
      })),
    });
  } catch (err) {
    console.error('GET /notifications error', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch notifications' });
  }
});

router.post('/notifications/read', async (req, res) => {
  try {
    const userId = req.user.id;
    const { all, notificationIds } = req.body || {};
    const now = new Date();

    if (all === true) {
      const r = await NotificationInbox.updateMany(
        { userId, readAt: null },
        { $set: { readAt: now } },
      ).exec();
      return res.status(200).json({ ok: true, modified: r.modifiedCount ?? r.nModified ?? 0 });
    }

    const ids = Array.isArray(notificationIds) ? notificationIds : [];
    const cleanIds = ids
      .map((id) => String(id))
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (cleanIds.length === 0) {
      return res.status(400).json({ error: 'notificationIds is required (or set all=true)' });
    }

    const r = await NotificationInbox.updateMany(
      { userId, _id: { $in: cleanIds }, readAt: null },
      { $set: { readAt: now } },
    ).exec();

    return res.status(200).json({ ok: true, modified: r.modifiedCount ?? r.nModified ?? 0 });
  } catch (err) {
    console.error('POST /notifications/read error', err);
    return res.status(500).json({ error: err.message || 'Failed to mark notifications as read' });
  }
});

router.post('/notifications/preferences/mute', async (req, res) => {
  try {
    const userId = req.user.id;
    const { mutedTypes } = req.body || {};
    const list = Array.isArray(mutedTypes) ? mutedTypes : [];
    const clean = list.map((t) => String(t)).filter((t) => NOTIFICATION_TYPES.includes(t));

    await NotificationPreference.findOneAndUpdate(
      { userId },
      { $set: { mutedTypes: clean } },
      { upsert: true, new: true },
    ).exec();

    return res.status(200).json({ ok: true, mutedTypes: clean });
  } catch (err) {
    console.error('POST /notifications/preferences/mute error', err);
    return res.status(500).json({ error: err.message || 'Failed to update preferences' });
  }
});

module.exports = router;

