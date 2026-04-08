import { useState } from 'react'
import { apiRequest } from '../lib/session.js'

export default function AddFriend({ enqueueToast }) {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState([])
  const [searching, setSearching] = useState(false)
  const [sentMap, setSentMap] = useState({})

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await apiRequest(`/users/search?query=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch (err) {
      console.error(err)
      enqueueToast('error', 'Failed to search users')
    } finally {
      setSearching(false)
    }
  }

  const handleSendRequest = async (userId) => {
    try {
      const res = await apiRequest('/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: userId })
      })
      if (res.ok) {
        enqueueToast('success', 'Friend request sent!')
        setSentMap(prev => ({ ...prev, [userId]: true }))
      } else {
        const errData = await res.json().catch(() => ({}))
        enqueueToast('error', errData.error || 'Failed to send request')
      }
    } catch (err) {
      console.error(err)
      enqueueToast('error', 'Network error sending request')
    }
  }

  return (
    <>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input 
          type="search" 
          value={query} 
          onChange={(e) => setQuery(e.target.value)} 
          placeholder="Search by name or email"
          className="gchat-info-member-search"
          style={{ marginBottom: 0, flex: 1 }}
        />
        <button type="submit" disabled={searching} className="gchat-info-admin-btn" style={{ height: '44px' }}>
          {searching ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div>
        {users.length === 0 && !searching && query && <div className="gchat-info-state" style={{ padding: '10px 0' }}>No users found.</div>}
        {users.map(u => (
          <div key={u._id} className="gchat-info-member-row">
            <div className="gchat-info-member-avatar gchat-info-member-avatar-btn">
              {u.avatarUrl ? (
                <img src={u.avatarUrl} alt={u.displayName || u.email} className="gchat-info-member-avatar-img" />
              ) : (
                (u.displayName || u.email || 'U')[0].toUpperCase()
              )}
            </div>
            <div className="gchat-info-member-meta" style={{ flex: 1, marginLeft: '10px' }}>
              <div className="gchat-info-member-name" style={{ fontSize: '14px', color: '#e9edef' }}>{u.displayName || u.email}</div>
              {u.displayName && <div className="gchat-info-member-sub" style={{ fontSize: '12px', color: '#aebac1' }}>{u.email}</div>}
            </div>
            <div className="gchat-info-member-actions">
              <button 
                onClick={() => handleSendRequest(u._id)} 
                disabled={sentMap[u._id]}
                className="gchat-info-admin-btn"
              >
                {sentMap[u._id] ? 'Sent' : 'Add Friend'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
