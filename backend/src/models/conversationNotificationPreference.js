const mongoose = require('mongoose');

const conversationNotificationPreferenceSchema = new mongoose.Schema(
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
    muted: {
      type: Boolean,
      default: false,
    },
    /** When set and in the future, mute expires at this time. Null with muted=true means mute until cleared. */
    mutedUntil: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);

conversationNotificationPreferenceSchema.index({ userId: 1, channelId: 1 }, { unique: true });

const ConversationNotificationPreference =
  mongoose.models.ConversationNotificationPreference ||
  mongoose.model('ConversationNotificationPreference', conversationNotificationPreferenceSchema);

module.exports = {
  ConversationNotificationPreference,
};
