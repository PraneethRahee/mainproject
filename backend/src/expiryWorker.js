const { ChatMessage, GroupMessage } = require('./models');

const EXPIRED_PLACEHOLDER = 'This message has disappeared';

async function expireOnePass() {
  const now = new Date();

  // Private chat messages.
  await ChatMessage.updateMany(
    {
      deleted: false,
      type: { $ne: 'system' },
      expiresAt: { $ne: null, $lte: now },
    },
    {
      $set: {
        type: 'system',
        content: EXPIRED_PLACEHOLDER,
        ciphertext: null,
        ciphertextType: null,
        attachments: [],
        replyTo: null,
        status: 'sent',
        deliveredAt: null,
        readAt: null,
        edited: false,
        isPinned: false,
        isStarredBy: [],
        expiresAt: null,
      },
    },
  ).exec();

  // Group chat messages.
  await GroupMessage.updateMany(
    {
      deleted: false,
      type: { $ne: 'system' },
      expiresAt: { $ne: null, $lte: now },
    },
    {
      $set: {
        type: 'system',
        content: EXPIRED_PLACEHOLDER,
        ciphertext: null,
        ciphertextType: null,
        attachments: [],
        replyTo: null,
        reactions: [],
        status: 'sent',
        deliveredTo: [],
        readBy: [],
        edited: false,
        editedAt: null,
        isPinned: false,
        isStarredBy: [],
        expiresAt: null,
      },
    },
  ).exec();
}

function startExpiryWorker(intervalMs = 5000) {
  setInterval(() => {
    expireOnePass().catch((err) => console.error('Expiry worker error', err));
  }, intervalMs);
  console.log('Expiry worker started with interval', intervalMs, 'ms');
}

module.exports = {
  startExpiryWorker,
};

