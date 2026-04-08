import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/session.js'
import FriendsList from './FriendsList.jsx'
import FriendRequests from './FriendRequests.jsx'
import AddFriend from './AddFriend.jsx'

export default function FriendsPanel({ onClose, onSelectFriend, enqueueToast }) {
  const [friends, setFriends] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('friends') // 'friends', 'requests', 'add'

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const friendsRes = await apiRequest('/friends/list')
        if (friendsRes.ok) {
          const friendsData = await friendsRes.json()
          setFriends(friendsData.friends || [])
        }

        const pendingRes = await apiRequest('/friends/requests/pending')
        if (pendingRes.ok) {
          const pendingData = await pendingRes.json()
          setPendingCount((pendingData.requests || []).length)
        }
      } catch (err) {
        console.error('Failed to load friends data', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleStartChat = async (friendId) => {
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
          onSelectFriend?.({ _id: conversationId, type: 'dm', otherUserId: friendId })
          onClose?.()
        }
      }
    } catch (err) {
      enqueueToast('error', 'Failed to start conversation')
    }
  }

  return (
    <div className="gchat-info-overlay" onClick={onClose}>
      <aside
        className="gchat-info-panel"
        onClick={(e) => e.stopPropagation()}
        aria-label="Friends panel"
      >
        <div className="gchat-info-header">
          <div className="gchat-info-header-left">
            <button
              type="button"
              className="gchat-info-back-btn"
              aria-label="Close friends panel"
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                />
              </svg>
            </button>
            <h3>Friends</h3>
          </div>
        </div>

        {loading ? (
          <div className="gchat-info-state">Loading friends…</div>
        ) : (
          <div className="gchat-info-body">
            <div className="gchat-info-tabs" role="tablist" aria-label="Friends tabs">
              <button
                type="button"
                role="tab"
                className={`gchat-info-tab${activeTab === 'friends' ? ' gchat-info-tab--active' : ''}`}
                onClick={() => setActiveTab('friends')}
                aria-selected={activeTab === 'friends'}
              >
                Friends ({friends.length})
              </button>
              <button
                type="button"
                role="tab"
                className={`gchat-info-tab${activeTab === 'requests' ? ' gchat-info-tab--active' : ''}`}
                onClick={() => setActiveTab('requests')}
                aria-selected={activeTab === 'requests'}
              >
                Requests {pendingCount > 0 ? `(${pendingCount})` : ''}
              </button>
              <button
                type="button"
                role="tab"
                className={`gchat-info-tab${activeTab === 'add' ? ' gchat-info-tab--active' : ''}`}
                onClick={() => setActiveTab('add')}
                aria-selected={activeTab === 'add'}
              >
                Add Friend
              </button>
            </div>

            {activeTab === 'friends' && (
              <div className="gchat-info-members">
                {friends.length === 0 ? (
                  <div className="gchat-info-state">
                    No friends yet. Go to Add Friend to connect with people!
                  </div>
                ) : (
                  <FriendsList 
                    friends={friends}
                    onSelectFriend={handleStartChat}
                    onClose={onClose}
                  />
                )}
              </div>
            )}
            
            {activeTab === 'requests' && (
              <div className="gchat-info-members">
                <FriendRequests 
                  enqueueToast={enqueueToast}
                  onSelectFriend={handleStartChat}
                  onClose={onClose}
                />
              </div>
            )}
            
            {activeTab === 'add' && (
              <div className="gchat-info-members">
                <AddFriend enqueueToast={enqueueToast} />
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}
