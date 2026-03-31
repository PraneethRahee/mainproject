const webPush = require('web-push');
const mongoose = require('mongoose');
const {
  NotificationEvent,
  NotificationInbox,
  NotificationPreference,
  NotificationSubscription,
  ConversationNotificationPreference,
} = require('./models');
const { isConversationNotificationMuted } = require('./utils/conversationNotificationMute');
const { config } = require('./config');
const { logTelemetry, incMetric, safeErrorMessage } = require('./utils/telemetry');

const EVENT_BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

const WEB_PUSH_ENABLED = Boolean(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject);

if (WEB_PUSH_ENABLED) {
  webPush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
}

async function processNotificationEvents() {
  const now = new Date();

  const events = await NotificationEvent.find({
    status: 'pending',
  })
    .sort({ createdAt: 1 })
    .limit(EVENT_BATCH_SIZE)
    .lean()
    .exec();

  if (!events.length) return;

  for (const event of events) {
    try {
      const recipients = Array.isArray(event.recipientUserIds) ? event.recipientUserIds : [];
      if (!recipients.length) {
        await NotificationEvent.updateOne(
          { _id: event._id },
          { $set: { status: 'sent', processedAt: now } },
        ).exec();
        // eslint-disable-next-line no-continue
        continue;
      }

      // Load preferences in one query for the whole recipient set.
      const prefs = await NotificationPreference.find({ userId: { $in: recipients } })
        .select('userId mutedTypes')
        .lean()
        .exec();

      const mutedByUser = new Map(prefs.map((p) => [String(p.userId), p.mutedTypes || []]));

      const conversationId = event.payload && event.payload.conversationId;
      let perChatMuted = new Map();
      if (
        event.type === 'message' &&
        conversationId &&
        mongoose.Types.ObjectId.isValid(String(conversationId))
      ) {
        const chatPrefs = await ConversationNotificationPreference.find({
          userId: { $in: recipients },
          channelId: conversationId,
        })
          .select('userId muted mutedUntil')
          .lean()
          .exec();
        for (const row of chatPrefs) {
          if (isConversationNotificationMuted(row, now)) {
            perChatMuted.set(String(row.userId), true);
          }
        }
      }

      const docsToInsert = [];
      for (const recipientUserId of recipients) {
        const mutedTypes = mutedByUser.get(String(recipientUserId)) || [];
        if (Array.isArray(mutedTypes) && mutedTypes.includes(event.type)) continue;
        if (event.type === 'message' && perChatMuted.get(String(recipientUserId))) continue;

        docsToInsert.push({
          userId: recipientUserId,
          type: event.type,
          payload: event.payload || {},
        });
      }

      if (docsToInsert.length > 0) {
        await NotificationInbox.insertMany(docsToInsert);
        void incMetric('notification_inbox_insert_count', docsToInsert.length);
      }

      // Optional: send web push notifications for allowed recipients.
      // Push delivery is best-effort; inbox delivery is durable.
      if (WEB_PUSH_ENABLED) {
        try {
          // Batch-load subscriptions for allowed recipients.
          const subs = await NotificationSubscription.find({
            userId: {
              $in: allowedRecipientsForPush(recipients, mutedByUser, event.type, perChatMuted),
            },
          })
            .select('userId endpoint keys')
            .lean()
            .exec();

          const subsByUserId = new Map();
          for (const s of subs) {
            const uid = String(s.userId);
            if (!subsByUserId.has(uid)) subsByUserId.set(uid, []);
            subsByUserId.get(uid).push(s);
          }

          const pushPayload = {
            notificationType: event.type,
            payload: event.payload || {},
            // For clients to decide what to open.
            createdBy: event.createdBy ? String(event.createdBy) : null,
          };

          for (const recipientUserId of recipients) {
            const mutedTypes = mutedByUser.get(String(recipientUserId)) || [];
            if (Array.isArray(mutedTypes) && mutedTypes.includes(event.type)) continue;
            if (event.type === 'message' && perChatMuted.get(String(recipientUserId))) continue;

            const userSubs = subsByUserId.get(String(recipientUserId)) || [];
            for (const sub of userSubs) {
              await webPush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: sub.keys,
                  expirationTime: null,
                },
                JSON.stringify(pushPayload),
              );
            }
          }
        } catch (pushErr) {
          // Don't block inbox insertion; record but mark event as sent anyway (best-effort web push).
          logTelemetry('error', 'web_push_failed', {
            notificationEventId: String(event._id),
            type: event.type,
            error: safeErrorMessage(pushErr),
          });
          void incMetric('webpush_failed_total', 1);
        }
      }

      await NotificationEvent.updateOne(
        { _id: event._id },
        { $set: { status: 'sent', processedAt: now } },
      ).exec();

      logTelemetry('info', 'notification_event_sent', {
        notificationEventId: String(event._id),
        type: event.type,
        recipientCount: recipients.length,
      });
      void incMetric('notification_event_sent_total', 1);
    } catch (err) {
      const attempts = Number(event.attempts || 0) + 1;

      await NotificationEvent.updateOne(
        { _id: event._id },
        {
          $set: {
            lastError: err?.message || String(err),
            processedAt: attempts >= MAX_ATTEMPTS ? now : null,
            status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          },
          $inc: { attempts: 1 },
        },
      ).exec();

      logTelemetry('error', 'notification_event_failed_or_retry', {
        notificationEventId: String(event._id),
        type: event.type,
        attempts,
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        error: safeErrorMessage(err),
      });
      void incMetric('notification_event_failed_total', 1);
    }
  }
}

function allowedRecipientsForPush(recipientUserIds, mutedByUser, eventType, perChatMuted) {
  // Helper used to narrow subscription query. It does not replace mute filtering,
  // which still happens before sending.
  const chatMute = perChatMuted || new Map();
  const out = [];
  for (const uid of recipientUserIds) {
    const mutedTypes = mutedByUser.get(String(uid)) || [];
    if (Array.isArray(mutedTypes) && mutedTypes.includes(eventType)) continue;
    if (eventType === 'message' && chatMute.get(String(uid))) continue;
    out.push(uid);
  }
  return out;
}

function startNotificationWorker(intervalMs = 5000) {
  setInterval(() => {
    processNotificationEvents().catch((err) => console.error('Notification worker error', err));
  }, intervalMs);
  console.log('Notification worker started with interval', intervalMs, 'ms');
}

module.exports = {
  startNotificationWorker,
};

