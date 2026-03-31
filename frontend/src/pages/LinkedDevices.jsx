import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiRequest, clearSession, getCurrentSessionId } from '../lib/session.js'
import { useApp } from '../context/AppContext.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Button } from '../components/ui/Button.jsx'

function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function friendlyUserAgent(ua) {
  if (!ua || typeof ua !== 'string') return 'Unknown device'
  const s = ua.trim()
  if (!s) return 'Unknown device'
  if (/Edg\//.test(s)) return 'Microsoft Edge'
  if (/Chrome\//.test(s) && !/Edg/.test(s)) return 'Chrome'
  if (/Firefox\//.test(s)) return 'Firefox'
  if (/Safari\//.test(s) && !/Chrome/.test(s)) return 'Safari'
  return s.length > 72 ? `${s.slice(0, 69)}…` : s
}

function sessionStatus(row) {
  if (row.revokedAt) return 'revoked'
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) return 'expired'
  return 'active'
}

function LinkedDevices() {
  const navigate = useNavigate()
  const { logout } = useApp()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revokingId, setRevokingId] = useState(null)
  const currentId = getCurrentSessionId()

  const loadSessions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiRequest('/auth/sessions')
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        clearSession()
        navigate('/login', { replace: true, state: { message: 'Please sign in again.' } })
        return
      }
      if (!res.ok) {
        setSessions([])
        setError(data.error || 'Failed to load sessions')
        return
      }
      setSessions(Array.isArray(data.sessions) ? data.sessions : [])
    } catch {
      setSessions([])
      setError('Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const handleRevoke = async (sessionId) => {
    const isCurrent = currentId && String(sessionId) === String(currentId)
    const message = isCurrent
      ? 'This will sign you out on this browser. Continue?'
      : 'Revoke this session? That device will need to sign in again.'
    if (!window.confirm(message)) return

    setRevokingId(sessionId)
    setError('')
    try {
      const res = await apiRequest(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        clearSession()
        navigate('/login', { replace: true, state: { message: 'Please sign in again.' } })
        return
      }
      if (!res.ok) {
        setError(data.error || 'Could not revoke session')
        return
      }
      if (isCurrent) {
        logout()
        navigate('/login', {
          replace: true,
          state: { message: 'This device was signed out.' },
        })
        return
      }
      await loadSessions()
    } catch {
      setError('Could not revoke session')
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', width: '100%', padding: 'var(--space-6) var(--space-4)' }}>
      <header style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--space-2)' }}>Linked devices</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', maxWidth: 640 }}>
          Sessions where you stayed signed in. Revoke any you do not recognize; revoking this browser
          signs you out here.
        </p>
        {!currentId && !loading && (
          <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            Sign out and sign in once to label this browser as &quot;This device&quot; (session id is stored
            after your next login).
          </p>
        )}
      </header>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-3)',
            borderRadius: 8,
            background: 'var(--color-danger-soft, rgba(220, 53, 69, 0.12))',
            color: 'var(--color-danger, #c62828)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {error}
        </div>
      )}

      <Card style={{ padding: 'var(--space-4)' }}>
        {loading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No sessions found.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-4)' }}>
            {sessions.map((row) => {
              const id = row.sessionId
              const status = sessionStatus(row)
              const isCurrent = currentId && String(id) === String(currentId)
              const canRevoke = status === 'active'

              return (
                <li
                  key={id}
                  style={{
                    paddingBottom: 'var(--space-4)',
                    borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.08))',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        {friendlyUserAgent(row.userAgent)}
                        {isCurrent ? (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 'var(--text-xs)',
                              fontWeight: 600,
                              color: 'var(--color-primary, #8ab4f8)',
                            }}
                          >
                            This device
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                        IP: {row.ip || '—'}
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                        Signed in: {formatDateTime(row.createdAt)}
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                        Refresh expires: {formatDateTime(row.expiresAt)}
                      </div>
                      {row.revokedAt ? (
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                          Revoked: {formatDateTime(row.revokedAt)}
                          {row.revokedReason ? ` (${row.revokedReason})` : ''}
                        </div>
                      ) : null}
                      <div style={{ marginTop: 6 }}>
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color:
                              status === 'active'
                                ? 'var(--color-success, #81c995)'
                                : 'var(--color-text-muted)',
                          }}
                        >
                          {status}
                        </span>
                      </div>
                    </div>
                    <div style={{ flex: '0 0 auto' }}>
                      {canRevoke ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={revokingId === id}
                          onClick={() => handleRevoke(id)}
                        >
                          {revokingId === id ? 'Revoking…' : isCurrent ? 'Sign out this device' : 'Revoke'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

export default LinkedDevices
