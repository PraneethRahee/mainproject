const mongoose = require('mongoose')

/**
 * Phase 3: Join request queue for private groups.
 */
const groupJoinRequestSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
      immutable: true,
      required: true,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    decisionReason: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true, versionKey: false },
)

// Keep at most one pending request per (group,user).
groupJoinRequestSchema.index(
  { groupId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
)

const GroupJoinRequest =
  mongoose.models.GroupJoinRequest || mongoose.model('GroupJoinRequest', groupJoinRequestSchema)

module.exports = {
  GroupJoinRequest,
}

