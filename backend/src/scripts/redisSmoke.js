const { config } = require('../config');
const {
  getRedisClient,
  disconnectRedis,
  setUserPresence,
  getUserPresence,
  checkRateLimit,
} = require('../redis');

async function run() {
  console.log('Using REDIS_URL=', config.redisUrl);

  // ensure client can connect
  await getRedisClient();

  // Presence test
  const userId = `smoke-user-${Date.now()}`;
  await setUserPresence(userId, 'online');
  const presence = await getUserPresence(userId);

  // Rate-limit test
  const key = `smoke-key-${Date.now()}`;
  const limit = 3;
  const windowSeconds = 10;

  const results = [];
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await checkRateLimit({ key, limit, windowSeconds });
    results.push(r);
  }

  console.log('Presence result:', presence);
  console.log('Rate-limit results:', results);

  await disconnectRedis();
  console.log('Redis smoke test completed');
  process.exit(0);
}

run().catch((err) => {
  console.error('Redis smoke test failed', err);
  process.exit(1);
});

