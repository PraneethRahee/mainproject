const { createClient } = require('redis');
const { config } = require('./config');

let client;

async function getRedisClient() {
  if (!client) {
    client = createClient({
      url: config.redisUrl,
    });

    client.on('error', (err) => {
      console.error('Redis Client Error', err);
    });

    await client.connect();
    console.log('Connected to Redis');
  }

  return client;
}

async function disconnectRedis() {
  if (client) {
    await client.quit();
    client = undefined;
  }
}

// Presence helper
// Stores a simple presence object per user with TTL
// key: presence:user:<userId>
const PRESENCE_TTL_SECONDS = 60;

async function setUserPresence(userId, status) {
  const c = await getRedisClient();
  const key = `presence:user:${userId}`;
  const presence = {
    status,
    updatedAt: new Date().toISOString(),
  };
  const value = JSON.stringify(presence);
  await c.set(key, value, { EX: PRESENCE_TTL_SECONDS });
  return presence;
}

async function getUserPresence(userId) {
  const c = await getRedisClient();
  const key = `presence:user:${userId}`;
  const value = await c.get(key);
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// Rate-limit helper
// Counter per key+windowSeconds. Returns { allowed, remaining, count, resetAt }
async function checkRateLimit({ key, limit, windowSeconds }) {
  const c = await getRedisClient();
  const redisKey = `ratelimit:${key}:${windowSeconds}`;

  const multi = c.multi();
  multi.incr(redisKey);
  multi.ttl(redisKey);
  const [count, ttl] = await multi.exec();

  let remainingTtl = ttl;

  if (ttl === -1) {
    await c.expire(redisKey, windowSeconds);
    remainingTtl = windowSeconds;
  } else if (ttl === -2) {
    // key did not exist before incr, set expiry now
    await c.expire(redisKey, windowSeconds);
    remainingTtl = windowSeconds;
  }

  const allowed = count <= limit;
  const remaining = Math.max(limit - count, 0);
  const resetAt = new Date(Date.now() + remainingTtl * 1000);

  return {
    allowed,
    remaining,
    count,
    resetAt,
  };
}

module.exports = {
  getRedisClient,
  disconnectRedis,
  setUserPresence,
  getUserPresence,
  checkRateLimit,
};

