export function ChatMultiSelectBar({
  selectedCount,
  forwarding,
  onForward,
  onCancel,
}) {
  return (
    <div
      className="gchat-multiselect-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.35)',
        position: 'sticky',
        top: 0,
        zIndex: 5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <strong>{selectedCount}</strong> selected
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          className="gchat-send-btn"
          disabled={forwarding || selectedCount === 0}
          onClick={onForward}
        >
          {forwarding ? 'Forwarding…' : 'Forward'}
        </button>
        <button type="button" className="gchat-send-btn" disabled={forwarding} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
