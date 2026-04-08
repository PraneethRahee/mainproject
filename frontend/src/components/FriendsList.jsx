import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/session.js'

export default function FriendsList({ friends: friendsProp, onSelectFriend, onClose }) {
  // If parent passes friends array, use it. Otherwise fetch independently.
  const [friends, setFriends] = useState(friendsProp || [])
  const [loading, setLoading] = useState(!friendsProp)

  useEffect(() => {
    if (friendsProp !== undefined) {
      // Parent controls the data — keep in sync.
      setFriends(friendsProp)
      setLoading(false)
      return
    }
    const loadFriends = async () => {
      setLoading(true)
      try {
        const res = await apiRequest('/friends/list')
        if (res.ok) {
          const data = await res.json()
          setFriends(data.friends || [])
        }
      } catch (err) {
        console.error('Failed to load friends', err)
      } finally {
        setLoading(false)
      }
    }
    loadFriends()
  }, [friendsProp])

  const handleStartChat = async (friendId) => {
    if (onSelectFriend) {
      onSelectFriend(friendId)
      return
    }
    try {
      const res = await apiRequest('/conversations/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherUserId: friendId }),
      })
      if (res.ok) {
        const data = await res.json()
        const conversationId = data.conversation?.channelId || data.channelId
        if (conversationId) {
          onClose?.()
        }
      }
    } catch (err) {
      console.error('Failed to start DM', err)
    }
  }

  if (loading) return <div className="gchat-info-state">Loading friends...</div>

  return (
    <>
      <div className="gchat-info-section-title" style={{ marginBottom: '16px' }}>My Friends</div>
      {friends.length === 0 ? (
        <div className="gchat-info-state">No friends yet. Go to the Add Friend tab to connect with people!</div>
      ) : (
        <div>
          {friends.map((friend) => {
            // Support both new { id, name, email } format and legacy raw ID strings
            const friendId = (typeof friend === 'object' ? friend.id : friend) || String(friend)
            const displayName = (typeof friend === 'object'
              ? (friend.name || friend.displayName || friend.username || friend.email)
              : null) || String(friendId)
            const displayEmail = typeof friend === 'object' ? (friend.email || '') : ''
            const initials = displayName.slice(0, 1).toUpperCase()

            return (
              <div key={friendId} className="gchat-info-member-row">
                <div className="gchat-info-member-avatar">
                  {initials}
                </div>
                <div className="gchat-info-member-meta" style={{ flex: 1, marginLeft: '10px' }}>
                  <div className="gchat-info-member-name" style={{ fontSize: '14px', color: '#e9edef' }}>
                    {displayName}
                  </div>
                  {displayEmail && (
                    <div style={{ fontSize: '12px', color: '#8696a0', marginTop: '2px' }}>
                      {displayEmail}
                    </div>
                  )}
                </div>
                <div className="gchat-info-member-actions">
                  <button
                    className="gchat-info-admin-btn"
                    onClick={() => handleStartChat(friendId)}
                  >
                    Message
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
