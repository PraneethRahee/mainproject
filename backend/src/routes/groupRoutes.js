const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const {
  Channel,
  ChannelMember,
  AuditLog,
  GroupInviteLink,
  GroupJoinRequest,
  User,
} = require('../models');
const { requireAuth } = require('../middleware/auth');
const { writeAuditLog, getRequestClientInfo } = require('../middleware/audit');

const router = express.Router();

router.use(requireAuth);

async function requireGroupAdmin(groupId, userId) {
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    const err = new Error('Invalid groupId');
    err.statusCode = 400;
    throw err;
  }

  const channel = await Channel.findOne({ _id: groupId, type: 'group' })
    .select('_id name metadata')
    .lean()
    .exec();
  if (!channel) {
    const err = new Error('Group not found');
    err.statusCode = 404;
    throw err;
  }

  const membership = await ChannelMember.findOne({
    channel: groupId,
    user: userId,
  })
    .select('isAdmin')
    .lean()
    .exec();

  if (!membership) {
    const err = new Error('Not allowed');
    err.statusCode = 403;
    throw err;
  }

  const whoCanAddMembers = channel?.metadata?.whoCanAddMembers || 'adminsOnly';
  const allowed = whoCanAddMembers === 'everyone' ? true : Boolean(membership?.isAdmin);
  if (!allowed) {
    const err = new Error('Not allowed');
    err.statusCode = 403;
    throw err;
  }

  return channel;
}

async function requireGroupEditor(groupId, userId) {
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    const err = new Error('Invalid groupId');
    err.statusCode = 400;
    throw err;
  }

  const channel = await Channel.findOne({ _id: groupId, type: 'group' })
    .select('_id name metadata')
    .lean()
    .exec();
  if (!channel) {
    const err = new Error('Group not found');
    err.statusCode = 404;
    throw err;
  }

  const membership = await ChannelMember.findOne({ channel: groupId, user: userId })
    .select('isAdmin')
    .lean()
    .exec();

  if (!membership) {
    const err = new Error('Not allowed');
    err.statusCode = 403;
    throw err;
  }

  const whoCanEditInfo = channel?.metadata?.whoCanEditInfo || 'adminsOnly';
  const allowed = whoCanEditInfo === 'everyone' ? true : Boolean(membership?.isAdmin);
  if (!allowed) {
    const err = new Error('Not allowed');
    err.statusCode = 403;
    throw err;
  }

  return channel;
}

async function findGroupOr404(groupId) {
  if (!mongoose.Types.ObjectId.isValid(groupId)) return null;
  return Channel.findOne({ _id: groupId, type: 'group' }).select('_id name metadata').lean().exec();
}

function generateInviteToken() {
  // base64url-ish token without padding.
  return crypto
    .randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

// POST /group
// Body: { groupName, memberIds: [], adminIds?: [] }
router.post('/group', async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupName, memberIds, adminIds } = req.body || {};

    if (!groupName || typeof groupName !== 'string' || !groupName.trim()) {
      return res.status(400).json({ error: 'groupName is required' });
    }

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'memberIds is required' });
    }

    const cleanMembers = Array.from(
      new Set(memberIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map(String)),
    );
    if (!cleanMembers.length) {
      return res.status(400).json({ error: 'memberIds contains no valid userIds' });
    }

    // Creator must be a member; default admin if not specified.
    const members = cleanMembers.includes(String(userId)) ? cleanMembers : [...cleanMembers, String(userId)];

    let admins = Array.isArray(adminIds) ? adminIds : [String(userId)];
    admins = Array.from(new Set(admins.filter((id) => mongoose.Types.ObjectId.isValid(id)).map(String)));

    // Ensure admins are subset of members.
    admins = admins.filter((id) => members.includes(id));
    if (!admins.includes(String(userId))) admins.push(String(userId));

    const channel = await Channel.create({
      name: groupName.trim(),
      type: 'group',
      description: '',
      createdBy: userId,
      metadata: {
        whoCanSend: 'everyone',
        whoCanEditInfo: 'adminsOnly',
        whoCanAddMembers: 'adminsOnly',
        joinPolicy: 'open',
      },
    });

    // Bulk-create membership docs.
    await Promise.all(
      members.map((memberId) =>
        ChannelMember.create({
          channel: channel._id,
          user: memberId,
          isAdmin: admins.includes(memberId),
          canPost: true,
          canManageMembers: admins.includes(memberId),
        }),
      ),
    );

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'group.create',
      targetType: 'channel',
      targetId: String(channel._id),
      result: 'success',
      ip,
      userAgent,
      metadata: {},
    });

    return res.status(201).json({
      groupId: String(channel._id),
      groupName: channel.name,
      members,
      admins,
    });
  } catch (err) {
    console.error('POST /group error', err);
    return res.status(500).json({ error: 'Failed to create group' });
  }
});

// POST /group/:groupId/members (admin adds member)
router.post('/group/:groupId/members', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const { memberId } = req.body || {};

    if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ error: 'memberId is required' });
    }

    await requireGroupAdmin(groupId, userId);

    await ChannelMember.updateOne(
      { channel: groupId, user: memberId },
      {
        $setOnInsert: {
          channel: groupId,
          user: memberId,
          isAdmin: false,
          canPost: true,
          canManageMembers: false,
        },
      },
      { upsert: true },
    ).exec();

    const all = await ChannelMember.find({ channel: groupId }).select('user isAdmin').lean().exec();
    const members = all.map((m) => String(m.user));
    const admins = all.filter((m) => m.isAdmin).map((m) => String(m.user));

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'group.member.add',
      targetType: 'channel',
      targetId: String(groupId),
      result: 'success',
      ip,
      userAgent,
      metadata: { memberId: String(memberId) },
    });

    return res.status(200).json({
      ok: true,
      members,
      admins,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('POST /group/:groupId/members error', err);
    return res.status(status).json({ error: err.message || 'Failed to add member' });
  }
});

// POST /group/:groupId/admins (admin promotes member)
router.post('/group/:groupId/admins', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const { adminId } = req.body || {};

    if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({ error: 'adminId is required' });
    }

    await requireGroupAdmin(groupId, userId);

    const member = await ChannelMember.findOne({ channel: groupId, user: adminId }).lean().exec();
    if (!member) {
      return res.status(400).json({ error: 'adminId must already be a member' });
    }

    await ChannelMember.updateOne(
      { channel: groupId, user: adminId },
      { $set: { isAdmin: true, canManageMembers: true } },
    ).exec();

    const all = await ChannelMember.find({ channel: groupId }).select('user isAdmin').lean().exec();
    const members = all.map((m) => String(m.user));
    const admins = all.filter((m) => m.isAdmin).map((m) => String(m.user));

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'group.admin.promote',
      targetType: 'channel',
      targetId: String(groupId),
      result: 'success',
      ip,
      userAgent,
      metadata: { adminId: String(adminId) },
    });

    return res.status(200).json({
      ok: true,
      members,
      admins,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('POST /group/:groupId/admins error', err);
    return res.status(status).json({ error: err.message || 'Failed to promote admin' });
  }
});

// DELETE /group/:groupId/admins/:adminId (admin demotes another admin)
router.delete('/group/:groupId/admins/:adminId', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const adminId = req.params.adminId;

    if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({ error: 'Invalid adminId' });
    }

    await requireGroupAdmin(groupId, userId);

    const membership = await ChannelMember.findOne({ channel: groupId, user: adminId }).lean().exec();
    if (!membership) {
      return res.status(404).json({ error: 'Admin member not found' });
    }
    if (!membership.isAdmin) {
      return res.status(400).json({ error: 'User is not an admin' });
    }

    const otherAdmins = await ChannelMember.countDocuments({
      channel: groupId,
      user: { $ne: adminId },
      isAdmin: true,
    }).exec();
    if (otherAdmins === 0) {
      return res.status(400).json({ error: 'Cannot demote the last group admin' });
    }

    await ChannelMember.updateOne(
      { channel: groupId, user: adminId },
      { $set: { isAdmin: false, canManageMembers: false } },
    ).exec();

    const all = await ChannelMember.find({ channel: groupId }).select('user isAdmin').lean().exec();
    const members = all.map((m) => String(m.user));
    const admins = all.filter((m) => m.isAdmin).map((m) => String(m.user));

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'group.admin.demote',
      targetType: 'channel',
      targetId: String(groupId),
      result: 'success',
      ip,
      userAgent,
      metadata: { adminId: String(adminId) },
    });

    return res.status(200).json({
      ok: true,
      members,
      admins,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('DELETE /group/:groupId/admins/:adminId error', err);
    return res.status(status).json({ error: err.message || 'Failed to demote admin' });
  }
});

// DELETE /group/:groupId/members/:memberId (admin removes member)
router.delete('/group/:groupId/members/:memberId', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const memberId = req.params.memberId;

    if (!mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ error: 'Invalid memberId' });
    }

    await requireGroupAdmin(groupId, userId);

    const membership = await ChannelMember.findOne({ channel: groupId, user: memberId }).lean().exec();
    if (!membership) {
      return res.status(200).json({ ok: true });
    }

    const removingIsAdmin = Boolean(membership.isAdmin);
    if (removingIsAdmin) {
      const otherAdmins = await ChannelMember.countDocuments({
        channel: groupId,
        user: { $ne: memberId },
        isAdmin: true,
      }).exec();
      if (otherAdmins === 0) {
      return res.status(400).json({ error: 'Cannot remove the last group admin' });
      }
    }

    await ChannelMember.deleteOne({ channel: groupId, user: memberId }).exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'group.member.remove',
      targetType: 'channel',
      targetId: String(groupId),
      result: 'success',
      ip,
      userAgent,
      metadata: { memberId: String(memberId) },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('DELETE /group/:groupId/members/:memberId error', err);
    return res.status(status).json({ error: err.message || 'Failed to remove member' });
  }
});

// PATCH /group/:groupId/info
// Body: { groupName?, description? }
router.patch('/group/:groupId/info', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const { groupName, description } = req.body || {};

    const channel = await requireGroupEditor(groupId, userId);

    const update = {};
    if (typeof groupName === 'string' && groupName.trim()) update.name = groupName.trim();
    if (typeof description === 'string') update.description = description.trim();

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    await Channel.updateOne({ _id: groupId }, { $set: update }).exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'group.info.update',
      targetType: 'channel',
      targetId: String(groupId),
      result: 'success',
      ip,
      userAgent,
      metadata: {},
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('PATCH /group/:groupId/info error', err);
    return res.status(status).json({ error: err.message || 'Failed to update group info' });
  }
});

// PATCH /group/:groupId/settings
// Body: { whoCanSend?, whoCanEditInfo?, whoCanAddMembers?, joinPolicy?, disappearingMessagesSeconds? }
router.patch('/group/:groupId/settings', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const { whoCanSend, whoCanEditInfo, whoCanAddMembers, joinPolicy, disappearingMessagesSeconds } = req.body || {};

    await requireGroupEditor(groupId, userId);

    const allowedWhoCan = ['everyone', 'adminsOnly'];
    const allowedJoinPolicy = ['open', 'approval'];
    const MAX_DISAPPEARING_SECONDS = 30 * 24 * 60 * 60; // 30 days

    const $set = {};
    if (whoCanSend !== undefined) {
      if (!allowedWhoCan.includes(String(whoCanSend))) return res.status(400).json({ error: 'Invalid whoCanSend' });
      $set['metadata.whoCanSend'] = String(whoCanSend);
    }
    if (whoCanEditInfo !== undefined) {
      if (!allowedWhoCan.includes(String(whoCanEditInfo))) return res.status(400).json({ error: 'Invalid whoCanEditInfo' });
      $set['metadata.whoCanEditInfo'] = String(whoCanEditInfo);
    }
    if (whoCanAddMembers !== undefined) {
      if (!allowedWhoCan.includes(String(whoCanAddMembers))) return res.status(400).json({ error: 'Invalid whoCanAddMembers' });
      $set['metadata.whoCanAddMembers'] = String(whoCanAddMembers);
    }
    if (joinPolicy !== undefined) {
      if (!allowedJoinPolicy.includes(String(joinPolicy))) return res.status(400).json({ error: 'Invalid joinPolicy' });
      $set['metadata.joinPolicy'] = String(joinPolicy);
    }

    if (disappearingMessagesSeconds !== undefined) {
      const n = Number(disappearingMessagesSeconds);
      if (!Number.isFinite(n) || n < 0 || n > MAX_DISAPPEARING_SECONDS) {
        return res.status(400).json({ error: `disappearingMessagesSeconds must be between 0 and ${MAX_DISAPPEARING_SECONDS}` });
      }
      $set['metadata.disappearingMessagesSeconds'] = Math.floor(n);
    }

    if (Object.keys($set).length === 0) return res.status(400).json({ error: 'Nothing to update' });

    await Channel.updateOne({ _id: groupId }, { $set }).exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'group.settings.update',
      targetType: 'channel',
      targetId: String(groupId),
      result: 'success',
      ip,
      userAgent,
      metadata: Object.fromEntries(Object.keys($set).map((k) => [k, $set[k]])),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('PATCH /group/:groupId/settings error', err);
    return res.status(status).json({ error: err.message || 'Failed to update group settings' });
  }
});

// POST /group/:groupId/invite-link
router.post('/group/:groupId/invite-link', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;

    await requireGroupAdmin(groupId, userId);

    const expiresInSecondsRaw = req.body?.expiresInSeconds;
    const expiresInSeconds = Number(expiresInSecondsRaw);
    const DEFAULT_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
    const MAX_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days

    const expirySeconds =
      Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
        ? Math.min(expiresInSeconds, MAX_EXPIRY_SECONDS)
        : DEFAULT_EXPIRY_SECONDS;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expirySeconds * 1000);

    await GroupInviteLink.updateMany(
      { groupId, revokedAt: null, usedAt: null },
      { $set: { revokedAt: now } },
    ).exec();

    let token = generateInviteToken();
    // Extremely unlikely collision; try a couple times.
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await GroupInviteLink.findOne({ token }).select('_id').lean().exec();
      if (!existing) break;
      token = generateInviteToken();
    }

    const invite = await GroupInviteLink.create({
      groupId,
      token,
      createdBy: userId,
      expiresAt,
    });

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'group.invite_link.create',
      targetType: 'channel',
      targetId: String(groupId),
      result: 'success',
      ip,
      userAgent,
      metadata: { expiresAt: invite.expiresAt?.toISOString?.() || null },
    });

    return res.status(201).json({
      ok: true,
      token: invite.token,
      expiresAt: invite.expiresAt,
      invitePath: `/group/join/${invite.token}`,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('POST /group/:groupId/invite-link error', err);
    return res.status(status).json({ error: err.message || 'Failed to create invite link' });
  }
});

// DELETE /group/:groupId/invite-link
router.delete('/group/:groupId/invite-link', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;

    await requireGroupAdmin(groupId, userId);

    const now = new Date();
    await GroupInviteLink.updateMany(
      { groupId, revokedAt: null, usedAt: null },
      { $set: { revokedAt: now } },
    ).exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'group.invite_link.revoke',
      targetType: 'channel',
      targetId: String(groupId),
      result: 'success',
      ip,
      userAgent,
      metadata: {},
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('DELETE /group/:groupId/invite-link error', err);
    return res.status(status).json({ error: err.message || 'Failed to revoke invite link' });
  }
});

// POST /group/join-by-link
// Body: { token }
router.post('/group/join-by-link', async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body || {};

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'token is required' });
    }

    const now = new Date();
    const existing = await GroupInviteLink.findOne({ token }).lean().exec();
    if (!existing) return res.status(404).json({ error: 'Invite token not found' });

    if (existing.revokedAt) return res.status(403).json({ error: 'Invite token revoked' });
    if (existing.usedAt) return res.status(403).json({ error: 'Invite token already used' });
    if (!existing.expiresAt || existing.expiresAt <= now) return res.status(403).json({ error: 'Invite token expired' });

    // Single-use: mark token used now.
    const updated = await GroupInviteLink.findOneAndUpdate(
      { _id: existing._id, revokedAt: null, usedAt: null, expiresAt: { $gt: now } },
      { $set: { usedAt: now, usedBy: userId } },
      { new: true },
    ).lean().exec();

    if (!updated) {
      return res.status(403).json({ error: 'Invite token already used/revoked/expired' });
    }

    const group = await findGroupOr404(String(existing.groupId));
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const membership = await ChannelMember.findOne({ channel: group._id, user: userId }).lean().exec();

    const joinPolicy = group?.metadata?.joinPolicy || 'open';
    if (joinPolicy === 'approval') {
      if (!membership) {
        const request = await GroupJoinRequest.findOneAndUpdate(
          { groupId: group._id, userId, status: 'pending' },
          { $setOnInsert: { groupId: group._id, userId } },
          { upsert: true, new: true },
        )
          .lean()
          .exec();

        const { ip, userAgent } = getRequestClientInfo(req);
        await writeAuditLog({
          actorId: userId,
          action: 'group.join_request.create_from_invite',
          targetType: 'channel',
          targetId: String(group._id),
          result: 'success',
          ip,
          userAgent,
          metadata: { requestId: request?._id ? String(request._id) : null },
        });

        return res.status(200).json({
          ok: true,
          status: 'requested',
          groupId: String(group._id),
          requestId: request?._id ? String(request._id) : null,
        });
      }

      return res.status(200).json({
        ok: true,
        status: 'already_member',
        groupId: String(group._id),
      });
    }

    // Open group: add membership directly.
    if (!membership) {
      await ChannelMember.create({
        channel: group._id,
        user: userId,
        isAdmin: false,
        canPost: true,
        canManageMembers: false,
      });
    }

    return res.status(200).json({
      ok: true,
      status: membership ? 'already_member' : 'joined',
      groupId: String(group._id),
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('POST /group/join-by-link error', err);
    return res.status(status).json({ error: err.message || 'Failed to join via invite link' });
  }
});

// POST /group/:groupId/join-request (non-members)
router.post('/group/:groupId/join-request', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;

    const group = await findGroupOr404(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const membership = await ChannelMember.findOne({ channel: groupId, user: userId }).lean().exec();
    if (membership) return res.status(200).json({ ok: true, status: 'already_member' });

    const joinPolicy = group?.metadata?.joinPolicy || 'open';
    if (joinPolicy !== 'approval') {
      return res.status(400).json({ error: 'Group does not require join requests' });
    }

    const request = await GroupJoinRequest.findOneAndUpdate(
      { groupId, userId, status: 'pending' },
      { $setOnInsert: { groupId, userId } },
      { upsert: true, new: true },
    )
      .lean()
      .exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'group.join_request.create',
      targetType: 'channel',
      targetId: String(groupId),
      result: 'success',
      ip,
      userAgent,
      metadata: { requestId: request?._id ? String(request._id) : null },
    });

    return res.status(201).json({
      ok: true,
      status: 'requested',
      groupId: String(groupId),
      requestId: request?._id ? String(request._id) : null,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('POST /group/:groupId/join-request error', err);
    return res.status(status).json({ error: err.message || 'Failed to request to join' });
  }
});

// GET /group/:groupId/join-request-status (requester-facing)
// Lets a non-member see if their request is pending/approved/rejected.
router.get('/group/:groupId/join-request-status', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: 'Invalid groupId' });
    }

    const membership = await ChannelMember.findOne({ channel: groupId, user: userId })
      .select('_id')
      .lean()
      .exec();

    if (membership) {
      return res.status(200).json({ ok: true, status: 'already_member' });
    }

    const request = await GroupJoinRequest.findOne({ groupId, userId })
      .sort({ requestedAt: -1 })
      .lean()
      .exec();

    if (!request) {
      return res.status(200).json({ ok: true, status: 'no_request' });
    }

    return res.status(200).json({
      ok: true,
      status: request.status,
      requestId: String(request._id),
      requestedAt: request.requestedAt || null,
      decidedAt: request.decidedAt || null,
      decisionReason: request.decisionReason || '',
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('GET /group/:groupId/join-request-status error', err);
    return res.status(status).json({ error: err.message || 'Failed to fetch join request status' });
  }
});

// GET /group/:groupId/join-requests (admins)
router.get('/group/:groupId/join-requests', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const { limit } = req.query || {};

    await requireGroupAdmin(groupId, userId);

    const pageSize = Math.min(parseInt(limit, 10) || 50, 200);
    const requests = await GroupJoinRequest.find({ groupId, status: 'pending' })
      .sort({ requestedAt: -1 })
      .limit(pageSize)
      .lean()
      .exec();

    const requesterIds = Array.from(new Set(requests.map((r) => String(r.userId))));
    const users = await User.find({ _id: { $in: requesterIds } })
      .select('_id displayName email avatarUrl role')
      .lean()
      .exec();
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const items = requests.map((r) => {
      const u = userById.get(String(r.userId));
      return {
        requestId: String(r._id),
        userId: String(r.userId),
        displayName: u?.displayName || 'Unknown user',
        email: u?.email || '',
        avatarUrl: u?.avatarUrl || null,
        role: u?.role || 'member',
        requestedAt: r.requestedAt,
        decisionStatus: r.status,
      };
    });

    return res.status(200).json({ ok: true, items });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('GET /group/:groupId/join-requests error', err);
    return res.status(status).json({ error: err.message || 'Failed to fetch join requests' });
  }
});

// POST /group/:groupId/join-requests/:requestId/approve
router.post('/group/:groupId/join-requests/:requestId/approve', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const requestId = req.params.requestId;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ error: 'Invalid requestId' });
    }

    await requireGroupAdmin(groupId, userId);

    const request = await GroupJoinRequest.findOne({ _id: requestId, groupId, status: 'pending' }).lean().exec();
    if (!request) return res.status(404).json({ error: 'Join request not found' });

    await ChannelMember.updateOne(
      { channel: groupId, user: request.userId },
      { $setOnInsert: { channel: groupId, user: request.userId, isAdmin: false, canPost: true, canManageMembers: false } },
      { upsert: true },
    ).exec();

    await GroupJoinRequest.updateOne(
      { _id: requestId, groupId },
      { $set: { status: 'approved', decidedAt: new Date(), decidedBy: userId } },
    ).exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'group.join_request.approve',
      targetType: 'channel',
      targetId: String(groupId),
      result: 'success',
      ip,
      userAgent,
      metadata: { requestId: String(requestId), userId: String(request.userId) },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('POST /group/:groupId/join-requests/:requestId/approve error', err);
    return res.status(status).json({ error: err.message || 'Failed to approve join request' });
  }
});

// POST /group/:groupId/join-requests/:requestId/reject
router.post('/group/:groupId/join-requests/:requestId/reject', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const requestId = req.params.requestId;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ error: 'Invalid requestId' });
    }

    await requireGroupAdmin(groupId, userId);

    const request = await GroupJoinRequest.findOne({ _id: requestId, groupId, status: 'pending' }).lean().exec();
    if (!request) return res.status(404).json({ error: 'Join request not found' });

    await GroupJoinRequest.updateOne(
      { _id: requestId, groupId },
      { $set: { status: 'rejected', decidedAt: new Date(), decidedBy: userId } },
    ).exec();

    const { ip, userAgent } = getRequestClientInfo(req);
    await writeAuditLog({
      actorId: userId,
      action: 'group.join_request.reject',
      targetType: 'channel',
      targetId: String(groupId),
      result: 'success',
      ip,
      userAgent,
      metadata: { requestId: String(requestId), userId: String(request.userId) },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('POST /group/:groupId/join-requests/:requestId/reject error', err);
    return res.status(status).json({ error: err.message || 'Failed to reject join request' });
  }
});

// GET /group/:groupId/audit-logs (group admins)
router.get('/group/:groupId/audit-logs', async (req, res) => {
  try {
    const userId = req.user.id;
    const groupId = req.params.groupId;
    const { limit } = req.query || {};

    await requireGroupEditor(groupId, userId);

    const pageSize = Math.min(parseInt(limit, 10) || 20, 100);

    const logs = await AuditLog.find({
      targetType: 'channel',
      targetId: String(groupId),
    })
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .lean()
      .exec();

    const actorIds = Array.from(new Set(logs.map((l) => (l.actor ? String(l.actor) : null)).filter(Boolean)));
    const users = await User.find({ _id: { $in: actorIds } })
      .select('_id displayName email avatarUrl')
      .lean()
      .exec();
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const items = logs.map((l) => ({
      id: String(l._id),
      actorId: l.actor ? String(l.actor) : null,
      actorName: l.actor ? userById.get(String(l.actor))?.displayName || userById.get(String(l.actor))?.email || 'Unknown user' : null,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      result: l.result,
      createdAt: l.createdAt,
      metadata: l.metadata || {},
    }));

    return res.status(200).json({ ok: true, items });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('GET /group/:groupId/audit-logs error', err);
    return res.status(status).json({ error: err.message || 'Failed to fetch audit logs' });
  }
});

module.exports = router;

