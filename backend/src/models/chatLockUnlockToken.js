const mongoose = require('mongoose');

const chatLockUnlockTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
);

chatLockUnlockTokenSchema.index({ userId: 1, channelId: 1, expiresAt: 1 });

const ChatLockUnlockToken =
  mongoose.models.ChatLockUnlockToken || mongoose.model('ChatLockUnlockToken', chatLockUnlockTokenSchema);

module.exports = {
  ChatLockUnlockToken,
};

