/**
 * Environment configuration.
 * Vite exposes env variables prefixed with VITE_ via import.meta.env
 */
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000',
}
