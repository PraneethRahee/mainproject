const mongoose = require('mongoose');
const { ChannelMember } = require('../models');

/**
 * Middleware to ensure the current user is a member of the given channel.
 * Expects :id or :channelId param containing the channel ObjectId string.
 */
function requireChannelMember(paramName = 'id') {
  return async (req, res, next) => {
    const channelId = req.params[paramName];
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ error: 'Invalid channel id' });
    }

    try {
      const membership = await ChannelMember.findOne({
        channel: channelId,
        user: userId,
      })
        .select('channel user isAdmin canPost canManageMembers')
        .lean()
        .exec();

      if (!membership) {
        return res.status(403).json({ error: 'Not a member of this channel' });
      }

      req.channelMembership = membership;
      next();
    } catch (err) {
      console.error('Channel membership check error', err);
      return res.status(500).json({ error: 'Failed to verify channel membership' });
    }
  };
}

module.exports = {
  requireChannelMember,
};

