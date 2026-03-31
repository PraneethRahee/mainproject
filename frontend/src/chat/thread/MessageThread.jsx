export function MessageThread({
  displayedMessages,
  formatDate,
  formatTime,
  formatDisappearingRemaining,
  user,
  userInitials,
  initialsFromString,
  replyJumpHighlightId,
  multiSelectMode,
  selectedMessageIds,
  toggleMessageSelected,
  canForwardMessage,
  activeChannel,
  senderDisplay,
  renderMessageStatus,
  messageMenuFor,
  setMessageMenuFor,
  startForwardFromMessage,
  handleTogglePin,
  handleToggleStar,
  handleDeleteForEveryone,
  renderReplyPreview,
  renderMessageContent,
  renderMessageAttachments,
  renderMessageReactions,
  reactionPickerFor,
  setReactionPickerFor,
  handleToggleGroupReaction,
  setReplyToDraft,
}) {
  return (
    <>
      {displayedMessages.map((m, index) => {
        const currentDate = formatDate(m.createdAt)
        const prev = displayedMessages[index - 1]
        const prevDate = prev ? formatDate(prev.createdAt) : null
        const showDateDivider = !prevDate || prevDate !== currentDate
        const sameSenderAsPrev =
          Boolean(prev) && String(prev.sender) === String(m.sender) && !showDateDivider
        const isOwn = user && String(m.sender) === String(user.id)
        const showHeader = !sameSenderAsPrev
        const senderStr = String(m.sender ?? '')
        const avatarLetter = isOwn ? userInitials : initialsFromString(senderStr)

        const canReact = activeChannel?.type === 'group' && !m.deleted && m.type !== 'system'
        const canReply = activeChannel?.type === 'group' && !m.deleted && m.type !== 'system'
        const canDeleteForEveryone =
          isOwn &&
          !m.deleted &&
          m.type !== 'system' &&
          Date.now() - new Date(m.createdAt).getTime() <= 15 * 60 * 1000

        return (
          <div key={m.id}>
            {showDateDivider && (
              <div className="gchat-date-pill">
                <span>{currentDate}</span>
              </div>
            )}
            <div
              data-message-id={m.id}
              className={`gchat-msg-row${isOwn ? ' gchat-msg-row--self' : ' gchat-msg-row--other'}${
                sameSenderAsPrev ? ' gchat-msg-row--compact' : ''
              }${
                replyJumpHighlightId === m.id ? ' gchat-msg-row--reply-jump-highlight' : ''
              }`}
            >
              {multiSelectMode && canForwardMessage(m) ? (
                <button
                  type="button"
                  className="gchat-msg-select-btn"
                  aria-label={selectedMessageIds.includes(m.id) ? 'Unselect message' : 'Select message'}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleMessageSelected(m.id)
                  }}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: selectedMessageIds.includes(m.id)
                      ? 'rgba(0,150,255,0.18)'
                      : 'transparent',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 auto',
                  }}
                >
                  {selectedMessageIds.includes(m.id) ? '✓' : ''}
                </button>
              ) : null}
              {showHeader ? (
                <div
                  className={`gchat-msg-avatar${isOwn ? ' gchat-msg-avatar--self' : ''}`}
                  aria-hidden
                >
                  {avatarLetter}
                </div>
              ) : (
                <div className="gchat-msg-avatar-spacer" aria-hidden />
              )}
              <div className="gchat-msg-stack">
                {showHeader && (
                  <div className="gchat-msg-head">
                    <span className="gchat-msg-sender">{senderDisplay(m)}</span>
                  </div>
                )}
                <div className="gchat-msg-body">
                  {!multiSelectMode && (
                    <div className="gchat-message-menu-wrap gchat-message-menu-wrap--bubble" data-message-menu-wrap>
                      <button
                        type="button"
                        className="gchat-message-menu-btn"
                        onClick={() => setMessageMenuFor((current) => (current === m.id ? null : m.id))}
                      >
                        ⋯
                      </button>
                      {messageMenuFor === m.id && (
                        <div className="gchat-message-menu">
                          {canReact && (
                            <button
                              type="button"
                              onClick={() => {
                                setReactionPickerFor((current) => (current === m.id ? null : m.id))
                              }}
                            >
                              React
                            </button>
                          )}
                          {canReply && (
                            <button
                              type="button"
                              onClick={() =>
                                setReplyToDraft({
                                  id: m.id,
                                  sender: m.sender,
                                  content: m.content,
                                })
                              }
                            >
                              Reply
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => startForwardFromMessage(m)}
                            disabled={!canForwardMessage(m)}
                          >
                            Forward
                          </button>
                          <button type="button" onClick={() => handleTogglePin(m)}>
                            {m.isPinned ? 'Unpin' : 'Pin'}
                          </button>
                          <button type="button" onClick={() => handleToggleStar(m)}>
                            {m.isStarred ? 'Unstar' : 'Star'}
                          </button>
                          {canDeleteForEveryone && (
                            <button type="button" onClick={() => handleDeleteForEveryone(m)}>
                              Delete for everyone
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {renderReplyPreview(m)}
                  {renderMessageContent(m.content)}
                  {renderMessageAttachments(m)}
                  {renderMessageReactions(m)}
                  <div className="gchat-msg-meta">
                    {m.expiresAt && m.type !== 'system' && (
                      <span className="gchat-msg-expiry">
                        {formatDisappearingRemaining(m.expiresAt)}
                      </span>
                    )}
                    <span className="gchat-msg-time">
                      {formatTime(m.createdAt)}
                      {isOwn && renderMessageStatus(m)}
                    </span>
                  </div>
                  {canReact && reactionPickerFor === m.id && (
                    <div className="gchat-reaction-picker-wrap" data-reaction-picker-wrap>
                      <div className="gchat-reaction-picker" role="menu" aria-label="Reaction picker">
                        {(() => {
                          const buckets = Array.isArray(m.reactions) ? m.reactions : []
                          const byEmoji = new Map(
                            buckets.map((r) => [
                              r.emoji,
                              Array.isArray(r.userIds) ? r.userIds.map(String) : [],
                            ]),
                          )
                          const mine = user
                            ? buckets
                                .filter(
                                  (r) =>
                                    Array.isArray(r.userIds) &&
                                    r.userIds.some((uid) => String(uid) === String(user.id)),
                                )
                                .map((r) => r.emoji)
                            : []
                          const defaults = ['👍', '❤️', '😂', '😮', '🎉', '😢']
                          const orderedFromExisting = Array.from(
                            new Set([
                              ...mine,
                              ...buckets
                                .filter((r) => (Array.isArray(r.userIds) ? r.userIds.length : 0) > 0)
                                .map((r) => r.emoji),
                            ]),
                          )
                          const ordered = orderedFromExisting.length > 0 ? orderedFromExisting : defaults
                          return ordered.map((emoji) => {
                            const userIds = byEmoji.get(emoji) || []
                            const count = userIds.length
                            const mineActive = user && userIds.some((uid) => String(uid) === String(user.id))

                            return (
                              <button
                                key={`${m.id}-emoji-${emoji}`}
                                type="button"
                                className={`gchat-reaction-picker-btn${
                                  mineActive ? ' gchat-reaction-picker-btn--mine' : ''
                                }`}
                                onClick={() => {
                                  void handleToggleGroupReaction(m.id, emoji)
                                  setReactionPickerFor(null)
                                }}
                              >
                                <span className="gchat-reaction-picker-btn-emoji">{emoji}</span>
                                {count > 0 && (
                                  <span className="gchat-reaction-picker-btn-count">{count}</span>
                                )}
                              </button>
                            )
                          })
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}

