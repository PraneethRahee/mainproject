const mongoose = require('mongoose');

const NOTIFICATION_TYPES = ['message', 'call', 'story'];

const notificationInboxSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    readAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
);

notificationInboxSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

const NotificationInbox =
  mongoose.models.NotificationInbox || mongoose.model('NotificationInbox', notificationInboxSchema);

module.exports = {
  NotificationInbox,
  NOTIFICATION_TYPES,
};

