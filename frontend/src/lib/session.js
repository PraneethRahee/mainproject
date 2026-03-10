import { config } from '../config/env.js'

const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'

let inMemoryAccessToken = null
let isRefreshing = false
let pendingRefreshPromise = null

export function getAccessToken() {
  return inMemoryAccessToken
}

export function getRefreshToken() {
  return window.localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setSessionTokens({ accessToken, refreshToken }) {
  inMemoryAccessToken = accessToken || null
  if (refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  }
}

export function clearSession() {
  inMemoryAccessToken = null
  window.localStorage.removeItem(REFRESH_TOKEN_KEY)
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

