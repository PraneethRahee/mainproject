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
    },
  },
  {
    timestamps: true,
  }
);

channelSchema.index({ type: 1, isArchived: 1 });

const Channel = mongoose.models.Channel || mongoose.model('Channel', channelSchema);

module.exports = {
  Channel,
  CHANNEL_TYPES,
};

