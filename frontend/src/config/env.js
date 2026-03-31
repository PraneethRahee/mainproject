/**
 * Environment configuration.
 * Vite exposes env variables prefixed with VITE_ via import.meta.env
 */
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000',
  featurePushNotificationsEnabled:
    import.meta.env.VITE_FEATURE_PUSH_NOTIFICATIONS_ENABLED !== undefined
      ? import.meta.env.VITE_FEATURE_PUSH_NOTIFICATIONS_ENABLED === 'true'
      : true,
  featureCallsEnabled:
    import.meta.env.VITE_FEATURE_CALLS_ENABLED !== undefined
      ? import.meta.env.VITE_FEATURE_CALLS_ENABLED === 'true'
      : true,
  featureStoriesEnabled:
    import.meta.env.VITE_FEATURE_STORIES_ENABLED !== undefined
      ? import.meta.env.VITE_FEATURE_STORIES_ENABLED === 'true'
      : true,
}
