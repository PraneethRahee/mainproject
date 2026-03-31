import { useEffect, useState } from 'react'

function DMDisappearingMessagesPanel({ activeChannel, chatInfo, apiRequest, enqueueToast, refreshChatInfo }) {
  const channelId = activeChannel?._id ? String(activeChannel._id) : null
  const currentSeconds = Number(chatInfo?.channel?.metadata?.disappearingMessagesSeconds) || 0

  const [draftSeconds, setDraftSeconds] = useState(currentSeconds)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraftSeconds(currentSeconds)
  }, [currentSeconds])

  const handleUpdate = async () => {
    if (!channelId) return
    setSaving(true)
    try {
      const res = await apiRequest(`/channels/${channelId}/disappearing-messages`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disappearingMessagesSeconds: Math.floor(Number(draftSeconds) || 0) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update disappearing messages')

      enqueueToast('success', 'Disappearing message timer updated')
      await refreshChatInfo()
    } catch (err) {
      enqueueToast('error', err?.message || 'Failed to update disappearing messages')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="gchat-info-body">
      <div className="gchat-info-section-title">Disappearing Messages</div>
      <div className="gchat-info-sub" style={{ marginTop: 10, opacity: 0.85 }}>
        Per-chat expiry for new messages. Set to <strong>0</strong> to disable.
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label className="gchat-info-sub" style={{ display: 'block', opacity: 0.85, marginBottom: 6 }}>
            Timer (seconds)
          </label>
          <input
            type="number"
            min={0}
            max={30 * 24 * 60 * 60}
            step={10}
            value={Number.isFinite(Number(draftSeconds)) ? draftSeconds : 0}
            disabled={saving}
            onChange={(e) => setDraftSeconds(parseInt(e.target.value || '0', 10))}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.03)',
              color: '#fff',
            }}
          />
        </div>
        <button
          type="button"
          className="gchat-info-admin-btn"
          disabled={!channelId || saving}
          onClick={() => void handleUpdate()}
          style={{ height: 40 }}
        >
          {saving ? 'Saving…' : 'Update'}
        </button>
      </div>

      {saving && <div className="gchat-info-state">Saving…</div>}
    </div>
  )
}

export default DMDisappearingMessagesPanel

