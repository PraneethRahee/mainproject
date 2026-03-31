export function ForwardMessagesModal({
  selectedCount,
  channels,
  getChannelLabel,
  getChannelId,
  forwardError,
  forwardTargetQuery,
  setForwardTargetQuery,
  forwardTargetChannelId,
  setForwardTargetChannelId,
  forwarding,
  onClose,
  onCancel,
  onConfirmForward,
}) {
  return (
    <div className="gchat-info-overlay" onClick={onClose}>
      <aside
        className="gchat-mini-profile"
        onClick={(e) => e.stopPropagation()}
        aria-label="Forward messages"
      >
        <div className="gchat-info-header">
          <h3>Forward {selectedCount} message(s)</h3>
          <button type="button" className="gchat-icon-btn" aria-label="Close forward" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="gchat-info-body">
          {forwardError && (
            <div className="gchat-info-state gchat-info-state--error" role="alert">
              {forwardError}
            </div>
          )}

          <input
            type="search"
            className="gchat-info-member-search"
            placeholder="Search chats"
            value={forwardTargetQuery}
            onChange={(e) => setForwardTargetQuery(e.target.value)}
            autoFocus
          />

          <div style={{ maxHeight: 240, overflow: 'auto', marginTop: 10 }}>
            {(forwardTargetQuery.trim()
              ? channels.filter((c) =>
                  getChannelLabel(c).toLowerCase().includes(forwardTargetQuery.trim().toLowerCase()),
                )
              : channels
            ).map((c) => {
              const id = getChannelId(c)
              const label = getChannelLabel(c)
              const isSelected = String(id) === String(forwardTargetChannelId)
              return (
                <button
                  key={String(id)}
                  type="button"
                  className="gchat-info-admin-btn"
                  onClick={() => setForwardTargetChannelId(id)}
                  disabled={forwarding}
                  style={{
                    width: '100%',
                    display: 'block',
                    marginBottom: 8,
                    border: isSelected ? '1px solid rgba(0,150,255,0.9)' : '1px solid rgba(255,255,255,0.10)',
                    background: isSelected ? 'rgba(0,150,255,0.12)' : 'rgba(255,255,255,0.03)',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 10,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div className="gchat-info-confirm-actions" style={{ marginTop: 14 }}>
            <button type="button" className="gchat-info-admin-btn" onClick={onCancel} disabled={forwarding}>
              Cancel
            </button>
            <button
              type="button"
              className="gchat-info-admin-btn gchat-info-admin-btn--danger"
              disabled={forwarding || !forwardTargetChannelId}
              onClick={onConfirmForward}
            >
              {forwarding ? 'Forwarding…' : 'Forward'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}
