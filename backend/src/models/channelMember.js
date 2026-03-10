const mongoose = require('mongoose');

const channelMemberSchema = new mongoose.Schema(
  {
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    canPost: {
      type: Boolean,
      default: true,
    },
    canManageMembers: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

channelMemberSchema.index({ channel: 1, user: 1 }, { unique: true });
channelMemberSchema.index({ user: 1 });

const ChannelMember =
  mongoose.models.ChannelMember || mongoose.model('ChannelMember', channelMemberSchema);

module.exports = {
  ChannelMember,
};

