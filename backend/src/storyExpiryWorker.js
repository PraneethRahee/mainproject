const { Story } = require('./models');

function startStoryExpiryWorker(intervalMs = 5000) {
  setInterval(async () => {
    try {
      const now = new Date();
      const res = await Story.deleteMany({ expiresAt: { $lte: now } });
      if (res?.deletedCount > 0) {
        // keep it quiet-ish; story deletes are expected over time
        console.log(`Story expiry worker deleted ${res.deletedCount} expired stories`);
      }
    } catch (err) {
      console.error('Story expiry worker error', err);
    }
  }, intervalMs);

  console.log('Story expiry worker started with interval', intervalMs, 'ms');
}

module.exports = {
  startStoryExpiryWorker,
};

