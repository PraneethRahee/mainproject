const mongoose = require('mongoose');
const { NotificationEvent, NOTIFICATION_TYPES } = require('../models');

async function enqueueNotificationEvent({ type, createdBy, recipientUserIds, payload }) {
  if (!NOTIFICATION_TYPES.includes(type)) {
    const err = new Error(`Invalid notification type: ${type}`);
    err.statusCode = 400;
    throw err;
  }

  const cleanRecipients = Array.from(new Set((recipientUserIds || []).map(String))).filter((id) =>
    mongoose.Types.ObjectId.isValid(id),
  );

  if (cleanRecipients.length === 0) {
    return null;
  }

  const event = await NotificationEvent.create({
    type,
    createdBy: createdBy || null,
    recipientUserIds: cleanRecipients,
    payload: payload || {},
  });

  return event._id ? String(event._id) : null;
}

module.exports = {
  enqueueNotificationEvent,
};

