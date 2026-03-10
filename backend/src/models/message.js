const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    attachments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileAsset',
      },
    ],
    deliveredTo: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: Date,
      },
    ],
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: Date,
      },
    ],
    editedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ channel: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = {
  Message,
};

