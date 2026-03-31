const path = require('path');
const { FileAsset } = require('./models');

// Simple stubbed scanner for development:
// - Treat all files as clean by default.
// - Hook location for integrating a real malware scanner (ClamAV, VirusTotal, etc.).
async function performScan(_filePath) {
  // In a real implementation, invoke the scanner here and return 'scanned_clean' or 'scanned_blocked'.
  return 'scanned_clean';
}

async function processBatch(io, batchSize = 20) {
  const pending = await FileAsset.find({ scanStatus: 'quarantined' })
    .sort({ createdAt: 1 })
    .limit(batchSize)
    .lean()
    .exec();

  if (!pending.length) {
    return;
  }

  for (const asset of pending) {
    const storageKey = asset.storageKey || '';
    const absolutePath = path.join(__dirname, '..', 'storage', storageKey);

    let newStatus = 'scanned_clean';
    try {
      // eslint-disable-next-line no-await-in-loop
      newStatus = await performScan(absolutePath);
      if (newStatus !== 'scanned_clean' && newStatus !== 'scanned_blocked') {
        newStatus = 'scanned_clean';
      }
    } catch (err) {
      console.error('Scan error for FileAsset', asset._id, err);
      newStatus = 'scanned_blocked';
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await FileAsset.findByIdAndUpdate(asset._id, {
        $set: {
          scanStatus: newStatus,
          scannedAt: new Date(),
        },
      }).exec();
    } catch (err) {
      console.error('Failed to update scan status for FileAsset', asset._id, err);
      continue;
    }

    try {
      io.emit('attachment:status', {
        id: String(asset._id),
        status: newStatus,
      });
    } catch (err) {
      console.error('Failed to emit attachment:status event', err);
    }
  }
}

function startScanWorker(io, intervalMs = 5000) {
  if (!io) {
    console.error('Scan worker not started: Socket.IO instance is required');
    return;
  }

  setInterval(() => {
    processBatch(io).catch((err) => {
      console.error('Scan worker batch error', err);
    });
  }, intervalMs);

  console.log('Scan worker started with interval', intervalMs, 'ms');
}

module.exports = {
  startScanWorker,
};

