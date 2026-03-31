export function ChatLockOverlay({
  chatLockPinDraft,
  setChatLockPinDraft,
  chatLockActionLoading,
  chatLockError,
  setChatLockError,
  onUnlock,
}) {
  return (
    <div
      className="gchat-info-overlay"
      onClick={(e) => {
        e.stopPropagation()
      }}
    >
      <aside className="gchat-mini-profile" aria-label="Chat unlock challenge">
        <div className="gchat-info-header">
          <h3>Chat locked</h3>
        </div>
        <div className="gchat-info-body">
          <div className="gchat-info-state" style={{ marginBottom: 10 }}>
            Enter the PIN to unlock this chat for a short time.
          </div>
          <label className="gchat-info-sub" style={{ display: 'block', opacity: 0.85, marginBottom: 6 }}>
            PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            value={chatLockPinDraft}
            disabled={chatLockActionLoading}
            onChange={(e) => setChatLockPinDraft(e.target.value)}
            placeholder="4-8 digits"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.03)',
              color: '#fff',
            }}
          />
          {chatLockError && (
            <div className="gchat-info-state gchat-info-state--error" style={{ marginTop: 10 }}>
              {chatLockError}
            </div>
          )}
          <div className="gchat-info-confirm-actions" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="gchat-info-admin-btn"
              disabled={chatLockActionLoading}
              onClick={() => {
                setChatLockPinDraft('')
                setChatLockError('')
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="gchat-info-admin-btn gchat-info-admin-btn--danger"
              disabled={chatLockActionLoading}
              onClick={() => void onUnlock()}
            >
              {chatLockActionLoading ? 'Unlocking…' : 'Unlock'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}
