import { useCallback, useEffect, useState } from 'react'

const PRESETS = [
  { id: 'off', label: 'Notifications on' },
  { id: '1h', label: 'Mute 1 hour' },
  { id: '8h', label: 'Mute 8 hours' },
  { id: '1w', label: 'Mute 1 week' },
  { id: 'forever', label: 'Mute until I turn on' },
]

function formatUntil(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

export function ChatNotificationPrefsPanel({ channelId, apiRequest, enqueueToast }) {
  const [loading, setLoading] = useState(true)
  const [savingPreset, setSavingPreset] = useState(null)
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [mutedUntil, setMutedUntil] = useState(null)

  const load = useCallback(async () => {
    if (!channelId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await apiRequest(`/conversations/${encodeURIComponent(channelId)}/notification-prefs`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not load notification settings')
        return
      }
      setMuted(Boolean(data.muted))
      setMutedUntil(data.mutedUntil || null)
    } catch {
      setError('Could not load notification settings')
    } finally {
      setLoading(false)
    }
  }, [apiRequest, channelId])

  useEffect(() => {
    void load()
  }, [load])

  const applyPreset = async (preset) => {
    if (!channelId || savingPreset) return
    setSavingPreset(preset)
    setError('')
    try {
      const res = await apiRequest(`/conversations/${encodeURIComponent(channelId)}/notification-prefs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not update')
        enqueueToast?.(data.error || 'Could not update notification settings')
        return
      }
      setMuted(Boolean(data.muted))
      setMutedUntil(data.mutedUntil || null)
      enqueueToast?.(
        preset === 'off' ? 'Notifications enabled for this chat' : 'Notification settings updated',
      )
    } catch {
      setError('Could not update')
      enqueueToast?.('Could not update notification settings')
    } finally {
      setSavingPreset(null)
    }
  }

  if (!channelId) return null

  return (
    <div className="gchat-info-card gchat-info-notify-card">
      <div className="gchat-info-section-title">
        Notifications
      </div>
      <div className="gchat-info-sub gchat-info-notify-sub">
        Mute push and inbox alerts for this chat only. Global notification types are unchanged.
      </div>
      {loading ? (
        <div className="gchat-info-state">Loading…</div>
      ) : (
        <>
          {error && (
            <div className="gchat-info-state gchat-info-state--error">
              {error}
            </div>
          )}
          <div className="gchat-info-sub gchat-info-notify-state">
            {muted
              ? mutedUntil
                ? `Muted until ${formatUntil(mutedUntil)}`
                : 'Muted until you turn notifications back on'
              : 'Notifications on for this chat'}
          </div>
          <div className="gchat-info-chip-grid">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="gchat-info-chip-btn"
                disabled={Boolean(savingPreset)}
                onClick={() => void applyPreset(p.id)}
              >
                {savingPreset === p.id ? 'Saving…' : p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
