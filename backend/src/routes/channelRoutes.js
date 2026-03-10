const express = require('express');
const mongoose = require('mongoose');
const { Channel, CHANNEL_TYPES, ChannelMember } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

router.use(requireAuth);

// GET /channels - list channels current user is a member of
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const memberships = await ChannelMember.find({ user: userId }).select('channel').lean().exec();
    const channelIds = memberships.map((m) => m.channel);

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

    const channel = await Channel.create({
      name: name.trim(),
      description: (description || '').trim(),
      type,
      createdBy: userId,
      metadata: metadata || {},
    });

    await ChannelMember.create({
      channel: channel._id,
      user: userId,
      isAdmin: true,
      canPost: true,
      canManageMembers: true,
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

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('POST /channels/:id/leave error', err);
    return res.status(500).json({ error: 'Failed to leave channel' });
  }
});

module.exports = router;

