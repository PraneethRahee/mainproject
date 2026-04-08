import { useState, useEffect } from 'react'
import { iconSearch, iconPeople } from './ChatLayoutIcons.jsx'

export function ChatSidebar({
  sidebarOpen,
  search,
  setSearch,
  channelsLoading,
  filteredChannels,
  channelsError,
  activeChannel,
  handleSelectChannel,
  getChannelLabel,
  initialsFromString,
  onSelectFriend,
  showFriends,
  setShowFriends,
  pendingRequestsCount,
}) {
  const [activeTab, setActiveTab] = useState('chats')

  useEffect(() => {
    if (!showFriends && activeTab === 'friends') {
      setActiveTab('chats')
    }
  }, [showFriends])

  return (
    <aside
      className={`gchat-sidebar${sidebarOpen ? ' gchat-sidebar--open' : ''}`}
      aria-label="Chats list"
    >
      <div className="gchat-sidebar-top">
        <h1 className="gchat-sidebar-title">
          {activeTab === 'chats' ? 'Chats' : 'Friends'}
        </h1>
      </div>

      <div className="gchat-tabs">
        <button 
          className={`gchat-tab ${activeTab === 'chats' ? 'gchat-tab--active' : ''}`}
          onClick={() => {
            setActiveTab('chats')
            setShowFriends?.(false)
          }}
        >
          Chats
        </button>
        <button 
          className={`gchat-tab ${activeTab === 'friends' ? 'gchat-tab--active' : ''}`}
          onClick={() => {
            setActiveTab('friends')
            setShowFriends?.(true)
          }}
        >
          Friends
          {pendingRequestsCount > 0 && (
            <span className="pending-badge">{pendingRequestsCount}</span>
          )}
        </button>
      </div>

      <div className="gchat-search">
        {activeTab === 'chats' ? iconSearch : iconPeople}
        <input
          className="gchat-search-input"
          type="search"
          placeholder={activeTab === 'chats' ? 'Search in chats' : 'Search friends'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

      {activeTab === 'chats' && (
        <div className="gchat-convo-list">
          {channelsLoading && <div className="gchat-convo-empty">Loading chats…</div>}
          {!channelsLoading &&
            filteredChannels.map((channel) => {
              const isActive = activeChannel && activeChannel._id === channel._id
              const isDm = channel.type === 'dm'
              return (
                <button
                  key={channel._id}
                  type="button"
                  className={`gchat-convo-item${isActive ? ' gchat-convo-item--active' : ''}`}
                  onClick={() => handleSelectChannel(channel)}
                >
                  <div
                    className={`gchat-convo-avatar${isDm ? ' gchat-convo-avatar--dm' : ''}`}
                    aria-hidden
                  >
                    {initialsFromString(channel.name)}
                  </div>
                  <div className="gchat-convo-meta">
                    <div className="gchat-convo-name">{getChannelLabel(channel)}</div>
                    <div className="gchat-convo-sub">{isDm ? 'Direct message' : 'Space'}</div>
                  </div>
                </button>
              )
            })}
          {!channelsLoading && channelsError && (
            <div className="gchat-convo-empty">{channelsError}</div>
          )}
          {!channelsLoading && !channelsError && filteredChannels.length === 0 && (
            <div className="gchat-convo-empty">No chats yet.</div>
          )}
        </div>
      )}

      {activeTab === 'friends' && showFriends && (
        <div className="gchat-friends-panel">
          {/* FriendRequests component will handle this via onSelectFriend */}
          <div className="gchat-friends-empty">Select a friend to start chatting</div>
        </div>
      )}
    </aside>
  )
}
