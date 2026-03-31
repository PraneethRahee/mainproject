const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be a number')
    .transform((val) => parseInt(val, 10))
    .optional(),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  MFA_SECRET: z.string().min(16, 'MFA_SECRET must be at least 16 characters'),

  // Web Push (optional for dev)
  VAPID_SUBJECT: z.string().min(1).optional(),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),

  // Feature flags (optional; defaults to true for dev)
  FEATURE_PUSH_NOTIFICATIONS_ENABLED: z.coerce.boolean().optional(),
  FEATURE_CALLS_ENABLED: z.coerce.boolean().optional(),
  FEATURE_STORIES_ENABLED: z.coerce.boolean().optional(),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formattedErrors = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error('Invalid environment configuration:\n' + formattedErrors);
    // Fail fast if env is invalid
    process.exit(1);
  }

  const env = parsed.data;

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT || 4000,
    mongodbUri: env.MONGODB_URI,
    redisUrl: env.REDIS_URL,
    jwtSecret: env.JWT_SECRET,
    mfaSecret: env.MFA_SECRET,
    vapidSubject: env.VAPID_SUBJECT || null,
    vapidPublicKey: env.VAPID_PUBLIC_KEY || null,
    vapidPrivateKey: env.VAPID_PRIVATE_KEY || null,

    featurePushNotificationsEnabled: env.FEATURE_PUSH_NOTIFICATIONS_ENABLED ?? true,
    featureCallsEnabled: env.FEATURE_CALLS_ENABLED ?? true,
    featureStoriesEnabled: env.FEATURE_STORIES_ENABLED ?? true,
  };
}

const config = loadConfig();

module.exports = {
  config,
};

