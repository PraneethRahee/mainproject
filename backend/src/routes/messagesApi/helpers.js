const mongoose = require('mongoose');
const DOMPurify = require('isomorphic-dompurify');
const { Channel, ChannelMember, UserBlock } = require('../../models');

async function requireConversationMember(conversationId, userId) {
  const membership = await ChannelMember.findOne({ channel: conversationId, user: userId })
    .select('channel user canPost')
    .lean()
    .exec();
  return membership || null;
}

async function requirePrivateConversationOrThrow(conversationId) {
  const channel = await Channel.findById(conversationId).select('type isArchived').lean().exec();
  if (!channel || channel.isArchived) {
    const err = new Error('Conversation not found');
    err.statusCode = 404;
    throw err;
  }
  const isPrivateLike = channel.type === 'private' || channel.type === 'dm';
  if (!isPrivateLike) {
    const err = new Error('Not a private conversation');
    err.statusCode = 400;
    throw err;
  }
  return channel;
}

function encodeCursor({ timestamp, id }) {
  const payload = JSON.stringify({ ts: new Date(timestamp).toISOString(), id: String(id) });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  const raw = Buffer.from(String(cursor), 'base64url').toString('utf8');
  const parsed = JSON.parse(raw);
  const ts = parsed && parsed.ts;
  const id = parsed && parsed.id;

  if (!ts || typeof ts !== 'string') return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;

  if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) return null;

  return { timestamp: date, id };
}

function isExpired(expiresAt, nowMs) {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= nowMs;
}

async function getBlockedUserIds(viewerId) {
  const [byMe, byThem] = await Promise.all([
    UserBlock.find({ blockerId: viewerId }).select('blockedId').lean().exec(),
    UserBlock.find({ blockedId: viewerId }).select('blockerId').lean().exec(),
  ]);

  const set = new Set();
  for (const d of byMe) if (d.blockedId) set.add(String(d.blockedId));
  for (const d of byThem) if (d.blockerId) set.add(String(d.blockerId));
  return Array.from(set);
}

async function isBlockedPair(userA, userB) {
  if (!userA || !userB) return false;
  const blocked = await UserBlock.findOne({
    $or: [
      { blockerId: userA, blockedId: userB },
      { blockerId: userB, blockedId: userA },
    ],
  })
    .select('_id')
    .lean()
    .exec();

  return Boolean(blocked);
}

function sanitizeContent(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  const MAX_LENGTH = 4000;
  if (trimmed.length > MAX_LENGTH) {
    const err = new Error(`content exceeds maximum length of ${MAX_LENGTH} characters`);
    err.code = 'CONTENT_TOO_LONG';
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DELETE_FOR_EVERYONE_WINDOW_MS = 15 * 60 * 1000;

async function requirePinPermission({ conversationId, userId, channelType }) {
  if (channelType === 'group') {
    const membership = await ChannelMember.findOne({
      channel: conversationId,
      user: userId,
      isAdmin: true,
    })
      .select('_id')
      .lean()
      .exec();
    return !!membership;
  }
  const membership = await ChannelMember.findOne({
    channel: conversationId,
    user: userId,
  })
    .select('_id')
    .lean()
    .exec();
  return !!membership;
}

module.exports = {
  requireConversationMember,
  requirePrivateConversationOrThrow,
  encodeCursor,
  decodeCursor,
  isExpired,
  getBlockedUserIds,
  isBlockedPair,
  sanitizeContent,
  escapeRegex,
  requirePinPermission,
  DELETE_FOR_EVERYONE_WINDOW_MS,
};
