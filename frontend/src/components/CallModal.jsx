import { useEffect, useMemo, useRef, useState } from 'react'
import { connectSocket } from '../lib/socket.js'

function formatWhen(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return ''
  }
}

function parseIceServers() {
  const raw = import.meta.env.VITE_WEBRTC_ICE_SERVERS
  if (!raw) {
    // Default to a public STUN server for local dev. Calls are disabled unless TURN is present.
    return [{ urls: 'stun:stun.l.google.com:19302' }]
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function hasTurnServer(iceServers) {
  // Relaxed requirement: allow calls on local network or via STUN.
  // In production, you would want this to strictly require TURN for reliable NAT traversal.
  return true
}

function toIceCandidateInit(candidate) {
  if (!candidate) return null
  // RTCIceCandidate has toJSON() in modern browsers.
  if (typeof candidate.toJSON === 'function') return candidate.toJSON()
  return candidate
}

function removeCallFocusQuery() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('focus') !== 'call') return
    params.delete('focus')
    params.delete('callId')
    const qs = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  } catch {
    // ignore
  }
}

export default function CallModal({ user, apiRequest, enqueueToast, activeChannel, dmOtherMember, initialCallId }) {
  const socketRef = useRef(null)
  const callIdRef = useRef(null)
  const otherUserIdRef = useRef(null)

  const iceServers = useMemo(() => parseIceServers(), [])
  const turnAvailable = useMemo(() => hasTurnServer(iceServers), [iceServers])

  const [modalOpen, setModalOpen] = useState(false)
  const [direction, setDirection] = useState(null) // 'incoming' | 'outgoing'
  const [callType, setCallType] = useState('audio') // 'audio' | 'video'
  const [callId, setCallId] = useState(null)
  const [otherUserId, setOtherUserId] = useState(null)
  const [status, setStatus] = useState('ringing') // ringing|connecting|in-call|missed|ended

  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const pcRef = useRef(null)
  const queuedSignalsRef = useRef([]) // { description? , candidate? }
  const candidateQueueRef = useRef([]) // ICE candidates before callId is known

  const [callLogs, setCallLogs] = useState([])

  const otherUserName = useMemo(() => {
    if (!dmOtherMember) return 'Unknown'
    return dmOtherMember.displayName || dmOtherMember.email || dmOtherMember.id
  }, [dmOtherMember])

  const canStartCall = Boolean(user?.id) && activeChannel?.type === 'dm' && dmOtherMember?.id && turnAvailable

  const cleanupPeer = () => {
    try {
      if (pcRef.current) pcRef.current.close()
    } catch {
      // ignore
    }
    pcRef.current = null
    queuedSignalsRef.current = []
    candidateQueueRef.current = []

    if (localStream) {
      for (const track of localStream.getTracks?.() || []) track.stop()
    }
    setLocalStream(null)
    setRemoteStream(null)
  }

  useEffect(() => {
    callIdRef.current = callId
  }, [callId])

  useEffect(() => {
    otherUserIdRef.current = otherUserId
  }, [otherUserId])

  useEffect(() => {
    if (!initialCallId) return
    if (callId) return
    if (!user?.id) return

    let cancelled = false
    const load = async () => {
      try {
        const res = await apiRequest(`/calls/${encodeURIComponent(initialCallId)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load call')
        if (cancelled) return

        const isCallee = String(data.calleeId) === String(user.id)
        const otherId = isCallee ? String(data.callerId) : String(data.calleeId)

        setDirection('incoming')
        setCallType(data.callType || 'audio')
        setCallId(String(data.id))
        setOtherUserId(otherId)
        setStatus(data.status || 'ringing')

        queuedSignalsRef.current = []
        if (data.offer) {
          queuedSignalsRef.current.push({ description: data.offer })
        }

        setModalOpen(true)
        removeCallFocusQuery()
      } catch (err) {
        enqueueToast?.('error', err?.message || 'Failed to open call')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCallId, user?.id])

  const markCallEnded = async (finalStatus) => {
    setStatus(finalStatus)
    cleanupPeer()
    setCallId(null)
    setOtherUserId(null)
    setDirection(null)
    setTimeout(() => setModalOpen(false), 800)
    // Refresh call logs after an end.
    try {
      const res = await apiRequest('/calls/logs?limit=10')
      const data = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(data.calls)) setCallLogs(data.calls)
    } catch {
      // ignore
    }
  }

  const createPeer = async () => {
    const pc = new RTCPeerConnection({ iceServers })
    pcRef.current = pc

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return
      const candInit = toIceCandidateInit(ev.candidate)
      if (!candInit) return

      if (!socketRef.current || !callIdRef.current || !otherUserIdRef.current) {
        candidateQueueRef.current.push(candInit)
        return
      }

      socketRef.current.emit('call:signal', {
        callId: String(callIdRef.current),
        toUserId: String(otherUserIdRef.current),
        signal: { candidate: candInit },
      })
    }

    pc.ontrack = (ev) => {
      if (!ev.streams || !ev.streams[0]) return
      setRemoteStream(ev.streams[0])
    }

    const mediaConstraints = {
      audio: true,
      video: callType === 'video',
    }

    const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints)
    setLocalStream(stream)
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream)
    }

    // Flush queued ICE candidates if we already have a callId.
    if (callIdRef.current && socketRef.current && otherUserIdRef.current) {
      for (const cand of candidateQueueRef.current.splice(0)) {
        socketRef.current.emit('call:signal', {
          callId: String(callIdRef.current),
          toUserId: String(otherUserIdRef.current),
          signal: { candidate: cand },
        })
      }
    }

    return pc
  }

  const applyQueuedSignals = async () => {
    const pc = pcRef.current
    if (!pc) return
    const queue = queuedSignalsRef.current
    queuedSignalsRef.current = []

    for (const sig of queue) {
      if (sig.description) {
        await pc.setRemoteDescription(sig.description)
      } else if (sig.candidate) {
        await pc.addIceCandidate(sig.candidate)
      }
    }
  }

  const ensureSocket = () => {
    if (socketRef.current) return socketRef.current
    socketRef.current = connectSocket()
    return socketRef.current
  }

  const startOutgoingCall = async () => {
    if (!dmOtherMember?.id) return
    if (!turnAvailable) {
      enqueueToast?.('error', 'Calls are disabled: TURN servers are not configured.')
      return
    }

    if (!activeChannel?._id) return
    if (!user?.id) return

    setModalOpen(true)
    setDirection('outgoing')
    setStatus('ringing')
    setCallId(null)
    setOtherUserId(String(dmOtherMember.id))

    const s = ensureSocket()

    try {
      const pc = await createPeer()
      // Status based on connection.
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState
        if (st === 'connecting') setStatus('connecting')
        if (st === 'connected') setStatus('in-call')
        if (st === 'failed' || st === 'disconnected') setStatus('ended')
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const localDesc = pc.localDescription

      socketRef.current.emit(
        'call:invite',
        {
          calleeId: String(dmOtherMember.id),
          callType,
          conversationId: String(activeChannel._id),
          offer: localDesc,
        },
        (res) => {
          if (!res || !res.ok || !res.callId) {
            enqueueToast?.('error', res?.error || 'Failed to start call')
            void markCallEnded('missed')
            return
          }
          setCallId(String(res.callId))
          setStatus('connecting')
          // Flush any candidates captured before callId existed.
          if (candidateQueueRef.current.length > 0) {
            for (const cand of candidateQueueRef.current.splice(0)) {
              socketRef.current.emit('call:signal', {
                callId: String(res.callId),
                toUserId: String(dmOtherMember.id),
                signal: { candidate: cand },
              })
            }
          }
        },
      )
    } catch (err) {
      cleanupPeer()
      enqueueToast?.('error', err?.message || 'Failed to start call')
      setStatus('missed')
      setModalOpen(false)
    }
  }

  const acceptIncoming = async () => {
    if (!turnAvailable) {
      enqueueToast?.('error', 'TURN servers are not configured; cannot accept calls.')
      return
    }

    try {
      setStatus('connecting')
      setModalOpen(true)
      const pc = await createPeer()
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState
        if (st === 'connecting') setStatus('connecting')
        if (st === 'connected') setStatus('in-call')
        if (st === 'failed' || st === 'disconnected') setStatus('ended')
      }

      // Apply pending offer/queued signals.
      await applyQueuedSignals()

      // Create + send answer to the caller.
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      if (socketRef.current && callIdRef.current && otherUserIdRef.current) {
        socketRef.current.emit('call:signal', {
          callId: String(callIdRef.current),
          toUserId: String(otherUserIdRef.current),
          signal: { description: pc.localDescription },
        })
      }
    } catch (err) {
      enqueueToast?.('error', err?.message || 'Failed to accept call')
      void rejectIncoming('missed')
    }
  }

  const rejectIncoming = async (finalStatus = 'missed') => {
    if (socketRef.current && callId && otherUserId) {
      socketRef.current.emit('call:end', { callId, status: finalStatus, endedReason: 'rejected' })
    }
    await markCallEnded(finalStatus)
  }

  useEffect(() => {
    if (!user?.id) return

    const s = ensureSocket()

    const handleInvite = async (payload) => {
      if (!payload) return
      if (payload.calleeId && String(payload.calleeId) !== String(user.id)) return

      // Prevent clobbering an ongoing outgoing call.
      if (callId) return

      cleanupPeer()
      setModalOpen(true)
      setDirection('incoming')
      setCallType(payload.callType || 'audio')
      setCallId(String(payload.callId))
      setOtherUserId(String(payload.callerId))
      setStatus('ringing')

      // Store offer (if present). If no offer, we still accept via later call:signal events.
      queuedSignalsRef.current = []
      if (payload.offer) {
        // Defer setRemoteDescription until user accepts.
        queuedSignalsRef.current.push({ description: payload.offer })
      }

      // Refresh logs for context.
      try {
        const res = await apiRequest('/calls/logs?limit=10')
        const data = await res.json().catch(() => ({}))
        if (res.ok && Array.isArray(data.calls)) setCallLogs(data.calls)
      } catch {
        // ignore
      }
    }

    const handleSignal = async (payload) => {
      if (!payload || !payload.callId) return
      if (!callId || String(payload.callId) !== String(callId)) {
        // Queue signals if they arrive before callId state updates.
        if (modalOpen) {
          if (String(payload.callId) !== String(callId)) return
        }
      }

      if (!payload.signal) return
      const sig = payload.signal || {}

      // If peer connection not created yet (incoming before accept), queue.
      if (!pcRef.current) {
        if (sig.description) queuedSignalsRef.current.push({ description: sig.description })
        if (sig.candidate) queuedSignalsRef.current.push({ candidate: sig.candidate })
        return
      }

      if (sig.description) {
        await pcRef.current.setRemoteDescription(sig.description)
      } else if (sig.candidate) {
        await pcRef.current.addIceCandidate(sig.candidate)
      }
    }

    const handleEnded = async (payload) => {
      if (!payload || !payload.callId) return
      if (!callId || String(payload.callId) !== String(callId)) return

      const endedStatus = payload.status === 'missed' ? 'missed' : 'ended'
      await markCallEnded(endedStatus)
    }

    s.on('call:invite', handleInvite)
    s.on('call:signal', handleSignal)
    s.on('call:ended', handleEnded)

    return () => {
      s.off('call:invite', handleInvite)
      s.off('call:signal', handleSignal)
      s.off('call:ended', handleEnded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, callId, modalOpen])

  // On user-driven end, call:end should be emitted.
  const endCall = async (finalStatus = 'ended') => {
    if (socketRef.current && callId && otherUserId) {
      socketRef.current.emit('call:end', { callId, status: finalStatus, endedReason: 'hangup' })
    }
    await markCallEnded(finalStatus)
  }

  const iconPhone = useMemo(
    () => (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M6.62 10.79a15.053 15.053 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1C10.07 21.8 2.2 13.93 2.2 4.5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.24 1.01l-2.2 2.2Z"
        />
      </svg>
    ),
    [],
  )

  const iconVideo = useMemo(
    () => (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M17 10.5V6c0-1.1-.9-2-2-2H5C3.9 4 3 4.9 3 6v12c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-4.5l4 2v-9l-4 2ZM8 14V10l4 2-4 2Z"
        />
      </svg>
    ),
    [],
  )

  if (!activeChannel || activeChannel.type !== 'dm') return null

  return (
    <>
      <button
        type="button"
        className="gchat-icon-btn"
        title="Start voice call"
        aria-label="Call"
        onClick={() => {
          setCallType('audio')
          void startOutgoingCall()
        }}
        disabled={!canStartCall}
      >
        {iconPhone}
      </button>

      <button
        type="button"
        className="gchat-icon-btn"
        title="Start video call"
        aria-label="Video call"
        onClick={() => {
          setCallType('video')
          void startOutgoingCall()
        }}
        disabled={!canStartCall}
      >
        {iconVideo}
      </button>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Call modal"
          onClick={() => {
            // clicking overlay should only dismiss for incoming ring.
            if (direction === 'incoming' && status === 'ringing') void rejectIncoming('missed')
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(920px, 96vw)',
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(18,18,18,0.95)',
              boxShadow: '0 30px 90px rgba(0,0,0,0.6)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div style={{ fontWeight: 900 }}>
                {direction === 'incoming' ? 'Incoming call' : 'Calling'}
                {otherUserId ? ` · ${otherUserName}` : ''}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{status}</div>
            </div>

            <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div
                style={{
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 16,
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,0.02)',
                  position: 'relative',
                  minHeight: 220,
                }}
              >
                {remoteStream ? (
                  <video
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el && remoteStream) el.srcObject = remoteStream
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ padding: 16, opacity: 0.85 }}>
                    {callType === 'video' ? 'Waiting for remote video…' : 'Waiting for remote audio…'}
                  </div>
                )}
              </div>

              <div
                style={{
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 16,
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,0.02)',
                  position: 'relative',
                  minHeight: 220,
                }}
              >
                {localStream && callType === 'video' ? (
                  <video
                    autoPlay
                    playsInline
                    muted
                    ref={(el) => {
                      if (el && localStream) el.srcObject = localStream
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ padding: 16, opacity: 0.85 }}>
                    {callType === 'video' ? 'Local preview…' : 'Local mic enabled'}
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '0 14px 14px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 260 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Call type</div>
                <div style={{ fontWeight: 800 }}>{callType === 'video' ? 'Video' : 'Audio'}</div>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {direction === 'incoming' && status === 'ringing' && (
                  <>
                    <button
                      type="button"
                      className="gchat-info-admin-btn"
                      onClick={() => void acceptIncoming()}
                      disabled={!turnAvailable}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="gchat-info-admin-btn gchat-info-admin-btn--danger"
                      onClick={() => void rejectIncoming('missed')}
                    >
                      Decline
                    </button>
                  </>
                )}

                {direction === 'outgoing' && status === 'ringing' && (
                  <button
                    type="button"
                    className="gchat-info-admin-btn gchat-info-admin-btn--danger"
                    onClick={() => void endCall('missed')}
                  >
                    Cancel
                  </button>
                )}

                {status !== 'ringing' && (
                  <button
                    type="button"
                    className="gchat-info-admin-btn gchat-info-admin-btn--danger"
                    onClick={() => void endCall('ended')}
                  >
                    End call
                  </button>
                )}
              </div>

              <div style={{ flex: 1 }} />
            </div>

            {Array.isArray(callLogs) && callLogs.length > 0 && (
              <div style={{ padding: '0 14px 16px' }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Recent calls</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {callLogs.slice(0, 5).map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.10)',
                        background: 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ fontWeight: 800 }}>
                          {c.callType === 'video' ? 'Video' : 'Audio'} · {c.status}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.65 }}>{formatWhen(c.createdAt)}</div>
                      </div>
                      <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>
                        Caller: {c.callerId} · Callee: {c.calleeId}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

