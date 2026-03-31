const express = require('express');
const mongoose = require('mongoose');
const DOMPurify = require('isomorphic-dompurify');

const { Story, User, UserBlock } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { checkRateLimit, getUserPresence } = require('../redis');
const { getBlockedUserIds } = require('../utils/blocking');
const { enqueueNotificationEvent } = require('../services/notificationService');
const { config } = require('../config');
const { logTelemetry } = require('../utils/telemetry');

const router = express.Router();

router.use(requireAuth);

function sanitizeStoryContent(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  const MAX_LENGTH = 2000;
  if (trimmed.length > MAX_LENGTH) {
    const err = new Error(`story content exceeds maximum length of ${MAX_LENGTH} characters`);
    err.statusCode = 400;
    throw err;
  }

  let sanitized = DOMPurify.sanitize(trimmed, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'code', 'pre', 'span', 'br', 'p', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href'],
  });

  const lowered = sanitized.toLowerCase();
  if (lowered.includes('<script') || lowered.includes('javascript:')) {
    sanitized = DOMPurify.sanitize(sanitized, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }

  return sanitized;
}

router.post('/stories', async (req, res) => {
  try {
    const userId = req.user.id;
    const rateKey = `story:${userId}`;
    const rate = await checkRateLimit({ key: rateKey, limit: 10, windowSeconds: 60 * 60 });
    if (!rate.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded for posting stories' });
    }

    const { content, expiresInMinutes, privacy } = req.body || {};
    const sanitizedContent = sanitizeStoryContent(content);
    if (!sanitizedContent) {
      return res.status(400).json({ error: 'content is required' });
    }

    const ttlMinutes = Number.isFinite(Number(expiresInMinutes)) ? Number(expiresInMinutes) : 24 * 60;
    const ttlMs = ttlMinutes * 60 * 1000;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 7 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'expiresInMinutes must be a valid positive duration (max 7 days)' });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const audienceType = privacy?.audienceType === 'whitelist' ? 'whitelist' : 'everyone';
    let audienceUserIds = [];
    if (audienceType === 'whitelist') {
      const list = Array.isArray(privacy?.audienceUserIds) ? privacy.audienceUserIds : [];
      audienceUserIds = list
        .map((id) => String(id))
        .filter((id) => mongoose.Types.ObjectId.isValid(id));
    }

    const story = await Story.create({
      authorId: userId,
      kind: 'text',
      content: sanitizedContent,
      expiresAt,
      privacy: {
        audienceType,
        audienceUserIds,
      },
      viewReceipts: [],
    });

    // Phase 5: Offline story push notifications (best-effort).
    // We filter by story audience privacy and mutual block relationships.
    try {
      if (config.featurePushNotificationsEnabled) {
        const MAX_RECIPIENTS = 300;
        let candidateUserIds = [];
        if (audienceType === 'whitelist') {
          candidateUserIds = audienceUserIds.slice(0, MAX_RECIPIENTS);
        } else {
          const docs = await User.find({ _id: { $ne: userId } })
            .select('_id')
            .limit(MAX_RECIPIENTS)
            .lean()
            .exec();
          candidateUserIds = docs.map((d) => String(d._id));
        }

        if (candidateUserIds.length > 0) {
          // Compute blocked recipients in a single query for both directions:
          // (author blocks recipient) OR (recipient blocks author).
          const blockedDocs = await UserBlock.find({
            $or: [
              { blockerId: userId, blockedId: { $in: candidateUserIds } },
              { blockerId: { $in: candidateUserIds }, blockedId: userId },
            ],
          })
            .select('blockerId blockedId')
            .lean()
            .exec();

          const blockedSet = new Set();
          for (const d of blockedDocs) {
            const blockerId = String(d.blockerId);
            const blockedId = String(d.blockedId);
            if (blockerId === String(userId)) blockedSet.add(blockedId);
            if (blockedId === String(userId)) blockedSet.add(blockerId);
          }

          const presenceArr = await Promise.all(candidateUserIds.map((uid) => getUserPresence(uid)));
          const offlineRecipients = candidateUserIds.filter((uid, idx) => {
            const p = presenceArr[idx];
            return !p || p.status === 'offline';
          });

          const allowedRecipients = offlineRecipients.filter((uid) => !blockedSet.has(uid));
          if (allowedRecipients.length > 0) {
            const enqId = await enqueueNotificationEvent({
              type: 'story',
              createdBy: userId,
              recipientUserIds: allowedRecipients,
              payload: {
                kind: 'story',
                storyId: String(story._id),
                authorId: String(userId),
                expiresAt: story.expiresAt.toISOString(),
                contentPreview: String(sanitizedContent).slice(0, 160),
              },
            });

            logTelemetry('info', 'story_notification_enqueued', {
              notificationEventId: enqId,
              storyId: String(story._id),
              recipientCount: allowedRecipients.length,
            });
          }
        }
      }
    } catch {
      // Best-effort only; story creation must never fail due to push pipeline.
    }

    return res.status(201).json({
      id: String(story._id),
      authorId: String(story.authorId),
      expiresAt: story.expiresAt.toISOString(),
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('POST /stories error', err);
    return res.status(status).json({ error: err.message || 'Failed to create story' });
  }
});

router.get('/stories/feed', async (req, res) => {
  try {
    const viewerId = req.user.id;
    const rateKey = `story:feed:${viewerId}`;
    const rate = await checkRateLimit({ key: rateKey, limit: 30, windowSeconds: 60 * 10 });
    if (!rate.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded for story feed' });
    }
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 20, 50);

    const now = new Date();
    const blockedIds = await getBlockedUserIds(viewerId);

    const audienceFilter = [
      { 'privacy.audienceType': 'everyone' },
      { 'privacy.audienceType': 'whitelist', 'privacy.audienceUserIds': viewerId },
    ];

    const query = {
      expiresAt: { $gt: now },
      $or: audienceFilter,
    };

    if (blockedIds.length > 0) {
      query.authorId = { $nin: blockedIds };
    }

    const stories = await Story.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('authorId kind content expiresAt privacy viewReceipts createdAt')
      .lean()
      .exec();

    const authorIds = Array.from(new Set(stories.map((s) => String(s.authorId))));
    const users = await User.find({ _id: { $in: authorIds } })
      .select('displayName avatarUrl')
      .lean()
      .exec();
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const payload = stories.map((s) => {
      const receipts = Array.isArray(s.viewReceipts) ? s.viewReceipts : [];
      const hasViewed = receipts.some((r) => r?.userId && String(r.userId) === String(viewerId));

      return {
        id: String(s._id),
        authorId: String(s.authorId),
        author: userById.get(String(s.authorId)) || null,
        kind: s.kind || 'text',
        content: s.content,
        expiresAt: s.expiresAt.toISOString(),
        audienceType: s.privacy?.audienceType || 'everyone',
        hasViewed,
        viewCount: receipts.length,
        createdAt: s.createdAt.toISOString(),
      };
    });

    return res.status(200).json({ stories: payload });
  } catch (err) {
    console.error('GET /stories/feed error', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch stories' });
  }
});

router.post('/stories/:storyId/view', async (req, res) => {
  try {
    const viewerId = req.user.id;
    const storyId = req.params.storyId;

    const rateKey = `story:view:${viewerId}:${storyId}`;
    const rate = await checkRateLimit({ key: rateKey, limit: 10, windowSeconds: 60 * 60 });
    if (!rate.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded for story view' });
    }

    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ error: 'Invalid storyId' });
    }

    const now = new Date();
    const blockedIds = await getBlockedUserIds(viewerId);

    const story = await Story.findById(storyId)
      .select('authorId expiresAt privacy viewReceipts')
      .lean()
      .exec();

    if (!story) return res.status(404).json({ error: 'Story not found' });
    if (story.expiresAt && story.expiresAt <= now) return res.status(404).json({ error: 'Story expired' });
    if (blockedIds.includes(String(story.authorId))) return res.status(403).json({ error: 'Not allowed' });

    const audienceType = story.privacy?.audienceType || 'everyone';
    if (audienceType === 'whitelist') {
      const ids = Array.isArray(story.privacy?.audienceUserIds) ? story.privacy.audienceUserIds : [];
      const isAllowed = ids.some((id) => String(id) === String(viewerId));
      if (!isAllowed) return res.status(403).json({ error: 'Not allowed' });
    }

    const viewAlready = Array.isArray(story.viewReceipts)
      ? story.viewReceipts.some((r) => r?.userId && String(r.userId) === String(viewerId))
      : false;

    if (viewAlready) {
      return res.status(200).json({ ok: true, firstView: false });
    }

    const updateRes = await Story.updateOne(
      { _id: storyId },
      { $push: { viewReceipts: { userId: viewerId, viewedAt: now } } },
    ).exec();

    const firstView = (updateRes.modifiedCount ?? updateRes.nModified ?? 0) > 0;
    return res.status(200).json({ ok: true, firstView });
  } catch (err) {
    console.error('POST /stories/:storyId/view error', err);
    return res.status(500).json({ error: err.message || 'Failed to record story view' });
  }
});

router.get('/stories/:storyId', async (req, res) => {
  try {
    const viewerId = req.user.id;
    const storyId = req.params.storyId;

    const rateKey = `story:get:${viewerId}:${storyId}`;
    const rate = await checkRateLimit({ key: rateKey, limit: 20, windowSeconds: 60 * 60 });
    if (!rate.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded for story' });
    }

    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ error: 'Invalid storyId' });
    }

    const now = new Date();
    const blockedIds = await getBlockedUserIds(viewerId);

    const story = await Story.findById(storyId)
      .select('authorId kind content expiresAt privacy viewReceipts createdAt')
      .lean()
      .exec();

    if (!story) return res.status(404).json({ error: 'Story not found' });
    if (story.expiresAt && story.expiresAt <= now) return res.status(404).json({ error: 'Story expired' });
    if (blockedIds.includes(String(story.authorId))) return res.status(403).json({ error: 'Not allowed' });

    const audienceType = story.privacy?.audienceType || 'everyone';
    if (audienceType === 'whitelist') {
      const ids = Array.isArray(story.privacy?.audienceUserIds) ? story.privacy.audienceUserIds : [];
      const isAllowed = ids.some((id) => String(id) === String(viewerId));
      if (!isAllowed) return res.status(403).json({ error: 'Not allowed' });
    }

    const author = await User.findById(story.authorId)
      .select('displayName avatarUrl email')
      .lean()
      .exec();

    const receipts = Array.isArray(story.viewReceipts) ? story.viewReceipts : [];
    const hasViewed = receipts.some((r) => r?.userId && String(r.userId) === String(viewerId));

    return res.status(200).json({
      id: String(story._id),
      authorId: String(story.authorId),
      author: author
        ? { id: String(author._id), displayName: author.displayName, avatarUrl: author.avatarUrl, email: author.email || null }
        : null,
      kind: story.kind || 'text',
      content: story.content,
      expiresAt: story.expiresAt.toISOString(),
      audienceType,
      hasViewed,
      viewCount: receipts.length,
      createdAt: story.createdAt ? story.createdAt.toISOString() : null,
    });
  } catch (err) {
    console.error('GET /stories/:storyId error', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch story' });
  }
});

router.get('/stories/:storyId/receipts', async (req, res) => {
  try {
    const viewerId = req.user.id;
    const storyId = req.params.storyId;

    const rateKey = `story:receipts:${viewerId}:${storyId}`;
    const rate = await checkRateLimit({ key: rateKey, limit: 20, windowSeconds: 60 * 60 });
    if (!rate.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded for story receipts' });
    }

    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ error: 'Invalid storyId' });
    }

    const now = new Date();
    const blockedIds = await getBlockedUserIds(viewerId);

    const story = await Story.findById(storyId)
      .select('authorId expiresAt privacy viewReceipts')
      .lean()
      .exec();

    if (!story) return res.status(404).json({ error: 'Story not found' });
    if (story.expiresAt && story.expiresAt <= now) return res.status(404).json({ error: 'Story expired' });
    if (blockedIds.includes(String(story.authorId))) return res.status(403).json({ error: 'Not allowed' });

    const audienceType = story.privacy?.audienceType || 'everyone';
    if (audienceType === 'whitelist') {
      const ids = Array.isArray(story.privacy?.audienceUserIds) ? story.privacy.audienceUserIds : [];
      const isAllowed = ids.some((id) => String(id) === String(viewerId));
      if (!isAllowed) return res.status(403).json({ error: 'Not allowed' });
    }

    const receipts = Array.isArray(story.viewReceipts) ? story.viewReceipts : [];
    const viewerUserIds = receipts
      .map((r) => r?.userId)
      .filter(Boolean)
      .map((id) => String(id));

    const users = await User.find({ _id: { $in: viewerUserIds } })
      .select('displayName avatarUrl email')
      .lean()
      .exec();

    const userById = new Map(users.map((u) => [String(u._id), u]));

    const payload = receipts
      .map((r) => {
        const uid = r?.userId ? String(r.userId) : null;
        if (!uid) return null;
        const u = userById.get(uid);
        return u
          ? {
              userId: uid,
              displayName: u.displayName,
              avatarUrl: u.avatarUrl || null,
              email: u.email || null,
              viewedAt: r.viewedAt ? r.viewedAt.toISOString() : null,
            }
          : null;
      })
      .filter(Boolean);

    return res.status(200).json({ receipts: payload });
  } catch (err) {
    console.error('GET /stories/:storyId/receipts error', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch story receipts' });
  }
});

module.exports = router;

