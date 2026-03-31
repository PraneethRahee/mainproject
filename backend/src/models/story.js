const mongoose = require('mongoose');

const STORY_AUDIENCE_TYPES = ['everyone', 'whitelist'];

const storySchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    kind: {
      // Minimal Phase 5 implementation: text-only stories for now.
      type: String,
      enum: ['text'],
      default: 'text',
      index: true,
    },

    content: {
      type: String,
      required: true,
      maxlength: 2000,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    privacy: {
      audienceType: {
        type: String,
        enum: STORY_AUDIENCE_TYPES,
        default: 'everyone',
        index: true,
      },
      // Only used when audienceType === 'whitelist'
      audienceUserIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          index: true,
        },
      ],
    },

    // WhatsApp-style view receipts.
    viewReceipts: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          index: true,
        },
        viewedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

storySchema.index({ expiresAt: 1 });
storySchema.index({ authorId: 1, createdAt: -1 });

const Story = mongoose.models.Story || mongoose.model('Story', storySchema);

module.exports = {
  Story,
  STORY_AUDIENCE_TYPES,
};

