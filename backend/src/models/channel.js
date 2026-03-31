const mongoose = require('mongoose');

const CHANNEL_TYPES = ['group', 'private', 'dm'];

const channelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    type: {
      type: String,
      enum: CHANNEL_TYPES,
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastMessageAt: {
      type: Date,
      index: true,
    },
    metadata: {
      topic: String,
      isDefault: {
        type: Boolean,
        default: false,
      },
      /** Shared channel for one admission cohort (local part of email starts with e.g. 22) */
      isCohortChannel: {
        type: Boolean,
        default: false,
        index: true,
      },
      cohortYear: {
        type: String,
        default: null,
        trim: true,
      },
      /** Single app-wide #general — all students, not one per user */
      isCollegeWideGeneral: {
        type: Boolean,
        default: false,
        index: true,
      },

      /**
       * Phase 3 (Group + Admin Power):
       * Policy matrix for group behavior. Stored on the group channel itself.
       */
      whoCanSend: {
        type: String,
        enum: ['everyone', 'adminsOnly'],
        default: 'everyone',
        index: true,
      },
      whoCanEditInfo: {
        type: String,
        enum: ['adminsOnly', 'everyone'],
        default: 'adminsOnly',
        index: true,
      },
      whoCanAddMembers: {
        type: String,
        enum: ['adminsOnly', 'everyone'],
        default: 'adminsOnly',
        index: true,
      },
      /** If 'approval', non-members must request to join. */
      joinPolicy: {
        type: String,
        enum: ['open', 'approval'],
        default: 'open',
        index: true,
      },

      /**
       * Phase 4: Disappearing messages (per-chat timer setting).
       * Stored on the conversation/channel itself so all participants share the same policy.
       * 0 = disabled.
       */
      disappearingMessagesSeconds: {
        type: Number,
        default: 0,
        min: 0,
        index: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

channelSchema.index({ type: 1, isArchived: 1 });
channelSchema.index(
  { 'metadata.cohortYear': 1 },
  { unique: true, partialFilterExpression: { 'metadata.isCohortChannel': true } }
);
channelSchema.index(
  { 'metadata.isCollegeWideGeneral': 1 },
  { unique: true, partialFilterExpression: { 'metadata.isCollegeWideGeneral': true } }
);

const Channel = mongoose.models.Channel || mongoose.model('Channel', channelSchema);

module.exports = {
  Channel,
  CHANNEL_TYPES,
};

