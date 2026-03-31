import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../lib/session.js'

function GroupInviteJoin() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!token) {
        setError('Missing invite token')
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')

      try {
        const res = await apiRequest('/group/join-by-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to join')
        if (cancelled) return

        setStatus(data.status || 'joined')
        if (data.status === 'joined' || data.status === 'already_member') {
          navigate('/chat', { replace: true })
        }
      } catch (err) {
        if (cancelled) return
        setError(err?.message || 'Failed to join via invite link')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [token, navigate])

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 12 }}>Joining group…</h2>
      {loading && <div>Working…</div>}
      {!loading && error && (
        <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.25)' }}>
          {error}
        </div>
      )}
      {!loading && !error && status === 'requested' && (
        <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ fontWeight: 700 }}>Request sent</div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            This group requires admin approval. An admin will review your request.
          </div>
          <div style={{ marginTop: 14 }}>
            <button type="button" className="gchat-send-btn" onClick={() => navigate('/chat', { replace: true })}>
              Go to Chat
            </button>
          </div>
        </div>
      )}
      {!loading && !error && status !== 'requested' && status !== null && (
        <div style={{ opacity: 0.9 }}>{status}</div>
      )}
    </div>
  )
}

export default GroupInviteJoin

