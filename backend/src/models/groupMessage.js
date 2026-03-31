const mongoose = require('mongoose');

const GROUP_MESSAGE_TYPES = ['text', 'image', 'video', 'file', 'system'];
const GROUP_MESSAGE_STATUS = ['sent', 'delivered', 'read'];

const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true, trim: true },
    userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  },
  { _id: false, versionKey: false },
);

const groupMessageSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Plaintext content (legacy / non-E2E). For E2E messages, prefer ciphertext fields.
    content: {
      type: String,
      default: null,
    },
    // E2E ciphertext payload for group messages (Signal Sender Keys, client-managed).
    ciphertext: {
      type: String,
      default: null,
    },
    ciphertextType: {
      type: String,
      enum: ['signal_senderkey_v1'],
      default: null,
      index: true,
    },
    attachments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileAsset',
      },
    ],
    type: {
      type: String,
      enum: GROUP_MESSAGE_TYPES,
      default: 'text',
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      immutable: true,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: GROUP_MESSAGE_STATUS,
      default: 'sent',
      required: true,
      index: true,
    },
    edited: {
      type: Boolean,
      default: false,
      index: true,
    },
    editedAt: {
      type: Date,
    },
    deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deliveredTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
    ],
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
    ],
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroupMessage',
      default: null,
      index: true,
    },
    reactions: {
      type: [reactionSchema],
      default: [],
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    isStarredBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
    ],

    // Phase 4: disappearing messages expiry time.
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    versionKey: false,
  },
);

groupMessageSchema.index({ groupId: 1, timestamp: -1, _id: -1 });
groupMessageSchema.index({ senderId: 1, timestamp: -1, _id: -1 });

groupMessageSchema.pre('validate', function validateMessage() {
  const hasCipher = typeof this.ciphertext === 'string' && this.ciphertext.length > 0;
  const hasContent = typeof this.content === 'string' && this.content.trim().length > 0;
  if (!hasCipher && !hasContent) {
    throw new Error('Either content or ciphertext is required');
  }
  if (hasCipher && !this.ciphertextType) {
    throw new Error('ciphertextType is required when ciphertext is provided');
  }
});

const GroupMessage =
  mongoose.models.GroupMessage || mongoose.model('GroupMessage', groupMessageSchema);

module.exports = {
  GroupMessage,
  GROUP_MESSAGE_TYPES,
  GROUP_MESSAGE_STATUS,
};

