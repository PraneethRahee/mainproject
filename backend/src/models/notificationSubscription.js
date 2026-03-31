const mongoose = require('mongoose');

const notificationSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    endpoint: {
      type: String,
      required: true,
      index: true,
    },

    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },

    expirationTime: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);

notificationSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

const NotificationSubscription =
  mongoose.models.NotificationSubscription ||
  mongoose.model('NotificationSubscription', notificationSubscriptionSchema);

module.exports = {
  NotificationSubscription,
};

