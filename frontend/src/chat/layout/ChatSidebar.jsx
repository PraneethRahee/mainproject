import { iconMenu, iconNewChat, iconSearch } from './ChatLayoutIcons.jsx'

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
}) {
  return (
    <aside
      className={`gchat-sidebar${sidebarOpen ? ' gchat-sidebar--open' : ''}`}
      aria-label="Chats list"
    >
      <div className="gchat-sidebar-top">
        <button type="button" className="gchat-icon-btn" aria-label="Menu">
          {iconMenu}
        </button>
        <h1 className="gchat-sidebar-title">Chats</h1>
        <button type="button" className="gchat-icon-btn" title="New chat" aria-label="New chat">
          {iconNewChat}
        </button>
      </div>

      <div className="gchat-search">
        {iconSearch}
        <input
          className="gchat-search-input"
          type="search"
          placeholder="Search in chats"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

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
    </aside>
  )
}
