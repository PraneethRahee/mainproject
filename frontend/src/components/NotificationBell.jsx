import { useEffect, useMemo, useState } from 'react'
import { ensureWebPushSubscription } from '../lib/push.js'

function formatWhen(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return ''
  }
}

function notificationTitle(type, payload) {
  if (type === 'call') return 'Incoming call'
  if (type === 'story') return 'New story'
  // default: message
  const preview = payload?.contentPreview
  return preview ? 'New message' : 'New message'
}

export default function NotificationBell({ apiRequest, enqueueToast, user }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  const hasAuth = Boolean(user?.id)

  const refreshUnread = async () => {
    if (!hasAuth) return
    setLoading(true)
    setError('')
    try {
      const res = await apiRequest('/notifications?unreadOnly=true&limit=10')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load notifications')

      const notifs = Array.isArray(data.notifications) ? data.notifications : []
      setUnreadCount(notifs.length)
    } catch (err) {
      setError(err?.message || 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  const refreshList = async () => {
    if (!hasAuth) return
    setLoading(true)
    setError('')
    try {
      const res = await apiRequest('/notifications?unreadOnly=false&limit=20')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load notifications')

      setItems(Array.isArray(data.notifications) ? data.notifications : [])
    } catch (err) {
      setError(err?.message || 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!hasAuth) return
    void refreshUnread()

    const id = window.setInterval(() => {
      void refreshUnread()
    }, 30000)

    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAuth])

  useEffect(() => {
    if (!hasAuth) return
    // Best-effort: subscription should not break the chat UI.
    void ensureWebPushSubscription({ apiRequest, enqueueToast })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAuth])

  const iconBell = useMemo(
    () => (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z"
        />
      </svg>
    ),
    [],
  )

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="gchat-icon-btn"
        title={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-label="Notifications"
        onClick={async () => {
          setOpen((v) => !v)
          if (!open) {
            await refreshList()
          }
        }}
      >
        {iconBell}
      </button>

      {unreadCount > 0 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 6,
            right: 8,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'rgba(65, 168, 255, 0.95)',
          }}
        />
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Notification list"
          style={{
            position: 'absolute',
            right: 0,
            top: 46,
            width: 360,
            maxWidth: '80vw',
            zIndex: 60,
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(18,18,18,0.93)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 800 }}>Notifications</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className="gchat-info-admin-btn"
                style={{ padding: '6px 10px', height: 28 }}
                onClick={async () => {
                  try {
                    await apiRequest('/notifications/read', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ all: true }),
                    })
                    enqueueToast?.('success', 'Notifications cleared')
                    await refreshUnread()
                    await refreshList()
                  } catch {
                    enqueueToast?.('error', 'Failed to clear notifications')
                  }
                }}
              >
                Clear all
              </button>
              <button
                type="button"
                className="gchat-icon-btn"
                aria-label="Close notifications"
                style={{ width: 34, height: 34 }}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ padding: 12 }}>
            {loading && <div style={{ opacity: 0.8, fontSize: 13 }}>Loading…</div>}
            {error && <div style={{ opacity: 0.9, fontSize: 13 }}>{error}</div>}
            {!loading && !error && items.length === 0 && <div style={{ opacity: 0.8, fontSize: 13 }}>No notifications.</div>}

            {!loading && !error && items.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map((n) => (
                  <div
                    key={String(n.id)}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.10)',
                      background: n.readAt ? 'rgba(255,255,255,0.02)' : 'rgba(65, 168, 255, 0.08)',
                      cursor: 'pointer',
                    }}
                    onClick={async () => {
                      try {
                        await apiRequest('/notifications/read', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ notificationIds: [n.id] }),
                        })
                        await refreshUnread()
                        await refreshList()
                      } catch {
                        // ignore marking errors
                      }
                      let url = '/chat'
                      if (n.type === 'message' && n.payload?.messageId && n.payload?.conversationId) {
                        url = `/chat?focus=message&conversationId=${encodeURIComponent(
                          String(n.payload.conversationId),
                        )}&messageId=${encodeURIComponent(String(n.payload.messageId))}`
                      } else if (n.type === 'story' && n.payload?.storyId) {
                        url = `/chat?focus=story&storyId=${encodeURIComponent(String(n.payload.storyId))}`
                      } else if (n.type === 'call' && n.payload?.callId) {
                        url = `/chat?focus=call&callId=${encodeURIComponent(String(n.payload.callId))}`
                      }
                      window.location.href = url
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ fontWeight: 800 }}>
                        {notificationTitle(n.type, n.payload || {})}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.65 }}>{formatWhen(n.createdAt)}</div>
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>
                      {n.payload?.contentPreview
                        ? String(n.payload.contentPreview).slice(0, 140)
                        : n.payload?.callType
                          ? `Call (${n.payload.callType})`
                          : 'Tap to open'}
                    </div>
                    {!n.readAt && <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>Unread</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

