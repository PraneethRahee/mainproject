import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'

/**
 * Phase 3: Group + Admin Power settings UI.
 *
 * This panel is intentionally lightweight and uses the parent's state setters
 * (invite token, join requests, audit logs) to avoid duplicating network state.
 */
function GroupSettingsPanel({
  activeChannel,
  chatInfo,
  user,
  apiRequest,
  enqueueToast,

  composerGroupMetadata,
  refreshChatInfo,

  groupSettingsSaving,
  setGroupSettingsSaving,

  groupInviteLoading,
  groupInviteError,
  groupInvite,
  groupInviteQrDataUrl,
  setGroupInviteLoading,
  setGroupInviteError,
  setGroupInvite,
  setGroupInviteQrDataUrl,

  joinRequestsLoading,
  joinRequestsError,
  joinRequests,
  setJoinRequestsLoading,
  setJoinRequestsError,
  setJoinRequests,

  auditLogsLoading,
  auditLogsError,
  auditLogs,
  setAuditLogsLoading,
  setAuditLogsError,
  setAuditLogs,
}) {
  const groupId = activeChannel?._id ? String(activeChannel._id) : null

  const members = Array.isArray(chatInfo?.members) ? chatInfo.members : []
  const currentMember = useMemo(() => {
    if (!user?.id) return null
    return members.find((m) => String(m.id) === String(user.id)) || null
  }, [members, user?.id])

  const whoCanAddMembers = chatInfo?.channel?.metadata?.whoCanAddMembers || 'adminsOnly'
  const whoCanEditInfo = chatInfo?.channel?.metadata?.whoCanEditInfo || 'adminsOnly'
  const joinPolicy = chatInfo?.channel?.metadata?.joinPolicy || 'open'
  const disappearingMessagesSecondsCurrent = Number(chatInfo?.channel?.metadata?.disappearingMessagesSeconds) || 0

  const [disappearingDraftSeconds, setDisappearingDraftSeconds] = useState(disappearingMessagesSecondsCurrent)

  const effectiveCanEditSettings =
    whoCanEditInfo === 'everyone' ? Boolean(currentMember) : Boolean(currentMember?.isAdmin)
  const effectiveCanManageMembers =
    whoCanAddMembers === 'everyone' ? Boolean(currentMember) : Boolean(currentMember?.isAdmin)

  const isAnnouncementOnly = composerGroupMetadata?.whoCanSend === 'adminsOnly' || chatInfo?.channel?.metadata?.whoCanSend === 'adminsOnly'
  const isApprovalRequired = joinPolicy === 'approval'

  useEffect(() => {
    setDisappearingDraftSeconds(disappearingMessagesSecondsCurrent)
  }, [disappearingMessagesSecondsCurrent])

  const joinRequestUrl = useMemo(() => {
    if (!groupId) return null
    return `${window.location.origin}/group/join-request/${groupId}`
  }, [groupId])

  const inviteUrl = useMemo(() => {
    if (!groupInvite?.invitePath) return null
    return `${window.location.origin}${groupInvite.invitePath}`
  }, [groupInvite?.invitePath])

  const [joinRequestQrDataUrl, setJoinRequestQrDataUrl] = useState('')

  // Keep QR in sync with invite URL.
  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!inviteUrl) {
        setGroupInviteQrDataUrl('')
        return
      }
      try {
        const dataUrl = await QRCode.toDataURL(inviteUrl, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 220,
        })
        if (!cancelled) setGroupInviteQrDataUrl(dataUrl)
      } catch {
        if (!cancelled) setGroupInviteQrDataUrl('')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [inviteUrl, setGroupInviteQrDataUrl])

  // Keep QR in sync with join-request URL.
  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!isApprovalRequired || !joinRequestUrl || !effectiveCanEditSettings) {
        setJoinRequestQrDataUrl('')
        return
      }
      try {
        const dataUrl = await QRCode.toDataURL(joinRequestUrl, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 220,
        })
        if (!cancelled) setJoinRequestQrDataUrl(dataUrl)
      } catch {
        if (!cancelled) setJoinRequestQrDataUrl('')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [joinRequestUrl, isApprovalRequired, effectiveCanEditSettings])

  // Load join requests once when we have permission.
  useEffect(() => {
    if (!groupId) return
    if (!effectiveCanManageMembers) return

    let cancelled = false
    async function load() {
      setJoinRequestsLoading(true)
      setJoinRequestsError('')
      try {
        const res = await apiRequest(`/group/${groupId}/join-requests`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load join requests')
        if (cancelled) return
        setJoinRequests(Array.isArray(data.items) ? data.items : [])
      } catch (err) {
        if (cancelled) return
        setJoinRequestsError(err?.message || 'Failed to load join requests')
      } finally {
        if (!cancelled) setJoinRequestsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, effectiveCanManageMembers])

  // Load audit logs once when we have permission.
  useEffect(() => {
    if (!groupId) return
    if (!effectiveCanEditSettings) return

    let cancelled = false
    async function load() {
      setAuditLogsLoading(true)
      setAuditLogsError('')
      try {
        const res = await apiRequest(`/group/${groupId}/audit-logs?limit=20`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load audit logs')
        if (cancelled) return
        setAuditLogs(Array.isArray(data.items) ? data.items : [])
      } catch (err) {
        if (cancelled) return
        setAuditLogsError(err?.message || 'Failed to load audit logs')
      } finally {
        if (!cancelled) setAuditLogsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, effectiveCanEditSettings])

  const [requestActionLoadingFor, setRequestActionLoadingFor] = useState(null)

  const handleCopyInviteLink = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      enqueueToast('success', 'Invite link copied')
    } catch {
      enqueueToast('error', 'Failed to copy invite link')
    }
  }

  const handleGenerateInvite = async () => {
    if (!groupId) return
    setGroupInviteLoading(true)
    setGroupInviteError('')
    try {
      const res = await apiRequest(`/group/${groupId}/invite-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to create invite link')

      setGroupInvite({
        token: data.token || '',
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        invitePath: data.invitePath || `/group/join/${data.token || ''}`,
      })
      enqueueToast('success', 'Invite link generated')
    } catch (err) {
      setGroupInviteError(err?.message || 'Failed to create invite link')
      enqueueToast('error', err?.message || 'Failed to create invite link')
    } finally {
      setGroupInviteLoading(false)
    }
  }

  const handleRevokeInvite = async () => {
    if (!groupId) return
    setGroupInviteLoading(true)
    setGroupInviteError('')
    try {
      const res = await apiRequest(`/group/${groupId}/invite-link`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to revoke invite link')

      setGroupInvite(null)
      setGroupInviteQrDataUrl('')
      enqueueToast('success', 'Invite link revoked')
    } catch (err) {
      setGroupInviteError(err?.message || 'Failed to revoke invite link')
      enqueueToast('error', err?.message || 'Failed to revoke invite link')
    } finally {
      setGroupInviteLoading(false)
    }
  }

  const fetchJoinRequests = async () => {
    setJoinRequestsLoading(true)
    setJoinRequestsError('')
    try {
      const res = await apiRequest(`/group/${groupId}/join-requests`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load join requests')
      setJoinRequests(Array.isArray(data.items) ? data.items : [])
    } catch (err) {
      setJoinRequestsError(err?.message || 'Failed to load join requests')
    } finally {
      setJoinRequestsLoading(false)
    }
  }

  const handleApprove = async (requestId) => {
    if (!groupId) return
    setRequestActionLoadingFor(requestId)
    try {
      const res = await apiRequest(`/group/${groupId}/join-requests/${requestId}/approve`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to approve join request')
      enqueueToast('success', 'Join request approved')
      await fetchJoinRequests()
      await refreshChatInfo()
    } catch (err) {
      enqueueToast('error', err?.message || 'Failed to approve join request')
    } finally {
      setRequestActionLoadingFor(null)
    }
  }

  const handleReject = async (requestId) => {
    if (!groupId) return
    setRequestActionLoadingFor(requestId)
    try {
      const res = await apiRequest(`/group/${groupId}/join-requests/${requestId}/reject`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to reject join request')
      enqueueToast('success', 'Join request rejected')
      await fetchJoinRequests()
      await refreshChatInfo()
    } catch (err) {
      enqueueToast('error', err?.message || 'Failed to reject join request')
    } finally {
      setRequestActionLoadingFor(null)
    }
  }

  const handleToggleAnnouncementOnly = async () => {
    if (!groupId) return
    if (!effectiveCanEditSettings) return

    setGroupSettingsSaving(true)
    try {
      const nextWhoCanSend = !isAnnouncementOnly ? 'adminsOnly' : 'everyone'
      const res = await apiRequest(`/group/${groupId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whoCanSend: nextWhoCanSend }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update group settings')

      enqueueToast('success', 'Group posting policy updated')
      await refreshChatInfo()
    } catch (err) {
      enqueueToast('error', err?.message || 'Failed to update group settings')
    } finally {
      setGroupSettingsSaving(false)
    }
  }

  const handleToggleJoinPolicy = async () => {
    if (!groupId) return
    if (!effectiveCanEditSettings) return

    setGroupSettingsSaving(true)
    try {
      const nextJoinPolicy = !isApprovalRequired ? 'approval' : 'open'
      const res = await apiRequest(`/group/${groupId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinPolicy: nextJoinPolicy }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update group join policy')

      enqueueToast('success', 'Group join policy updated')
      await refreshChatInfo()
    } catch (err) {
      enqueueToast('error', err?.message || 'Failed to update group join policy')
    } finally {
      setGroupSettingsSaving(false)
    }
  }

  const handleUpdateDisappearingMessagesSeconds = async () => {
    if (!groupId) return
    if (!effectiveCanEditSettings) return

    const next = Number(disappearingDraftSeconds)
    if (!Number.isFinite(next) || next < 0) {
      enqueueToast('error', 'disappearingMessagesSeconds must be >= 0')
      return
    }

    setGroupSettingsSaving(true)
    try {
      const res = await apiRequest(`/group/${groupId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disappearingMessagesSeconds: Math.floor(next) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update disappearing messages')

      enqueueToast('success', 'Disappearing message timer updated')
      await refreshChatInfo()
    } catch (err) {
      enqueueToast('error', err?.message || 'Failed to update disappearing messages')
    } finally {
      setGroupSettingsSaving(false)
    }
  }

  return (
    <div className="gchat-info-body">
      <div className="gchat-info-section-title">Group Controls</div>

      <div style={{ marginTop: 12 }}>
        <div className="gchat-info-sub" style={{ marginBottom: 8 }}>
          Announcement-only: only admins can post
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: effectiveCanEditSettings ? 'pointer' : 'not-allowed' }}>
          <input
            type="checkbox"
            checked={Boolean(isAnnouncementOnly)}
            disabled={!effectiveCanEditSettings || groupSettingsSaving}
            onChange={() => void handleToggleAnnouncementOnly()}
          />
          <span style={{ opacity: effectiveCanEditSettings ? 1 : 0.6 }}>
            {effectiveCanEditSettings ? 'Editable' : 'Read-only'}
          </span>
        </label>
        {groupSettingsSaving && <div className="gchat-info-state">Saving…</div>}
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="gchat-info-sub" style={{ marginBottom: 8 }}>
          Private: require admin approval to join
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: effectiveCanEditSettings ? 'pointer' : 'not-allowed' }}>
          <input
            type="checkbox"
            checked={Boolean(isApprovalRequired)}
            disabled={!effectiveCanEditSettings || groupSettingsSaving}
            onChange={() => void handleToggleJoinPolicy()}
          />
          <span style={{ opacity: effectiveCanEditSettings ? 1 : 0.6 }}>
            {effectiveCanEditSettings ? 'Editable' : 'Read-only'}
          </span>
        </label>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="gchat-info-section-title">Disappearing Messages</div>
        <div className="gchat-info-sub" style={{ marginTop: 8, marginBottom: 8, opacity: 0.85 }}>
          Per-chat expiry for new messages. Set to <strong>0</strong> to disable.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="gchat-info-sub" style={{ display: 'block', opacity: 0.85, marginBottom: 6 }}>
              Timer (seconds)
            </label>
            <input
              type="number"
              min={0}
              max={30 * 24 * 60 * 60}
              step={10}
              value={Number.isFinite(Number(disappearingDraftSeconds)) ? disappearingDraftSeconds : 0}
              disabled={!effectiveCanEditSettings || groupSettingsSaving}
              onChange={(e) => setDisappearingDraftSeconds(parseInt(e.target.value || '0', 10))}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.03)',
                color: '#fff',
              }}
            />
          </div>
          <button
            type="button"
            className="gchat-info-admin-btn"
            disabled={!effectiveCanEditSettings || groupSettingsSaving}
            onClick={() => void handleUpdateDisappearingMessagesSeconds()}
            style={{ height: 40 }}
          >
            Update
          </button>
        </div>
        {groupSettingsSaving && <div className="gchat-info-state">Saving…</div>}
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="gchat-info-section-title">Join Request</div>
        {!isApprovalRequired ? (
          <div className="gchat-info-state" style={{ marginTop: 10 }}>
            Enable Private approval mode to generate a join-request link.
          </div>
        ) : !effectiveCanEditSettings ? (
          <div className="gchat-info-state" style={{ marginTop: 10 }}>
            Read-only.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 320 }}>
                <div className="gchat-info-sub" style={{ marginBottom: 6, opacity: 0.85 }}>
                  Share this link for non-members to request joining:
                </div>
                <div
                  style={{
                    padding: 10,
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)',
                    wordBreak: 'break-word',
                  }}
                >
                  {joinRequestUrl}
                </div>
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="gchat-info-admin-btn"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(joinRequestUrl || '')
                        enqueueToast('success', 'Join request link copied')
                      } catch {
                        enqueueToast('error', 'Failed to copy join request link')
                      }
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div style={{ width: 230 }}>
                {joinRequestQrDataUrl ? (
                  <>
                    <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>QR</div>
                    <img src={joinRequestQrDataUrl} alt="Join request QR code" style={{ width: 220, height: 220 }} />
                  </>
                ) : (
                  <div className="gchat-info-state">Generating QR…</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="gchat-info-section-title">Invite Link</div>
        {!effectiveCanManageMembers ? (
          <div className="gchat-info-state" style={{ marginTop: 10 }}>
            Only authorized admins can manage invites.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="gchat-info-admin-btn"
                disabled={groupInviteLoading}
                onClick={() => void handleGenerateInvite()}
              >
                {groupInviteLoading ? 'Working…' : groupInvite ? 'Regenerate' : 'Generate'} link
              </button>
              {groupInvite && (
                <button
                  type="button"
                  className="gchat-info-admin-btn gchat-info-admin-btn--danger"
                  disabled={groupInviteLoading}
                  onClick={() => void handleRevokeInvite()}
                >
                  Revoke
                </button>
              )}
            </div>
            {groupInviteError && <div className="gchat-info-state gchat-info-state--error" style={{ marginTop: 10 }}>{groupInviteError}</div>}
            {groupInvite && (
              <>
                <div className="gchat-info-sub" style={{ marginTop: 12 }}>
                  Expires: {groupInvite.expiresAt ? groupInvite.expiresAt.toLocaleString() : '—'}
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Link</div>
                    <div
                      style={{
                        padding: 10,
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.03)',
                        wordBreak: 'break-word',
                      }}
                    >
                      {inviteUrl}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button type="button" className="gchat-info-admin-btn" onClick={() => void handleCopyInviteLink()}>
                        Copy
                      </button>
                    </div>
                  </div>
                  <div style={{ width: 230 }}>
                    {groupInviteQrDataUrl ? (
                      <>
                        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>QR</div>
                        <img src={groupInviteQrDataUrl} alt="Invite link QR code" style={{ width: 220, height: 220 }} />
                      </>
                    ) : (
                      <div className="gchat-info-state">Generating QR…</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="gchat-info-section-title">Join Requests</div>
        {!effectiveCanManageMembers ? (
          <div className="gchat-info-state" style={{ marginTop: 10 }}>Only authorized admins can review requests.</div>
        ) : (
          <>
            {joinRequestsLoading && <div className="gchat-info-state">Loading…</div>}
            {joinRequestsError && <div className="gchat-info-state gchat-info-state--error">{joinRequestsError}</div>}
            {!joinRequestsLoading && joinRequests.length === 0 && !joinRequestsError && (
              <div className="gchat-info-state">No pending requests.</div>
            )}
            {joinRequests.map((r) => (
              <div
                key={r.requestId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'center',
                  padding: 10,
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                  marginTop: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{r.displayName || 'Unknown user'}</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>{r.email || r.userId}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                    Requested: {r.requestedAt ? new Date(r.requestedAt).toLocaleString() : '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="gchat-info-admin-btn"
                    disabled={requestActionLoadingFor === r.requestId}
                    onClick={() => void handleApprove(r.requestId)}
                  >
                    {requestActionLoadingFor === r.requestId ? 'Approving…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    className="gchat-info-admin-btn gchat-info-admin-btn--danger"
                    disabled={requestActionLoadingFor === r.requestId}
                    onClick={() => void handleReject(r.requestId)}
                  >
                    {requestActionLoadingFor === r.requestId ? 'Rejecting…' : 'Reject'}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="gchat-info-section-title">Audit Trail</div>
        {!effectiveCanEditSettings ? (
          <div className="gchat-info-state" style={{ marginTop: 10 }}>Only authorized admins can view audit logs.</div>
        ) : (
          <>
            {auditLogsLoading && <div className="gchat-info-state">Loading…</div>}
            {auditLogsError && <div className="gchat-info-state gchat-info-state--error">{auditLogsError}</div>}
            {!auditLogsLoading && auditLogs.length === 0 && !auditLogsError && (
              <div className="gchat-info-state">No audit events yet.</div>
            )}
            {!auditLogsLoading &&
              auditLogs.slice(0, 10).map((l) => (
                <div
                  key={l.id}
                  style={{
                    marginTop: 10,
                    padding: 10,
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{l.action}</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    Actor: {l.actorName || 'Unknown'} · Result: {l.result}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                    {l.createdAt ? new Date(l.createdAt).toLocaleString() : '—'}
                  </div>
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  )
}

export default GroupSettingsPanel

