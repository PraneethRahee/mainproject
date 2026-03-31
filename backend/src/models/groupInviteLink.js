const mongoose = require('mongoose')

/**
 * Phase 3: Group invite token (revocable + expirable + single-use).
 */
const groupInviteLinkSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    usedAt: {
      type: Date,
      default: null,
      index: true,
    },
    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
)

const GroupInviteLink =
  mongoose.models.GroupInviteLink || mongoose.model('GroupInviteLink', groupInviteLinkSchema)

module.exports = {
  GroupInviteLink,
}

