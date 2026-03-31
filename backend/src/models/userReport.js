const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      default: 'other',
      required: true,
      trim: true,
    },
    // Optional linking to context.
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      default: null,
      index: true,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    metadata: {
      type: Object,
      default: {},
    },
    status: {
      type: String,
      default: 'received',
      enum: ['received', 'reviewed', 'resolved', 'rejected'],
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
);

const UserReport = mongoose.models.UserReport || mongoose.model('UserReport', reportSchema);

module.exports = {
  UserReport,
};

