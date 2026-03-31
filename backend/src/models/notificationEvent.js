const mongoose = require('mongoose');

const NOTIFICATION_TYPES = ['message', 'call', 'story'];
const EVENT_STATUSES = ['pending', 'sent', 'failed'];

const notificationEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    recipientUserIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    status: {
      type: String,
      enum: EVENT_STATUSES,
      default: 'pending',
      index: true,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    lastError: {
      type: String,
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
);

notificationEventSchema.index({ status: 1, createdAt: 1 });

const NotificationEvent =
  mongoose.models.NotificationEvent || mongoose.model('NotificationEvent', notificationEventSchema);

module.exports = {
  NotificationEvent,
  NOTIFICATION_TYPES,
  EVENT_STATUSES,
};

