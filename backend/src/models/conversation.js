const mongoose = require('mongoose');

// Dedicated DM conversation record that guarantees "unique per pair" at the DB level.
// We still use Channel/ChannelMember for membership + permissions, but this anchors the 1-to-1 identity.
const conversationSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ['dm'],
      default: 'dm',
      required: true,
      index: true,
    },
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
      index: true,
    },
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
      required: true,
      validate: {
        validator(arr) {
          return Array.isArray(arr) && arr.length === 2;
        },
        message: 'DM conversations must have exactly 2 participants',
      },
      index: true,
    },
    // Canonical unique key for the pair: "<minUserId>:<maxUserId>"
    participantsHash: {
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
    lastMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
      default: null,
      index: true,
    },
    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

conversationSchema.index({ kind: 1, participantsHash: 1 }, { unique: true });
conversationSchema.index({ channel: 1 }, { unique: true });

const Conversation =
  mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

module.exports = {
  Conversation,
};

