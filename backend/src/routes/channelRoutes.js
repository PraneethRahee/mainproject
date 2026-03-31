const express = require('express');
const mongoose = require('mongoose');
const { Channel, CHANNEL_TYPES, ChannelMember, User } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { writeAuditLog, getRequestClientInfo } = require('../middleware/audit');

const router = express.Router();

router.use(requireAuth);

/**
 * College roll emails: local part starts with two admission-year digits (e.g. 22p61a3246@vbithyd.ac.in → 22).
 */
function parseAdmissionYearPrefix(email) {
  if (!email || typeof email !== 'string') return null;
  const local = email.split('@')[0] || '';
  const m = /^(\d{2})/.exec(local);
  return m ? m[1] : null;
}

async function addChannelMember(userId, channelId, isAdmin) {
  const existing = await ChannelMember.findOne({ channel: channelId, user: userId }).lean().exec();
  if (existing) return;
  await ChannelMember.create({
    channel: channelId,
    user: userId,
    isAdmin,
    canPost: true,
    canManageMembers: isAdmin,
  });
}

/**
 * Find or create the shared cohort channel for this admission year; all students with the same
 * two-digit prefix (22, 23, …) become members of one channel.
 */
async function ensureCohortChannelForUser(userId, cohortYear) {
  let channel = await Channel.findOne({
    'metadata.isCohortChannel': true,
    'metadata.cohortYear': cohortYear,
  })
    .exec();

  if (!channel) {
    try {
      channel = await Channel.create({
        name: `batch-${cohortYear}`,
        description: `Admission cohort ${cohortYear} — everyone whose roll number starts with ${cohortYear} is in this channel.`,
        type: 'group',
        createdBy: userId,
        metadata: { isCohortChannel: true, cohortYear },
      });
    } catch (err) {
      if (err && err.code === 11000) {
        channel = await Channel.findOne({
          'metadata.isCohortChannel': true,
          'metadata.cohortYear': cohortYear,
        }).exec();
      } else {
        throw err;
      }
    }
  }

  if (!channel) return;
  const memberCount = await ChannelMember.countDocuments({ channel: channel._id }).exec();
  await addChannelMember(userId, channel._id, memberCount === 0);
}

/**
 * One shared #general for the whole college (not a separate empty channel per user).
 */
async function ensureCollegeWideGeneralForUser(userId) {
  let channel = await Channel.findOne({ 'metadata.isCollegeWideGeneral': true }).exec();

  if (!channel) {
    try {
      channel = await Channel.create({
        name: 'general',
        description: 'College-wide — everyone can chat here.',
        type: 'group',
        createdBy: userId,
        metadata: { isDefault: true, isCollegeWideGeneral: true },
      });
    } catch (err) {
      if (err && err.code === 11000) {
        channel = await Channel.findOne({ 'metadata.isCollegeWideGeneral': true }).exec();
      } else {
        throw err;
      }
    }
  }

  if (!channel) return;
  const memberCount = await ChannelMember.countDocuments({ channel: channel._id }).exec();
  const isFirstMember = memberCount === 0;
  await addChannelMember(userId, channel._id, isFirstMember);
}

/**
 * New users had no ChannelMember rows, so the chat UI had no active channel. Bootstrap:
 * - cohort channel from email prefix (22 → batch-22), shared by all students with that prefix
 * - one shared #general for the whole college
 */
async function ensureBootstrapChannelsForUser(userId, email) {
  const count = await ChannelMember.countDocuments({ user: userId }).exec();
  if (count > 0) return;

  const cohortYear = parseAdmissionYearPrefix(email);
  if (cohortYear) {
    await ensureCohortChannelForUser(userId, cohortYear);
  }

  await ensureCollegeWideGeneralForUser(userId);
}

// GET /channels - list channels current user is a member of
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    let memberships = await ChannelMember.find({ user: userId }).select('channel').lean().exec();
    let channelIds = memberships.map((m) => m.channel);

    if (channelIds.length === 0) {
      const userDoc = await User.findById(userId).select('email').lean().exec();
      await ensureBootstrapChannelsForUser(userId, userDoc?.email || '');
      memberships = await ChannelMember.find({ user: userId }).select('channel').lean().exec();
      channelIds = memberships.map((m) => m.channel);
    }

    const channels = await Channel.find({ _id: { $in: channelIds }, isArchived: false })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .lean()
      .exec();

    return res.status(200).json({ channels });
  } catch (err) {
    console.error('GET /channels error', err);
    return res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// POST /channels - create channel (member/admin only)
router.post('/', requireRole(['admin', 'member']), async (req, res) => {
  try {
    const { name, type = 'group', description, metadata } = req.body || {};
    const userId = req.user.id;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Channel name is required' });
    }

    if (!CHANNEL_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid channel type. Allowed: ${CHANNEL_TYPES.join(', ')}` });
    }

    const metadataFinal =
      type === 'group'
        ? {
            whoCanSend: 'everyone',
            whoCanEditInfo: 'adminsOnly',
            whoCanAddMembers: 'adminsOnly',
            joinPolicy: 'open',
            ...(metadata || {}),
          }
        : metadata || {};

    const channel = await Channel.create({
      name: name.trim(),
      description: (description || '').trim(),
      type,
      createdBy: userId,
      metadata: metadataFinal,
    });

    await ChannelMember.create({
      channel: channel._id,
      user: userId,
      isAdmin: true,
      canPost: true,
      canManageMembers: true,
    });

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'channel.create',
      targetType: 'channel',
      targetId: String(channel._id),
      result: 'success',
      ip,
      userAgent,
      metadata: { type },
    });

    return res.status(201).json({ channel });
  } catch (err) {
    console.error('POST /channels error', err);
    return res.status(500).json({ error: 'Failed to create channel' });
  }
});

// Helper: ensure channel exists
async function findChannelOr404(channelId, res) {
  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    res.status(400).json({ error: 'Invalid channel id' });
    return null;
  }
  const channel = await Channel.findById(channelId).lean().exec();
  if (!channel || channel.isArchived) {
    res.status(404).json({ error: 'Channel not found' });
    return null;
  }
  return channel;
}

// GET /channels/:id/info - channel/DM details for current member
router.get('/:id/info', async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ error: 'Invalid channel id' });
    }

    const channel = await Channel.findById(channelId)
      .select('_id name description type createdBy isArchived metadata createdAt updatedAt')
      .lean()
      .exec();
    if (!channel || channel.isArchived) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const viewerMembership = await ChannelMember.findOne({ channel: channelId, user: userId })
      .select('_id')
      .lean()
      .exec();
    if (!viewerMembership) {
      return res.status(403).json({ error: 'Not a member of this channel' });
    }

    const memberships = await ChannelMember.find({ channel: channelId })
      .select('user isAdmin canPost canManageMembers createdAt')
      .lean()
      .exec();

    const userIds = memberships.map((m) => m.user);
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id displayName email avatarUrl role')
      .lean()
      .exec();
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const creatorId = channel.createdBy ? String(channel.createdBy) : null;
    const creatorUser = creatorId ? userById.get(creatorId) || null : null;

    const members = memberships.map((m) => {
      const uid = String(m.user);
      const u = userById.get(uid);
      return {
        id: uid,
        displayName: u?.displayName || 'Unknown user',
        email: u?.email || '',
        avatarUrl: u?.avatarUrl || null,
        role: u?.role || 'member',
        isAdmin: !!m.isAdmin,
        canPost: !!m.canPost,
        canManageMembers: !!m.canManageMembers,
        joinedAt: m.createdAt || null,
      };
    });

    const admins = members.filter((m) => m.isAdmin);

    return res.status(200).json({
      channel: {
        id: String(channel._id),
        name: channel.name,
        description: channel.description || '',
        type: channel.type,
        createdBy: creatorId,
        createdByUser: creatorUser
          ? {
              id: String(creatorUser._id),
              displayName: creatorUser.displayName || 'Unknown user',
              email: creatorUser.email || '',
              avatarUrl: creatorUser.avatarUrl || null,
              role: creatorUser.role || 'member',
            }
          : null,
        createdAt: channel.createdAt || null,
        metadata: channel.metadata || {},
      },
      memberCount: members.length,
      members,
      admins,
    });
  } catch (err) {
    console.error('GET /channels/:id/info error', err);
    return res.status(500).json({ error: 'Failed to fetch channel info' });
  }
});

// POST /channels/:id/join - add user to channel
router.post('/:id/join', requireRole(['admin', 'member', 'guest']), async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = req.user.id;

    const channel = await findChannelOr404(channelId, res);
    if (!channel) return;

    if (channel.type === 'private' && req.user.role === 'guest') {
      return res.status(403).json({ error: 'Guests cannot join private channels' });
    }

    const existing = await ChannelMember.findOne({ channel: channelId, user: userId }).lean().exec();
    if (existing) {
      return res.status(200).json({ success: true, membership: existing });
    }

    const membership = await ChannelMember.create({
      channel: channelId,
      user: userId,
      isAdmin: false,
      canPost: true,
      canManageMembers: false,
    });

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'channel.join',
      targetType: 'channel',
      targetId: String(channelId),
      result: 'success',
      ip,
      userAgent,
      metadata: {},
    });

    return res.status(201).json({ success: true, membership });
  } catch (err) {
    console.error('POST /channels/:id/join error', err);
    return res.status(500).json({ error: 'Failed to join channel' });
  }
});

// POST /channels/:id/leave - remove user from channel
router.post('/:id/leave', requireRole(['admin', 'member', 'guest']), async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = req.user.id;

    const channel = await findChannelOr404(channelId, res);
    if (!channel) return;

    const membership = await ChannelMember.findOne({ channel: channelId, user: userId }).exec();
    if (!membership) {
      return res.status(200).json({ success: true });
    }

    if (membership.isAdmin) {
      const otherAdmins = await ChannelMember.countDocuments({
        channel: channelId,
        _id: { $ne: membership._id },
        isAdmin: true,
      });
      if (otherAdmins === 0) {
        return res.status(400).json({ error: 'Cannot leave as the last channel admin' });
      }
    }

    await ChannelMember.deleteOne({ _id: membership._id });

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'channel.leave',
      targetType: 'channel',
      targetId: String(channelId),
      result: 'success',
      ip,
      userAgent,
      metadata: {},
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('POST /channels/:id/leave error', err);
    return res.status(500).json({ error: 'Failed to leave channel' });
  }
});

// PATCH /channels/:id/disappearing-messages
// Body: { disappearingMessagesSeconds: number } (0 disables)
router.patch('/:id/disappearing-messages', async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = req.user.id;
    const { disappearingMessagesSeconds } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ error: 'Invalid channel id' });
    }
    const n = Number(disappearingMessagesSeconds);
    if (!Number.isFinite(n) || n < 0 || n > 30 * 24 * 60 * 60) {
      return res.status(400).json({ error: 'disappearingMessagesSeconds must be between 0 and 2592000' });
    }

    const channel = await Channel.findById(channelId).select('type isArchived metadata createdBy').lean().exec();
    if (!channel || channel.isArchived) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const membership = await ChannelMember.findOne({ channel: channelId, user: userId })
      .select('isAdmin canPost')
      .lean()
      .exec();
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this channel' });
    }

    // Groups: only admins can configure.
    if (channel.type === 'group' && !membership.isAdmin) {
      return res.status(403).json({ error: 'Only group admins can update disappearing message settings' });
    }

    const seconds = Math.floor(n);
    await Channel.updateOne(
      { _id: channelId },
      { $set: { 'metadata.disappearingMessagesSeconds': seconds } },
    ).exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'channel.disappearing_messages.update',
      targetType: 'channel',
      targetId: String(channelId),
      result: 'success',
      ip,
      userAgent,
      metadata: { disappearingMessagesSeconds: seconds, channelType: channel.type },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('PATCH /channels/:id/disappearing-messages error', err);
    return res.status(status).json({ error: err.message || 'Failed to update disappearing messages settings' });
  }
});

module.exports = router;

