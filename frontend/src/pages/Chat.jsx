import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { apiRequest } from '../lib/session.js'

function Chat() {
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [search, setSearch] = useState('')
  const [filteredChannels, setFilteredChannels] = useState([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [channelsError, setChannelsError] = useState('')

  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState('')
  const [nextCursor, setNextCursor] = useState(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const [composerText, setComposerText] = useState('')
  const [composerError, setComposerError] = useState('')
  const [isSending, setIsSending] = useState(false)

  const threadRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setChannelsLoading(true)
        setChannelsError('')
        const res = await apiRequest('/channels')
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && Array.isArray(data.channels)) {
          setChannels(data.channels)
          if (!activeChannel && data.channels.length > 0) {
            setActiveChannel(data.channels[0])
          }
        } else if (!cancelled && !res.ok) {
          setChannelsError(data.error || 'Failed to load channels')
        }
      } catch {
        if (!cancelled) {
          setChannels([])
          setChannelsError('Failed to load channels')
        }
      } finally {
        if (!cancelled) setChannelsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      setFilteredChannels(channels)
      return
    }
    setFilteredChannels(
      channels.filter((c) => c.name.toLowerCase().includes(q)),
    )
  }, [channels, search])

  const handleSelectChannel = (channel) => {
    setActiveChannel(channel)
    setMessages([])
    setNextCursor(null)
    setMessagesError('')
    setComposerText('')
    setComposerError('')
  }

  const getChannelLabel = (channel) =>
    channel.type === 'dm' ? channel.name : `# ${channel.name}`

  const activeTitle = activeChannel ? getChannelLabel(activeChannel) : '# Select a channel'

  useEffect(() => {
    if (!activeChannel) {
      setMessages([])
      setNextCursor(null)
      setMessagesError('')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        setMessagesLoading(true)
        setMessagesError('')
        const res = await apiRequest(`/channels/${activeChannel._id}/messages?limit=30`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && Array.isArray(data.messages)) {
          const sorted = [...data.messages].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          )
          setMessages(sorted)
          setNextCursor(data.nextCursor || null)
        } else {
          setMessages([])
          setNextCursor(null)
          setMessagesError(data.error || 'Failed to load messages')
        }
      } catch {
        if (!cancelled) {
          setMessages([])
          setNextCursor(null)
          setMessagesError('Failed to load messages')
        }
      } finally {
        if (!cancelled) setMessagesLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeChannel])

  const handleLoadMore = async () => {
    if (!activeChannel || !nextCursor || isLoadingMore) return
    if (!threadRef.current) return

    const container = threadRef.current
    const prevScrollHeight = container.scrollHeight

    setIsLoadingMore(true)
    try {
      const res = await apiRequest(
        `/channels/${activeChannel._id}/messages?limit=30&cursor=${encodeURIComponent(
          nextCursor,
        )}`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(data.messages) || data.messages.length === 0) {
        setNextCursor(null)
        return
      }
      const older = [...data.messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      setMessages((current) => [...older, ...current])
      setNextCursor(data.nextCursor || null)

      requestAnimationFrame(() => {
        const newScrollHeight = container.scrollHeight
        container.scrollTop = newScrollHeight - prevScrollHeight
      })
    } catch {
      // ignore, keep nextCursor as-is
    } finally {
      setIsLoadingMore(false)
    }
  }

  const handleThreadScroll = (event) => {
    const container = event.currentTarget
    if (container.scrollTop < 40 && nextCursor && !isLoadingMore) {
      handleLoadMore()
    }
  }

  const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const renderMessageContent = (content) => {
    const text = content || ''
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = []
    let lastIndex = 0
    let match

    // eslint-disable-next-line no-cond-assign
    while ((match = urlRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
      }
      parts.push({ type: 'link', value: match[0] })
      lastIndex = urlRegex.lastIndex
    }
    if (lastIndex < text.length) {
      parts.push({ type: 'text', value: text.slice(lastIndex) })
    }

    return parts.map((part, index) => {
      if (part.type === 'link') {
        return (
          <a
            key={`link-${index}-${part.value}`}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer"
          >
            {part.value}
          </a>
        )
      }
      return <span key={`text-${index}`}>{part.value}</span>
    })
  }

  const handleSend = async () => {
    if (!activeChannel || isSending) return

    const text = composerText.trim()
    if (!text) {
      setComposerError('Message cannot be empty')
      return
    }

    const MAX_LENGTH = 4000
    if (text.length > MAX_LENGTH) {
      setComposerError(`Message exceeds maximum length of ${MAX_LENGTH} characters`)
      return
    }

    setComposerError('')

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic = {
      id: tempId,
      channel: activeChannel._id,
      sender: 'you',
      content: text,
      attachments: [],
      createdAt: new Date().toISOString(),
    }

    setMessages((current) => [...current, optimistic])
    setComposerText('')
    setIsSending(true)

    try {
      const res = await apiRequest(`/channels/${activeChannel._id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: text }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setMessages((current) => current.filter((m) => m.id !== tempId))
        setComposerError(data.error || 'Failed to send message')
        return
      }

      setMessages((current) =>
        current.map((m) =>
          m.id === tempId
            ? {
                id: data.id,
                channel: data.channel,
                sender: data.sender,
                content: data.content,
                attachments: data.attachments || [],
                createdAt: data.createdAt,
                editedAt: data.editedAt || null,
              }
            : m,
        ),
      )
    } catch {
      setMessages((current) => current.filter((m) => m.id !== tempId))
      setComposerError('Failed to send message')
    } finally {
      setIsSending(false)
    }
  }

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="workspace">
      {/* Left sidebar: workspace nav */}
      <aside className="workspace-sidebar workspace-sidebar-left">
        <div className="workspace-logo">AG</div>
        <div className="workspace-switcher">
          <span className="workspace-switcher-label">Workspace</span>
          <Button variant="secondary" size="sm">
            Antigravity
          </Button>
        </div>
      </aside>

      {/* Middle column: channels + DMs nav */}
      <aside className="workspace-sidebar workspace-sidebar-middle">
        <header className="workspace-section-header">
          <span className="workspace-section-title">Channels &amp; DMs</span>
          <Button variant="ghost" size="sm">
            +
          </Button>
        </header>

        <div className="workspace-search">
          <input
            className="workspace-search-input"
            type="text"
            placeholder="Search channels or people"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="workspace-channel-list">
          {channelsLoading && (
            <div className="workspace-channel-empty">Loading channels…</div>
          )}
          {!channelsLoading &&
            filteredChannels.map((channel) => (
              <div
                key={channel._id}
                className={`workspace-channel-item${
                  activeChannel && activeChannel._id === channel._id
                    ? ' workspace-channel-item--active'
                    : ''
                }`}
                onClick={() => handleSelectChannel(channel)}
              >
                {getChannelLabel(channel)}
              </div>
            ))}
          {!channelsLoading && channelsError && (
            <div className="workspace-channel-empty">{channelsError}</div>
          )}
          {!channelsLoading && !channelsError && filteredChannels.length === 0 && (
            <div className="workspace-channel-empty">No channels yet.</div>
          )}
        </div>
      </aside>

      {/* Right column: conversation */}
      <section className="workspace-main">
        <header className="workspace-main-header">
          <div>
            <h1>{activeTitle}</h1>
            <p>Antigravity team · Today</p>
          </div>
          <div className="workspace-main-header-actions">
            <Button variant="ghost" size="sm">
              Members
            </Button>
            <Button variant="ghost" size="sm">
              Settings
            </Button>
          </div>
        </header>

        <div className="workspace-thread" ref={threadRef} onScroll={handleThreadScroll}>
          {messagesLoading && !activeChannel && (
            <div className="workspace-message-placeholder">
              <p>Select a channel from the left to get started.</p>
            </div>
          )}
          {messagesLoading && activeChannel && (
            <div className="workspace-message-skeleton">
              <div className="workspace-message-skeleton-line" />
              <div className="workspace-message-skeleton-line" />
              <div className="workspace-message-skeleton-line short" />
            </div>
          )}
          {!messagesLoading && !activeChannel && (
            <div className="workspace-message-placeholder">
              <p>Select a channel from the left to get started.</p>
            </div>
          )}
          {!messagesLoading && activeChannel && messagesError && (
            <div className="workspace-message-placeholder">
              <p>{messagesError}</p>
            </div>
          )}
          {!messagesLoading && activeChannel && !messagesError && messages.length === 0 && (
            <div className="workspace-message-placeholder">
              <p>No messages yet. Start the conversation.</p>
            </div>
          )}
          {!messagesLoading && activeChannel && !messagesError && messages.length > 0 && (
            <>
              {isLoadingMore && (
                <div className="workspace-message-loading-more">Loading older messages…</div>
              )}
              {messages.map((m, index) => {
                const currentDate = formatDate(m.createdAt)
                const prev = messages[index - 1]
                const prevDate = prev ? formatDate(prev.createdAt) : null
                const showDateDivider = !prevDate || prevDate !== currentDate
                return (
                  <div key={m.id}>
                    {showDateDivider && (
                      <div className="workspace-message-date">
                        <span>{currentDate}</span>
                      </div>
                    )}
                    <div className="workspace-message-row">
                      <div className="workspace-message-meta">
                        <span className="workspace-message-sender">
                          {m.sender.slice(0, 8)}
                        </span>
                        <span className="workspace-message-time">
                          {formatTime(m.createdAt)}
                        </span>
                      </div>
                      <div className="workspace-message-content">
                        {renderMessageContent(m.content)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>

        <footer className="workspace-composer">
          <div className="workspace-composer-main">
            <textarea
              className="workspace-composer-input"
              placeholder={
                activeChannel ? `Message ${activeTitle} (Enter to send, Shift+Enter for newline)` : 'Select a channel to start'
              }
              rows={2}
              value={composerText}
              disabled={!activeChannel || isSending}
              onChange={(e) => setComposerText(e.target.value)}
              onKeyDown={handleComposerKeyDown}
            />
            {composerError && (
              <div className="workspace-composer-error">
                {composerError}
              </div>
            )}
          </div>
          <Button size="md" disabled={!activeChannel || isSending} onClick={handleSend}>
            {isSending ? 'Sending…' : 'Send'}
          </Button>
        </footer>
      </section>
    </div>
  )
}

export default Chat
