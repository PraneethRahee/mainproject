export function MessageSearchModal({
  onClose,
  messageSearchQuery,
  setMessageSearchQuery,
  messageSearchLoading,
  messageSearchError,
  messageSearchResults,
  enqueueToast,
}) {
  return (
    <div className="gchat-info-overlay" onClick={onClose}>
      <aside
        className="gchat-mini-profile"
        onClick={(e) => e.stopPropagation()}
        aria-label="Search messages"
      >
        <div className="gchat-info-header">
          <h3>Search messages</h3>
          <button type="button" className="gchat-icon-btn" aria-label="Close search" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="gchat-info-body">
          <input
            type="search"
            className="gchat-info-member-search"
            placeholder="Type to search in this chat"
            value={messageSearchQuery}
            onChange={(e) => setMessageSearchQuery(e.target.value)}
            autoFocus
          />
          {messageSearchLoading && <div className="gchat-info-state">Searching…</div>}
          {!messageSearchLoading && messageSearchError && (
            <div className="gchat-info-state gchat-info-state--error">{messageSearchError}</div>
          )}
          {!messageSearchLoading &&
            !messageSearchError &&
            messageSearchQuery.trim() &&
            messageSearchResults.length === 0 && (
              <div className="gchat-info-state">No messages found.</div>
            )}
          {!messageSearchLoading && !messageSearchError && messageSearchResults.length > 0 && (
            <div className="gchat-search-results">
              {messageSearchResults.map((m) => (
                <div
                  key={m.id}
                  className="gchat-search-result-item"
                  onClick={() => {
                    const target = document.querySelector(`[data-message-id="${m.id}"]`)
                    if (target) {
                      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      onClose()
                    } else {
                      enqueueToast('error', 'Message is not in current loaded page')
                    }
                  }}
                >
                  <div className="gchat-search-result-time">
                    {new Date(m.timestamp).toLocaleString()}
                  </div>
                  <div className="gchat-search-result-text">
                    {String(m.content || '').slice(0, 220) || '(no text)'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
