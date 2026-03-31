const { getRedisClient } = require('../redis');

function safeErrorMessage(err) {
  if (!err) return null;
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function logTelemetry(level, event, metadata) {
  const base = {
    event,
    ...((metadata && typeof metadata === 'object' ? metadata : {}) || {}),
  };

  // Keep logs machine-readable for later ingestion.
  const line = JSON.stringify(base);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

async function incMetric(metricName, value = 1) {
  // Best-effort only. Metrics should never block core flows.
  try {
    const c = await getRedisClient();
    const key = `metrics:${metricName}`;
    await c.incrBy(key, value);
  } catch {
    // ignore
  }
}

module.exports = {
  logTelemetry,
  incMetric,
  safeErrorMessage,
};

