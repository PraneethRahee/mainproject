import NotificationBell from '../../components/NotificationBell.jsx'
import CallModal from '../../components/CallModal.jsx'
import { config } from '../../config/env.js'
import { iconInfo, iconMenu, iconSearch } from './ChatLayoutIcons.jsx'

export function ChatMainHeader({
  activeChannel,
  activeTitle,
  headerInitials,
  typingLabel,
  setSidebarOpen,
  setChatInfoOpen,
  showStarredOnly,
  setShowStarredOnly,
  setMessageSearchOpen,
  apiRequest,
  enqueueToast,
  user,
  dmOtherMember,
  callFocusId,
}) {
  return (
    <header className="gchat-main-header">
      <div className="gchat-main-title-block">
        <button
          type="button"
          className="gchat-icon-btn gchat-mobile-only"
          aria-label="Show chats"
          onClick={() => setSidebarOpen(true)}
        >
          {iconMenu}
        </button>
        <button
          type="button"
          className="gchat-main-title-btn"
          onClick={() => {
            if (!activeChannel) return
            setChatInfoOpen(true)
          }}
          disabled={!activeChannel}
          title={activeChannel ? 'Open chat info' : 'Select a chat'}
        >
          <div
            className={`gchat-main-avatar${activeChannel?.type === 'dm' ? ' gchat-main-avatar--dm' : ''}`}
          >
            {headerInitials}
          </div>
          <div className="gchat-main-titles">
            <h2>{activeTitle}</h2>
            <p>
              {activeChannel
                ? activeChannel.type === 'dm'
                  ? 'Direct message'
                  : 'Space'
                : 'Select a chat'}
            </p>
          </div>
        </button>
      </div>
      <div className="gchat-main-actions">
        {typingLabel && activeChannel && <span className="gchat-typing">{typingLabel}</span>}
        {config.featurePushNotificationsEnabled && (
          <NotificationBell apiRequest={apiRequest} enqueueToast={enqueueToast} user={user} />
        )}
        {config.featureCallsEnabled && (
          <CallModal
            user={user}
            apiRequest={apiRequest}
            enqueueToast={enqueueToast}
            activeChannel={activeChannel}
            dmOtherMember={dmOtherMember}
            initialCallId={callFocusId}
          />
        )}
        <button
          type="button"
          className="gchat-icon-btn"
          title={showStarredOnly ? 'Show all messages' : 'Show starred messages'}
          aria-label={showStarredOnly ? 'Show all messages' : 'Show starred messages'}
          onClick={() => setShowStarredOnly((v) => !v)}
        >
          {showStarredOnly ? '★' : '☆'}
        </button>
        <button
          type="button"
          className="gchat-icon-btn"
          title="Search messages"
          aria-label="Search messages"
          onClick={() => {
            if (!activeChannel) return
            setMessageSearchOpen(true)
          }}
        >
          {iconSearch}
        </button>
        <button
          type="button"
          className="gchat-icon-btn"
          title="Details"
          aria-label="Details"
          onClick={() => {
            if (!activeChannel) return
            setChatInfoOpen(true)
          }}
        >
          {iconInfo}
        </button>
      </div>
    </header>
  )
}
