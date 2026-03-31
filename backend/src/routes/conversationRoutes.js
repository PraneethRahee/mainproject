const express = require('express');
const mongoose = require('mongoose');
const {
  Channel,
  ChannelMember,
  Conversation,
  ConversationUserState,
  ChatMessage,
  User,
  UserBlock,
  ConversationNotificationPreference,
} = require('../models');
const { isConversationNotificationMuted } = require('../utils/conversationNotificationMute');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function encodeCursor({ lastMessageAt, id }) {
  const payload = JSON.stringify({
    ts: lastMessageAt ? new Date(lastMessageAt).toISOString() : null,
    id: String(id),
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  try {
    const raw = Buffer.from(String(cursor), 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    const id = parsed && parsed.id;
    const ts = parsed && parsed.ts;
    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) return null;

    if (ts === null) return { lastMessageAt: null, id };
    if (typeof ts !== 'string') return null;
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return null;
    return { lastMessageAt: date, id };
  } catch {
    return null;
  }
}

function canonicalPairHash(userA, userB) {
  const a = String(userA);
  const b = String(userB);
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

async function ensureMember(channelId, userId) {
  try {
    await ChannelMember.create({
      channel: channelId,
      user: userId,
      isAdmin: false,
      canPost: true,
      canManageMembers: false,
    });
  } catch (err) {
    // Ignore duplicate membership (unique index on {channel,user}).
    if (!(err && err.code === 11000)) throw err;
  }
}

// POST /conversations/dm { otherUserId }
// Find-or-create the unique DM conversation (and its dm Channel) for the authenticated user + otherUserId.
router.post('/dm', async (req, res) => {
  try {
    const userId = String(req.user.id);
    const { otherUserId } = req.body || {};

    if (!otherUserId || !mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({ error: 'otherUserId is required' });
    }

    const otherId = String(otherUserId);
    if (otherId === userId) {
      return res.status(400).json({ error: 'otherUserId must be different from your user id' });
    }

    const otherUser = await User.findById(otherId).select('_id').lean().exec();
    if (!otherUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const participantsHash = canonicalPairHash(userId, otherId);

    // Fast path: conversation already exists.
    const existing = await Conversation.findOne({ kind: 'dm', participantsHash })
      .populate({ path: 'channel', select: '_id name description type createdBy isArchived lastMessageAt metadata createdAt updatedAt' })
      .lean()
      .exec();

    if (existing && existing.channel && !existing.channel.isArchived) {
      // Ensure memberships exist (safe idempotency).
      await ensureMember(existing.channel._id, userId);
      await ensureMember(existing.channel._id, otherId);

      return res.status(200).json({
        conversation: {
          id: String(existing._id),
          kind: existing.kind,
          channelId: String(existing.channel._id),
          participants: existing.participants ? existing.participants.map(String) : [userId, otherId],
          participantsHash: existing.participantsHash,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        },
        channel: existing.channel,
      });
    }

    // Create path: rely on unique participantsHash to guarantee one per pair.
    let channel;
    try {
      channel = await Channel.create({
        name: 'dm',
        description: '',
        type: 'dm',
        createdBy: userId,
        metadata: {},
      });

      await ensureMember(channel._id, userId);
      await ensureMember(channel._id, otherId);

      const convo = await Conversation.create({
        kind: 'dm',
        channel: channel._id,
        participants: [userId, otherId],
        participantsHash,
        createdBy: userId,
      });

      return res.status(201).json({
        conversation: {
          id: String(convo._id),
          kind: convo.kind,
          channelId: String(channel._id),
          participants: [userId, otherId],
          participantsHash,
          createdAt: convo.createdAt,
          updatedAt: convo.updatedAt,
        },
        channel,
      });
    } catch (err) {
      // If someone else created concurrently, unique index on participantsHash will throw.
      if (err && err.code === 11000) {
        const convo = await Conversation.findOne({ kind: 'dm', participantsHash })
          .populate({ path: 'channel', select: '_id name description type createdBy isArchived lastMessageAt metadata createdAt updatedAt' })
          .lean()
          .exec();

        if (convo && convo.channel) {
          await ensureMember(convo.channel._id, userId);
          await ensureMember(convo.channel._id, otherId);

          return res.status(200).json({
            conversation: {
              id: String(convo._id),
              kind: convo.kind,
              channelId: String(convo.channel._id),
              participants: convo.participants ? convo.participants.map(String) : [userId, otherId],
              participantsHash: convo.participantsHash,
              createdAt: convo.createdAt,
              updatedAt: convo.updatedAt,
            },
            channel: convo.channel,
          });
        }
      }

      // Best-effort cleanup: avoid orphan dm channel on failed convo creation.
      if (channel && channel._id) {
        try {
          await ChannelMember.deleteMany({ channel: channel._id }).exec();
          await Channel.deleteOne({ _id: channel._id }).exec();
        } catch {
          // ignore cleanup errors
        }
      }

      throw err;
    }
  } catch (err) {
    console.error('POST /conversations/dm error', err);
    return res.status(500).json({ error: 'Failed to create or fetch DM conversation' });
  }
});

// GET /conversations
// List DM conversations for the authenticated user with:
// - lastMessageId/lastMessageAt
// - per-user lastSeenAt/lastReadAt
// - unreadCount (derived from lastReadAt + indexed query)
router.get('/', async (req, res) => {
  try {
    const userId = String(req.user.id);

    const limitRaw = parseInt(req.query.limit, 10);
    const pageSize = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50, 100);

    const cursor = req.query.cursor ? decodeCursor(req.query.cursor) : null;
    if (req.query.cursor && !cursor) {
      return res.status(400).json({ error: 'Invalid cursor' });
    }

    const query = { kind: 'dm', participants: userId };
    if (cursor) {
      if (cursor.lastMessageAt) {
        query.$or = [
          { lastMessageAt: { $lt: cursor.lastMessageAt } },
          { lastMessageAt: cursor.lastMessageAt, _id: { $lt: cursor.id } },
          { lastMessageAt: { $exists: false } },
          { lastMessageAt: null },
        ];
      } else {
        // Cursor is in the "null lastMessageAt" tail
        query.$or = [{ lastMessageAt: null, _id: { $lt: cursor.id } }, { lastMessageAt: { $exists: false } }];
      }
    }

    const convos = await Conversation.find(query)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(pageSize + 1)
      .lean()
      .exec();

    let nextCursor = null;
    let page = convos;
    if (convos.length > pageSize) {
      page = convos.slice(0, pageSize);
      const last = page[page.length - 1];
      nextCursor = encodeCursor({ lastMessageAt: last.lastMessageAt || null, id: last._id });
    }

    const convoIds = page.map((c) => c._id);
    const stateDocs = await ConversationUserState.find({ conversation: { $in: convoIds }, user: userId })
      .select('conversation lastSeenAt lastReadAt')
      .lean()
      .exec();
    const stateMap = new Map(stateDocs.map((s) => [String(s.conversation), s]));

    // Fetch last messages in one go.
    const lastIds = page.map((c) => c.lastMessageId).filter(Boolean);
    const lastMsgs = await ChatMessage.find({ _id: { $in: lastIds } })
      .select('_id conversationId senderId receiverId content type expiresAt timestamp status deliveredAt readAt deleted')
      .lean()
      .exec();
    const lastMsgMap = new Map(lastMsgs.map((m) => [String(m._id), m]));

    const now = new Date();
    const EXPIRED_PLACEHOLDER = 'This message has disappeared';

    // Pre-compute blocked peers for the page to avoid N+1 block checks.
    const otherUserIds = page
      .map((c) => (c.participants || []).map(String).find((id) => id !== userId) || null)
      .filter(Boolean);
    const blockedOtherUserIdSet = new Set();
    if (otherUserIds.length > 0) {
      const blockDocs = await UserBlock.find({
        $or: [
          { blockerId: userId, blockedId: { $in: otherUserIds } },
          { blockerId: { $in: otherUserIds }, blockedId: userId },
        ],
      })
        .select('blockerId blockedId')
        .lean()
        .exec();
      for (const b of blockDocs) {
        const isMeTheBlocker = String(b.blockerId) === String(userId);
        const otherId = isMeTheBlocker ? b.blockedId : b.blockerId;
        if (otherId) blockedOtherUserIdSet.add(String(otherId));
      }
    }

    // Unread counts: one aggregate query for the page.
    const unreadOr = page
      .map((c) => {
        const state = stateMap.get(String(c._id));
        const lastReadAt = state?.lastReadAt || null;
        const base = {
          conversationId: c.channel,
          receiverId: userId,
          deleted: false,
          deletedFor: { $ne: userId },
          // Don't count system placeholders as unread.
          type: { $ne: 'system' },
          // Don't count expired messages as unread.
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        };
        if (!lastReadAt) return base;
        return { ...base, timestamp: { $gt: lastReadAt } };
      })
      .filter(Boolean);

    const unreadMap = new Map();
    if (unreadOr.length > 0) {
      const counts = await ChatMessage.aggregate([
        { $match: { $or: unreadOr } },
        { $group: { _id: '$conversationId', count: { $sum: 1 } } },
      ]).exec();
      counts.forEach((c) => unreadMap.set(String(c._id), c.count));
    }

    const items = page.map((c) => {
      const state = stateMap.get(String(c._id)) || null;
      const otherUserId = (c.participants || []).map(String).find((id) => id !== userId) || null;
      const lastMessage = c.lastMessageId ? lastMsgMap.get(String(c.lastMessageId)) || null : null;
      const isBlocked = otherUserId ? blockedOtherUserIdSet.has(String(otherUserId)) : false;
      const lastMessageExpired =
        !!lastMessage &&
        lastMessage.type !== 'system' &&
        lastMessage.expiresAt &&
        new Date(lastMessage.expiresAt) <= now;

      return {
        id: String(c._id),
        kind: c.kind,
        channelId: String(c.channel),
        participants: (c.participants || []).map(String),
        otherUserId,
        lastMessageId: c.lastMessageId ? String(c.lastMessageId) : null,
        lastMessageAt: c.lastMessageAt || null,
        lastMessage: lastMessage
          ? isBlocked
            ? null
            : lastMessageExpired
              ? {
                  id: String(lastMessage._id),
                  conversationId: String(lastMessage.conversationId),
                  senderId: String(lastMessage.senderId),
                  receiverId: lastMessage.receiverId ? String(lastMessage.receiverId) : null,
                  content: EXPIRED_PLACEHOLDER,
                  type: 'system',
                  timestamp: lastMessage.timestamp,
                  status: 'sent',
                  deliveredAt: null,
                  readAt: null,
                  deleted: false,
                }
              : {
                  id: String(lastMessage._id),
                  conversationId: String(lastMessage.conversationId),
                  senderId: String(lastMessage.senderId),
                  receiverId: lastMessage.receiverId ? String(lastMessage.receiverId) : null,
                  content: lastMessage.content,
                  type: lastMessage.type,
                  timestamp: lastMessage.timestamp,
                  status: lastMessage.status,
                  deliveredAt: lastMessage.deliveredAt || null,
                  readAt: lastMessage.readAt || null,
                  deleted: !!lastMessage.deleted,
                }
          : null,
        state: state
          ? {
              lastSeenAt: state.lastSeenAt || null,
              lastReadAt: state.lastReadAt || null,
            }
          : { lastSeenAt: null, lastReadAt: null },
        unreadCount: isBlocked || lastMessageExpired ? 0 : unreadMap.get(String(c.channel)) || 0,
      };
    });

    return res.status(200).json({ conversations: items, nextCursor });
  } catch (err) {
    console.error('GET /conversations error', err);
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

const PRESETS = new Set(['off', '1h', '8h', '1w', 'forever']);

async function requireChannelMembership(channelId, userId) {
  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    return { error: 'Invalid channelId', status: 400 };
  }
  const channel = await Channel.findById(channelId).select('_id type isArchived').lean().exec();
  if (!channel || channel.isArchived) {
    return { error: 'Channel not found', status: 404 };
  }
  const membership = await ChannelMember.findOne({ channel: channelId, user: userId })
    .select('_id')
    .lean()
    .exec();
  if (!membership) {
    return { error: 'Not a member of this conversation', status: 403 };
  }
  return { channel };
}

// GET /conversations/:channelId/notification-prefs
router.get('/:channelId/notification-prefs', async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId } = req.params;
    const gate = await requireChannelMembership(channelId, userId);
    if (gate.error) return res.status(gate.status).json({ error: gate.error });

    const now = new Date();
    const userOid = new mongoose.Types.ObjectId(String(userId));
    const channelOid = new mongoose.Types.ObjectId(String(channelId));

    let doc = await ConversationNotificationPreference.findOne({ userId: userOid, channelId: channelOid })
      .select('muted mutedUntil updatedAt')
      .lean()
      .exec();

    if (doc && doc.muted && doc.mutedUntil) {
      const until = new Date(doc.mutedUntil);
      if (!Number.isNaN(until.getTime()) && until.getTime() <= now.getTime()) {
        await ConversationNotificationPreference.updateOne(
          { userId: userOid, channelId: channelOid },
          { $set: { muted: false, mutedUntil: null } },
        ).exec();
        doc = { ...doc, muted: false, mutedUntil: null };
      }
    }

    const muted = doc ? isConversationNotificationMuted(doc, now) : false;
    const mutedUntilIso =
      doc && doc.mutedUntil && isConversationNotificationMuted(doc, now)
        ? new Date(doc.mutedUntil).toISOString()
        : null;

    return res.status(200).json({
      muted,
      mutedUntil: mutedUntilIso,
    });
  } catch (err) {
    console.error('GET /conversations/:channelId/notification-prefs error', err);
    return res.status(500).json({ error: 'Failed to load notification preferences' });
  }
});

// PUT /conversations/:channelId/notification-prefs  { preset: 'off' | '1h' | '8h' | '1w' | 'forever' }
router.put('/:channelId/notification-prefs', async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId } = req.params;
    const gate = await requireChannelMembership(channelId, userId);
    if (gate.error) return res.status(gate.status).json({ error: gate.error });

    const preset = req.body && req.body.preset != null ? String(req.body.preset) : '';
    if (!PRESETS.has(preset)) {
      return res.status(400).json({ error: `preset must be one of: ${[...PRESETS].join(', ')}` });
    }

    const userOid = new mongoose.Types.ObjectId(String(userId));
    const channelOid = new mongoose.Types.ObjectId(String(channelId));
    const now = new Date();
    if (preset === 'off') {
      await ConversationNotificationPreference.deleteOne({ userId: userOid, channelId: channelOid }).exec();
      return res.status(200).json({ muted: false, mutedUntil: null });
    }

    let mutedUntil = null;
    if (preset === '1h') mutedUntil = new Date(now.getTime() + 60 * 60 * 1000);
    else if (preset === '8h') mutedUntil = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    else if (preset === '1w') mutedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    else if (preset === 'forever') mutedUntil = null;

    await ConversationNotificationPreference.findOneAndUpdate(
      { userId: userOid, channelId: channelOid },
      { $set: { muted: true, mutedUntil } },
      { upsert: true, new: true },
    ).exec();

    const mutedUntilIso = mutedUntil ? mutedUntil.toISOString() : null;
    return res.status(200).json({
      muted: true,
      mutedUntil: mutedUntilIso,
    });
  } catch (err) {
    console.error('PUT /conversations/:channelId/notification-prefs error', err);
    return res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

module.exports = router;

