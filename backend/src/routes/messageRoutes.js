const express = require('express');
const mongoose = require('mongoose');
const DOMPurify = require('isomorphic-dompurify');
const { Message, FileAsset, Channel } = require('../models');
const { checkRateLimit } = require('../redis');
const { requireAuth } = require('../middleware/auth');
const { requireChannelMember } = require('../middleware/channelMembership');
const { writeAuditLog, getRequestClientInfo } = require('../middleware/audit');

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

// GET /channels/:id/messages?limit=&cursor=
router.get('/channels/:id/messages', requireChannelMember('id'), async (req, res) => {
  try {
    const channelId = req.params.id;
    const { limit, cursor } = req.query;

    const pageSize = Math.min(parseInt(limit, 10) || 50, 100);

    const query = { channel: channelId };

    if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
      query._id = { $lt: cursor };
    }

    const messages = await Message.find(query)
      .sort({ _id: -1 })
      .limit(pageSize + 1)
      .lean()
      .exec();

    let nextCursor = null;
    let items = messages;
    if (messages.length > pageSize) {
      const last = messages[pageSize];
      nextCursor = String(last._id);
      items = messages.slice(0, pageSize);
    }

    const allAttachmentIds = Array.from(
      new Set(items.flatMap((m) => (m.attachments || []).map((id) => String(id)))),
    );

    let fileMap = new Map();
    if (allAttachmentIds.length > 0) {
      const files = await FileAsset.find({
        _id: { $in: allAttachmentIds },
      })
        .select('_id cloudinarySecureUrl cloudinaryUrl mimeType originalName')
        .lean()
        .exec();

      fileMap = new Map(files.map((f) => [String(f._id), f]));
    }

    const sanitized = items.map((m) => ({
      id: String(m._id),
      channel: String(m.channel),
      sender: String(m.sender),
      content: m.content,
      attachments: (m.attachments || []).map(String),
      attachmentDetails: (m.attachments || [])
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
      createdAt: m.createdAt,
      editedAt: m.editedAt || null,
    }));

    return res.status(200).json({
      messages: sanitized,
      nextCursor,
    });
  } catch (err) {
    console.error('GET /channels/:id/messages error', err);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /channels/:id/messages
router.post('/channels/:id/messages', requireChannelMember('id'), async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = req.user.id;
    const { content, attachmentIds } = req.body || {};

    // Per-user, per-channel rate limit: e.g. 20 messages per 10 seconds
    const rateKey = `msg:${userId}:${channelId}`;
    const rate = await checkRateLimit({ key: rateKey, limit: 20, windowSeconds: 10 });
    if (!rate.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded for sending messages' });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    const trimmed = content.trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'content cannot be empty' });
    }

    const MAX_LENGTH = 4000;
    if (trimmed.length > MAX_LENGTH) {
      return res
        .status(400)
        .json({ error: `content exceeds maximum length of ${MAX_LENGTH} characters` });
    }

    let sanitizedContent = DOMPurify.sanitize(trimmed, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'code', 'pre', 'span', 'br', 'p', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href'],
    });

    // Additional pattern-based guards for common XSS/script payloads
    const lowered = sanitizedContent.toLowerCase();
    if (lowered.includes('<script') || lowered.includes('javascript:')) {
      sanitizedContent = DOMPurify.sanitize(sanitizedContent, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }

    let attachments = [];
    let attachmentDetails = [];
    if (Array.isArray(attachmentIds) && attachmentIds.length > 0) {
      const cleanIds = attachmentIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

      if (cleanIds.length > 0) {
        const files = await FileAsset.find({
          _id: { $in: cleanIds },
          scanStatus: 'scanned_clean',
        })
          .select('_id cloudinarySecureUrl cloudinaryUrl mimeType originalName')
          .lean()
          .exec();

        attachments = files.map((f) => f._id);
        attachmentDetails = files.map((f) => ({
          id: String(f._id),
          url: f.cloudinarySecureUrl || f.cloudinaryUrl || null,
          mimeType: f.mimeType,
          fileName: f.originalName || null,
        }));
      }
    }

    const message = await Message.create({
      channel: channelId,
      sender: userId,
      content: sanitizedContent,
      attachments,
    });

    await Channel.findByIdAndUpdate(channelId, { $set: { lastMessageAt: new Date() } }).exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'chat.message.send',
      targetType: 'message',
      targetId: String(message._id),
      result: 'success',
      ip,
      userAgent,
      metadata: {
        channelId,
        hasAttachments: attachments.length > 0,
      },
    });

    return res.status(201).json({
      id: String(message._id),
      channel: String(message.channel),
      sender: String(message.sender),
      content: message.content,
      attachments: message.attachments.map(String),
      attachmentDetails,
      createdAt: message.createdAt,
      editedAt: message.editedAt || null,
    });
  } catch (err) {
    console.error('POST /channels/:id/messages error', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;

