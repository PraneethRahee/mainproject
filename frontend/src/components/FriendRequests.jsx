import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/session.js'

export default function FriendRequests({ enqueueToast }) {
  const [pending, setPending] = useState([])
  const [sent, setSent] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('pending')

  useEffect(() => {
    const loadRequests = async () => {
      setLoading(true)
      try {
        const [pendingRes, sentRes] = await Promise.all([
          apiRequest('/friends/requests/pending'),
          apiRequest('/friends/requests/sent'),
        ])
        if (pendingRes.ok && sentRes.ok) {
          const pendingData = await pendingRes.json()
          const sentData = await sentRes.json()
          setPending(pendingData.requests || [])
          setSent(sentData.requests || [])
        }
      } catch (err) {
        console.error('Failed to load requests', err)
      } finally {
        setLoading(false)
      }
    }
    loadRequests()
  }, [])

  const handleAccept = async (requestId, senderId) => {
    try {
      const res = await apiRequest('/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      })
      if (res.ok) {
        const senderName = pending.find(r => r._id === requestId)?.senderId?.displayName || 'user'
        setPending(pending.filter(r => r._id !== requestId))
        enqueueToast('success', `Now friends with ${senderName}`)
      }
    } catch (err) {
      enqueueToast('error', 'Failed to accept request')
    }
  }

  const handleReject = async (requestId) => {
    try {
      const res = await apiRequest('/friends/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      })
      if (res.ok) {
        setPending(pending.filter(r => r._id !== requestId))
        enqueueToast('success', 'Friend request rejected')
      }
    } catch (err) {
      enqueueToast('error', 'Failed to reject request')
    }
  }

  if (loading) return <div className="gchat-info-state">Loading requests...</div>

  return (
    <>
      <div className="gchat-info-tabs" style={{ marginBottom: '16px', background: 'transparent', padding: 0, border: 'none' }}>
        <button 
          className={`gchat-info-tab${activeTab === 'pending' ? ' gchat-info-tab--active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          Pending ({pending.length})
        </button>
        <button 
          className={`gchat-info-tab${activeTab === 'sent' ? ' gchat-info-tab--active' : ''}`}
          onClick={() => setActiveTab('sent')}
        >
          Sent ({sent.length})
        </button>
      </div>
      
      {activeTab === 'pending' && (
        <div className="requests-list">
          {pending.length === 0 ? (
            <div className="gchat-info-state" style={{ padding: '10px 0' }}>No pending requests</div>
          ) : (
            <div>
              {pending.map((req) => (
                <div key={req._id} className="gchat-info-member-row">
                  <div className="gchat-info-member-avatar">
                     {(req.senderId?.displayName || req.senderId?.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="gchat-info-member-meta" style={{ flex: 1, marginLeft: '10px' }}>
                    <div className="gchat-info-member-name" style={{ fontSize: '14px', color: '#e9edef' }}>
                      {req.senderId?.displayName || req.senderId?.email || 'Unknown'}
                    </div>
                    {req.senderId?.email && (
                      <div style={{ fontSize: '12px', color: '#8696a0', marginTop: '2px' }}>
                        {req.senderId.email}
                      </div>
                    )}
                  </div>
                  <div className="gchat-info-member-actions">
                    <button className="gchat-info-admin-btn" onClick={() => handleAccept(req._id, req.senderId._id)}>Accept</button>
                    <button className="gchat-info-admin-btn gchat-info-admin-btn--danger" onClick={() => handleReject(req._id)}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'sent' && (
        <div className="requests-list">
          {sent.length === 0 ? (
            <div className="gchat-info-state" style={{ padding: '10px 0' }}>No sent requests</div>
          ) : (
            <div>
              {sent.map((req) => (
                <div key={req._id} className="gchat-info-member-row">
                  <div className="gchat-info-member-avatar">
                     {(req.receiverId?.displayName || req.receiverId?.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="gchat-info-member-meta" style={{ flex: 1, marginLeft: '10px' }}>
                    <div className="gchat-info-member-name" style={{ fontSize: '14px', color: '#e9edef' }}>
                      {req.receiverId?.displayName || req.receiverId?.email || 'Unknown'}
                    </div>
                    {req.receiverId?.email && (
                      <div style={{ fontSize: '12px', color: '#8696a0', marginTop: '2px' }}>
                        {req.receiverId.email}
                      </div>
                    )}
                  </div>
                  <div className="gchat-info-member-actions">
                    <span style={{ fontSize: '12px', color: '#aebac1', paddingRight: '10px' }}>{req.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
