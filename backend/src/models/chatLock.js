const mongoose = require('mongoose');

const chatLockSchema = new mongoose.Schema(
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
    pinHash: {
      type: String,
      required: true,
    },
  },
  { timestamps: true, versionKey: false },
);

chatLockSchema.index({ userId: 1, channelId: 1 }, { unique: true });

const ChatLock = mongoose.models.ChatLock || mongoose.model('ChatLock', chatLockSchema);

module.exports = {
  ChatLock,
};

