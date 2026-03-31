import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../lib/session.js'

function GroupJoinRequest() {
  const { groupId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!groupId) {
        setError('Missing groupId')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      try {
        const res = await apiRequest(`/group/${groupId}/join-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to request to join')
        if (cancelled) return
        setStatus(data.status || 'requested')

        if (data.status === 'already_member') {
          navigate('/chat', { replace: true })
        }
      } catch (err) {
        if (cancelled) return
        setError(err?.message || 'Failed to request to join')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [groupId, navigate])

  // When a request is pending, poll until the admin approves/rejects it.
  useEffect(() => {
    if (!groupId) return
    if (status !== 'requested') return

    let cancelled = false

    const poll = async () => {
      try {
        const res = await apiRequest(`/group/${groupId}/join-request-status`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to fetch request status')
        if (cancelled) return

        const raw = data.status
        const next =
          raw === 'pending' ? 'requested' : raw === 'approved' ? 'approved' : raw === 'rejected' ? 'rejected' : raw

        setStatus(next)
        if (next === 'already_member' || next === 'approved') {
          navigate('/chat', { replace: true })
        }
      } catch (err) {
        if (cancelled) return
        setError(err?.message || 'Failed to fetch request status')
      }
    }

    // Poll immediately, then every 3s.
    void poll()
    const timer = setInterval(() => {
      void poll()
    }, 3000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [groupId, status, navigate])

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 12 }}>Requesting to join…</h2>
      {loading && <div>Working…</div>}

      {!loading && error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: 'rgba(255,0,0,0.08)',
            border: '1px solid rgba(255,0,0,0.25)',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && status === 'requested' && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <div style={{ fontWeight: 700 }}>Request sent</div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            An admin will review your request. You can return to chat; your group will appear after approval.
          </div>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            Waiting for approval…
          </div>
          <div style={{ marginTop: 14 }}>
            <button type="button" className="gchat-send-btn" onClick={() => navigate('/chat', { replace: true })}>
              Go to Chat
            </button>
          </div>
        </div>
      )}

      {!loading && !error && status && status !== 'requested' && status !== 'already_member' && (
        <div style={{ opacity: 0.9 }}>{status === 'rejected' ? 'Request rejected by admin' : status}</div>
      )}
    </div>
  )
}

export default GroupJoinRequest

