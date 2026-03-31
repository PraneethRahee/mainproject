export function ChatThreadPanel({
  threadRef,
  onScroll,
  messagesLoading,
  activeChannel,
  messagesError,
  displayedMessages,
  showStarredOnly,
  isLoadingMore,
  children,
}) {
  return (
    <div className="gchat-thread" ref={threadRef} onScroll={onScroll}>
      {messagesLoading && !activeChannel && (
        <div className="gchat-placeholder">
          <p>Select a chat from the list to get started.</p>
        </div>
      )}
      {messagesLoading && activeChannel && (
        <div className="gchat-placeholder">
          <p>Loading messages…</p>
        </div>
      )}
      {!messagesLoading && !activeChannel && (
        <div className="gchat-placeholder">
          <p>Select a chat from the list to get started.</p>
        </div>
      )}
      {!messagesLoading && activeChannel && messagesError && (
        <div className="gchat-placeholder">
          <p>{messagesError}</p>
        </div>
      )}
      {!messagesLoading && activeChannel && !messagesError && displayedMessages.length === 0 && (
        <div className="gchat-placeholder">
          <p>{showStarredOnly ? 'No starred messages yet.' : 'No messages yet. Say hello.'}</p>
        </div>
      )}
      {!messagesLoading && activeChannel && !messagesError && displayedMessages.length > 0 && (
        <>
          {isLoadingMore && <div className="gchat-load-more">Loading older messages…</div>}
          {children}
        </>
      )}
    </div>
  )
}
