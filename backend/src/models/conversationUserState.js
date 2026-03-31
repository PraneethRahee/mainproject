const mongoose = require('mongoose');

// Per-user per-conversation metadata for building the chat list efficiently.
const conversationUserStateSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastReadAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

conversationUserStateSchema.index({ conversation: 1, user: 1 }, { unique: true });

const ConversationUserState =
  mongoose.models.ConversationUserState ||
  mongoose.model('ConversationUserState', conversationUserStateSchema);

module.exports = {
  ConversationUserState,
};

