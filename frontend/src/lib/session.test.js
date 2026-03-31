import { describe, it, expect, beforeEach, vi } from 'vitest'
import { config } from '../config/env.js'
import {
  getAccessToken,
  setSessionTokens,
  clearSession,
  getRefreshToken,
  getCurrentSessionId,
  apiRequest,
} from './session.js'

describe('session helpers', () => {
  beforeEach(() => {
    clearSession()
    window.localStorage.clear()
  })

  it('stores and retrieves access and refresh tokens', () => {
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()

    setSessionTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' })

    expect(getAccessToken()).toBe('access-1')
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('clears session tokens', () => {
    setSessionTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' })
    clearSession()
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('stores current session id when provided', () => {
    expect(getCurrentSessionId()).toBeNull()
    setSessionTokens({
      accessToken: 'a',
      refreshToken: 'r',
      sessionId: '507f1f77bcf86cd799439011',
    })
    expect(getCurrentSessionId()).toBe('507f1f77bcf86cd799439011')
    clearSession()
    expect(getCurrentSessionId()).toBeNull()
  })
})

describe('apiRequest', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    clearSession()
    window.localStorage.clear()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('attaches Authorization header when access token is present', async () => {
    setSessionTokens({ accessToken: 'token-123', refreshToken: null })

    global.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    const res = await apiRequest('/channels')
    expect(res.status).toBe(200)

    const [calledUrl, options] = global.fetch.mock.calls[0]
    expect(calledUrl).toBe(`${config.apiBaseUrl}/channels`)
    expect(options.headers.get('Authorization')).toBe('Bearer token-123')
  })
})

