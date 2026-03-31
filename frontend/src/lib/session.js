import { config } from '../config/env.js'

const REFRESH_TOKEN_KEY = 'refreshToken'
const CURRENT_SESSION_ID_KEY = 'currentSessionId'

let inMemoryAccessToken = null
let isRefreshing = false
let pendingRefreshPromise = null

export function getAccessToken() {
  return inMemoryAccessToken
}

export function getRefreshToken() {
  return window.localStorage.getItem(REFRESH_TOKEN_KEY)
}

/** Mongo session id for this browser, when returned by login / refresh / MFA. */
export function getCurrentSessionId() {
  return window.localStorage.getItem(CURRENT_SESSION_ID_KEY)
}

export function setSessionTokens({ accessToken, refreshToken, sessionId }) {
  inMemoryAccessToken = accessToken || null
  if (refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  }
  if (sessionId) {
    window.localStorage.setItem(CURRENT_SESSION_ID_KEY, String(sessionId))
  }
}

export function clearSession() {
  inMemoryAccessToken = null
  window.localStorage.removeItem(REFRESH_TOKEN_KEY)
  window.localStorage.removeItem(CURRENT_SESSION_ID_KEY)
}

async function refreshAccessTokenOnce() {
  if (isRefreshing) {
    return pendingRefreshPromise
  }

  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    clearSession()
    return null
  }

  isRefreshing = true
  pendingRefreshPromise = (async () => {
    try {
      const response = await fetch(`${config.apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.accessToken || !data.refreshToken) {
        clearSession()
        return null
      }

      setSessionTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        sessionId: data.sessionId,
      })

      return data.accessToken
    } catch (err) {
      clearSession()
      return null
    } finally {
      isRefreshing = false
      pendingRefreshPromise = null
    }
  })()

  return pendingRefreshPromise
}

// Public wrapper so callers that don't go through `apiRequest()` can refresh.
export async function refreshAccessToken() {
  return refreshAccessTokenOnce()
}

/**
 * If access token is missing but a refresh token exists, obtain a new access token.
 * Call on app load so returning users go straight to chat (similar to Google session restore).
 */
export async function tryRestoreSession() {
  if (getAccessToken()) {
    return true
  }
  if (!getRefreshToken()) {
    return false
  }
  const access = await refreshAccessTokenOnce()
  return Boolean(access)
}

export async function apiRequest(path, options = {}) {
  const url = path.startsWith('http') ? path : `${config.apiBaseUrl}${path}`
  const initialToken = getAccessToken()

  const doFetch = async (tokenToUse) => {
    const headers = new Headers(options.headers || {})
    if (tokenToUse) {
      headers.set('Authorization', `Bearer ${tokenToUse}`)
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    return response
  }

  let response = await doFetch(initialToken)

  if (response.status !== 401) {
    return response
  }

  const newToken = await refreshAccessTokenOnce()

  if (!newToken) {
    return response
  }

  return doFetch(newToken)
}

