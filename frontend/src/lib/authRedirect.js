/**
 * Safe in-app path after sign-in (avoids open redirects).
 * @param {unknown} fromState - e.g. location.state.from or state.next
 * @param {string} fallback
 * @returns {string}
 */
export function resolvePostAuthDestination(fromState, fallback = '/chat') {
  if (typeof fromState !== 'string' || !fromState.startsWith('/') || fromState.startsWith('//')) {
    return fallback
  }

  const blocked = new Set([
    '/login',
    '/register',
    '/mfa',
    '/welcome',
    '/',
  ])

  if (blocked.has(fromState)) {
    return fallback
  }

  return fromState
}
