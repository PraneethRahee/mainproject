const mongoose = require('mongoose');

// Used by the private 1-to-1 messages API.
const MESSAGE_TYPES = ['text', 'image', 'video', 'file', 'system'];
const MESSAGE_STATUS = ['sent', 'delivered', 'read'];

const chatMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
      index: true,
    },
    // For private (1-to-1) chats: the intended recipient of this message.
    // For non-private channels, this can be null.
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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
    attachments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileAsset',
      },
    ],
    // E2E ciphertext payload (base64 or similar). Server stores but cannot decrypt.
    ciphertext: {
      type: String,
      default: null,
    },
    ciphertextType: {
      type: String,
      enum: ['signal_v1'],
      default: null,
      index: true,
    },
    senderDeviceId: {
      type: String,
      default: 'web:1',
      trim: true,
      index: true,
    },
    receiverDeviceId: {
      type: String,
      default: 'web:1',
      trim: true,
      index: true,
    },
    type: {
      type: String,
      enum: MESSAGE_TYPES,
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
    // Optional: reply-to another (non-deleted) message in the same conversation.
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: MESSAGE_STATUS,
      default: 'sent',
      required: true,
      index: true,
    },
    deliveredAt: {
      type: Date,
      default: null,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
    edited: {
      type: Boolean,
      default: false,
      index: true,
    },
    deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    // WhatsApp-style "Delete for me": hide message for specific users without affecting others.
    // "Delete for everyone" continues to use deleted=true + system replacement.
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
    ],
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
    // When this time passes, original content is replaced with a system placeholder.
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

chatMessageSchema.index({ conversationId: 1, timestamp: -1, _id: -1 });
chatMessageSchema.index({ senderId: 1, timestamp: -1, _id: -1 });

// Fast unread + receipt workflows for 1-to-1:
// - "receiver unread in a conversation" (timestamp > lastReadAt)
// - quick scans by status when applying delivered/read transitions
chatMessageSchema.index({ conversationId: 1, receiverId: 1, timestamp: -1, _id: -1 });
chatMessageSchema.index({ conversationId: 1, receiverId: 1, status: 1, timestamp: -1, _id: -1 });

// Optional message search (for private chats). Note: Mongo allows only one text index per collection.
chatMessageSchema.index(
  { content: 'text' },
  {
    weights: { content: 10 },
    default_language: 'english',
  },
);

chatMessageSchema.pre('validate', function validateMessage() {
  const hasCipher = typeof this.ciphertext === 'string' && this.ciphertext.length > 0;
  const hasContent = typeof this.content === 'string' && this.content.trim().length > 0;
  if (!hasCipher && !hasContent) {
    throw new Error('Either content or ciphertext is required');
  }
  if (hasCipher && !this.ciphertextType) {
    throw new Error('ciphertextType is required when ciphertext is provided');
  }
});

const ChatMessage =
  mongoose.models.ChatMessage || mongoose.model('ChatMessage', chatMessageSchema);

module.exports = {
  ChatMessage,
  MESSAGE_TYPES,
  MESSAGE_STATUS,
};

