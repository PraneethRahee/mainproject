import GroupSettingsPanel from '../../components/GroupSettingsPanel.jsx'
import DMDisappearingMessagesPanel from '../../components/DMDisappearingMessagesPanel.jsx'
import { ChatNotificationPrefsPanel } from './ChatNotificationPrefsPanel.jsx'

export function ChatInfoPanel({
  open,
  onClose,
  activeChannel,
  chatInfoLoading,
  chatInfoError,
  chatInfo,
  dmOtherMember,
  creatorUser,
  initialsFromString,
  chatInfoTab,
  setChatInfoTab,
  mediaError,
  isE2EChat,
  mediaSections,
  mediaCursors,
  mediaLoading,
  mediaSectionLoading,
  loadMediaSection,
  renderMediaThumb,
  user,
  groupInviteLoading,
  groupInviteError,
  groupInvite,
  groupInviteQrDataUrl,
  joinRequestsLoading,
  joinRequestsError,
  joinRequests,
  auditLogsLoading,
  auditLogsError,
  auditLogs,
  composerGroupMetadata,
  canManageAdmins,
  setGroupInviteLoading,
  setGroupInviteError,
  setGroupInvite,
  setGroupInviteQrDataUrl,
  setJoinRequestsLoading,
  setJoinRequestsError,
  setJoinRequests,
  setAuditLogsLoading,
  setAuditLogsError,
  setAuditLogs,
  groupSettingsSaving,
  setGroupSettingsSaving,
  refreshChatInfo,
  apiRequest,
  enqueueToast,
  chatLockLoading,
  chatLocked,
  chatUnlocked,
  chatLockSettingsPinDraft,
  setChatLockSettingsPinDraft,
  chatLockActionLoading,
  handleChatEnableLock,
  handleChatClearLock,
  chatLockError,
  dmPresenceText,
  blockedUserIds,
  abuseActionLoadingFor,
  setAbuseModalBlockState,
  setAbuseModalReportState,
  e2eVerificationLoading,
  e2eVerificationError,
  e2eVerificationState,
  handleMarkE2eVerified,
  infoAdmins,
  chatInfoMemberQuery,
  setChatInfoMemberQuery,
  filteredInfoMembers,
  setSelectedMemberInfo,
  handlePromoteDemoteAdmin,
  adminActionLoadingFor,
  setRemoveConfirmMember,
  adminActionError,
}) {
  if (!open || !activeChannel) return null

  return (
    <div className="gchat-info-overlay" onClick={onClose}>
      <aside
        className="gchat-info-panel"
        onClick={(e) => e.stopPropagation()}
        aria-label="Chat info"
      >
        <div className="gchat-info-header">
          <div className="gchat-info-header-left">
            <button
              type="button"
              className="gchat-info-back-btn"
              aria-label="Close info"
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                />
              </svg>
            </button>
            <h3>{activeChannel.type === 'dm' ? 'Contact info' : 'Group info'}</h3>
          </div>
        </div>
        {chatInfoLoading && <div className="gchat-info-state">Loading info…</div>}
        {!chatInfoLoading && chatInfoError && (
          <div className="gchat-info-state gchat-info-state--error">{chatInfoError}</div>
        )}
        {!chatInfoLoading && !chatInfoError && chatInfo && (
          <div className="gchat-info-body">
            <div className="gchat-info-avatar">
              {((activeChannel.type === 'dm'
                ? dmOtherMember?.avatarUrl
                : creatorUser?.avatarUrl) && (
                <img
                  src={activeChannel.type === 'dm' ? dmOtherMember?.avatarUrl : creatorUser?.avatarUrl}
                  alt={
                    activeChannel.type === 'dm'
                      ? dmOtherMember?.displayName || activeChannel.name
                      : chatInfo.channel?.name || activeChannel.name
                  }
                  className="gchat-info-avatar-img"
                />
              )) ||
                initialsFromString(
                  activeChannel.type === 'dm'
                    ? dmOtherMember?.displayName || activeChannel.name
                    : chatInfo.channel?.name || activeChannel.name,
                )}
            </div>
            <div className="gchat-info-name">
              {activeChannel.type === 'dm'
                ? dmOtherMember?.displayName || activeChannel.name
                : chatInfo.channel?.name || activeChannel.name}
            </div>
            <div className="gchat-info-tabs" role="tablist" aria-label="Chat info tabs">
              <button
                type="button"
                role="tab"
                className={`gchat-info-tab${chatInfoTab === 'overview' ? ' gchat-info-tab--active' : ''}`}
                onClick={() => setChatInfoTab('overview')}
                aria-selected={chatInfoTab === 'overview'}
              >
                Overview
              </button>
              <button
                type="button"
                role="tab"
                className={`gchat-info-tab${chatInfoTab === 'media' ? ' gchat-info-tab--active' : ''}`}
                onClick={() => setChatInfoTab('media')}
                aria-selected={chatInfoTab === 'media'}
              >
                Media
              </button>
              {activeChannel.type === 'group' && (
                <button
                  type="button"
                  role="tab"
                  className={`gchat-info-tab${chatInfoTab === 'settings' ? ' gchat-info-tab--active' : ''}`}
                  onClick={() => setChatInfoTab('settings')}
                  aria-selected={chatInfoTab === 'settings'}
                >
                  Settings
                </button>
              )}
            </div>

            {chatInfoTab === 'media' ? (
              <div className="gchat-info-media">
                {mediaError && (
                  <div className="gchat-info-state gchat-info-state--error" role="alert">
                    {mediaError}
                  </div>
                )}
                {(['images', 'videos', 'documents', ...(isE2EChat ? [] : ['links']), 'audio']).map((s) => {
                  const titleFixed =
                    s === 'images'
                      ? 'Images'
                      : s === 'videos'
                        ? 'Videos'
                        : s === 'documents'
                          ? 'Documents'
                          : s === 'audio'
                            ? 'Audio'
                            : 'Links'
                  const items = Array.isArray(mediaSections[s]) ? mediaSections[s] : []
                  const next = mediaCursors[s]
                  const loadingThis = Boolean(mediaLoading || mediaSectionLoading[s])
                  return (
                    <div key={s} className="gchat-info-media-section">
                      <div className="gchat-info-section-title">{titleFixed}</div>
                      {items.length === 0 && !mediaLoading && (
                        <div className="gchat-info-state">No items yet.</div>
                      )}
                      <div
                        className="gchat-info-media-grid"
                        style={{
                          display: 'grid',
                          gap: 10,
                          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                        }}
                      >
                        {items.map((it) => {
                          const isAudio = it.kind === 'audio'
                          const tileStyle = {
                            textAlign: 'left',
                            padding: 0,
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                          }

                          const onTileClick = () => {
                            if (it.messageId) {
                              const target = document.querySelector(`[data-message-id="${it.messageId}"]`)
                              if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            }
                            if (it.kind === 'link' && it.url)
                              window.open(it.url, '_blank', 'noopener,noreferrer')
                          }

                          const label = it.fileName
                            ? it.fileName
                            : it.kind === 'link'
                              ? String(it.url || '').slice(0, 42)
                              : it.kind

                          if (isAudio) {
                            return (
                              <div
                                key={it.id}
                                role="button"
                                tabIndex={0}
                                className="gchat-info-media-item"
                                style={tileStyle}
                                onClick={onTileClick}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    onTileClick()
                                  }
                                }}
                              >
                                {renderMediaThumb(it)}
                                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>{label}</div>
                              </div>
                            )
                          }

                          return (
                            <button
                              key={it.id}
                              type="button"
                              className="gchat-info-media-item"
                              style={tileStyle}
                              onClick={onTileClick}
                            >
                              {renderMediaThumb(it)}
                              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>{label}</div>
                            </button>
                          )
                        })}
                      </div>
                      {next && (
                        <div style={{ marginTop: 10 }}>
                          <button
                            type="button"
                            className="gchat-send-btn"
                            disabled={loadingThis}
                            onClick={() => void loadMediaSection(s, { append: true })}
                            style={{ width: '100%' }}
                          >
                            {loadingThis ? 'Loading…' : 'Load more'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : chatInfoTab === 'settings' ? (
              <>
                {activeChannel.type === 'group' ? (
                  <>
                    <GroupSettingsPanel
                      activeChannel={activeChannel}
                      chatInfo={chatInfo}
                      user={user}
                      groupInviteLoading={groupInviteLoading}
                      groupInviteError={groupInviteError}
                      groupInvite={groupInvite}
                      groupInviteQrDataUrl={groupInviteQrDataUrl}
                      joinRequestsLoading={joinRequestsLoading}
                      joinRequestsError={joinRequestsError}
                      joinRequests={joinRequests}
                      auditLogsLoading={auditLogsLoading}
                      auditLogsError={auditLogsError}
                      auditLogs={auditLogs}
                      composerGroupMetadata={composerGroupMetadata}
                      canManageAdmins={canManageAdmins}
                      setGroupInviteLoading={setGroupInviteLoading}
                      setGroupInviteError={setGroupInviteError}
                      setGroupInvite={setGroupInvite}
                      setGroupInviteQrDataUrl={setGroupInviteQrDataUrl}
                      setJoinRequestsLoading={setJoinRequestsLoading}
                      setJoinRequestsError={setJoinRequestsError}
                      setJoinRequests={setJoinRequests}
                      setAuditLogsLoading={setAuditLogsLoading}
                      setAuditLogsError={setAuditLogsError}
                      setAuditLogs={setAuditLogs}
                      groupSettingsSaving={groupSettingsSaving}
                      setGroupSettingsSaving={setGroupSettingsSaving}
                      refreshChatInfo={refreshChatInfo}
                      apiRequest={apiRequest}
                      enqueueToast={enqueueToast}
                    />
                  </>
                ) : activeChannel.type === 'dm' ? (
                  <DMDisappearingMessagesPanel
                    activeChannel={activeChannel}
                    chatInfo={chatInfo}
                    apiRequest={apiRequest}
                    enqueueToast={enqueueToast}
                    refreshChatInfo={refreshChatInfo}
                  />
                ) : null}
                <div style={{ marginTop: 18 }}>
                  <div className="gchat-info-section-title">Chat Lock</div>
                  <div className="gchat-info-sub" style={{ marginTop: 8, opacity: 0.85, marginBottom: 10 }}>
                    {chatLockLoading ? 'Loading…' : chatLocked ? 'Locked' : 'Unlocked'} · Unlock is temporary.
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <label className="gchat-info-sub" style={{ display: 'block', opacity: 0.85, marginBottom: 6 }}>
                        Set PIN (4-8 digits)
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        value={chatLockSettingsPinDraft}
                        disabled={chatLockActionLoading || !chatUnlocked}
                        onChange={(e) => setChatLockSettingsPinDraft(e.target.value)}
                        placeholder="e.g. 1234"
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
                      disabled={chatLockActionLoading || !chatUnlocked}
                      onClick={() => void handleChatEnableLock()}
                      style={{ height: 40 }}
                    >
                      {chatLockActionLoading ? 'Saving…' : 'Enable lock'}
                    </button>

                    {chatLocked && (
                      <button
                        type="button"
                        className="gchat-info-admin-btn gchat-info-admin-btn--danger"
                        disabled={chatLockActionLoading}
                        onClick={() => void handleChatClearLock()}
                        style={{ height: 40 }}
                      >
                        Disable lock
                      </button>
                    )}
                  </div>

                  {chatLockError && (
                    <div className="gchat-info-state gchat-info-state--error" style={{ marginTop: 10 }}>
                      {chatLockError}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <ChatNotificationPrefsPanel
                  channelId={activeChannel._id}
                  apiRequest={apiRequest}
                  enqueueToast={enqueueToast}
                />
                {activeChannel.type === 'dm' ? (
                  <>
                    <div className="gchat-info-sub">{dmOtherMember?.email || 'Direct message'}</div>
                    <div className="gchat-info-sub">Role: {dmOtherMember?.role || 'member'}</div>
                    <div className="gchat-info-sub">Status: {dmPresenceText}</div>
                    {dmOtherMember?.id && (
                      <>
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {blockedUserIds.includes(String(dmOtherMember.id)) ? (
                            <button
                              type="button"
                              className="gchat-info-admin-btn gchat-info-admin-btn--danger"
                              disabled={abuseActionLoadingFor === String(dmOtherMember.id)}
                              onClick={() =>
                                setAbuseModalBlockState({
                                  targetUserId: String(dmOtherMember.id),
                                  mode: 'unblock',
                                  label: dmOtherMember.displayName || dmOtherMember.email || dmOtherMember.id,
                                })
                              }
                            >
                              {abuseActionLoadingFor === String(dmOtherMember.id) ? 'Working…' : 'Unblock'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="gchat-info-admin-btn gchat-info-admin-btn--danger"
                              disabled={abuseActionLoadingFor === String(dmOtherMember.id)}
                              onClick={() =>
                                setAbuseModalBlockState({
                                  targetUserId: String(dmOtherMember.id),
                                  mode: 'block',
                                  label: dmOtherMember.displayName || dmOtherMember.email || dmOtherMember.id,
                                })
                              }
                            >
                              {abuseActionLoadingFor === String(dmOtherMember.id) ? 'Working…' : 'Block'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="gchat-info-admin-btn"
                            disabled={abuseActionLoadingFor === String(dmOtherMember.id)}
                            onClick={() =>
                              setAbuseModalReportState({
                                targetUserId: String(dmOtherMember.id),
                                reason: 'other',
                                details: '',
                              })
                            }
                          >
                            Report
                          </button>
                          <button
                            type="button"
                            className="gchat-info-admin-btn gchat-info-admin-btn--danger"
                            disabled={abuseActionLoadingFor === String(dmOtherMember.id)}
                            onClick={() =>
                              setAbuseModalReportState({
                                targetUserId: String(dmOtherMember.id),
                                reason: 'spam',
                                details: '',
                              })
                            }
                          >
                            Report spam
                          </button>
                        </div>
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
                          <div className="gchat-info-section-title" style={{ marginBottom: 6 }}>
                            E2E Safety Code Verification
                          </div>
                          {e2eVerificationLoading && (
                            <div className="gchat-info-state">Loading safety codes…</div>
                          )}
                          {!e2eVerificationLoading && e2eVerificationError && (
                            <div className="gchat-info-state gchat-info-state--error">{e2eVerificationError}</div>
                          )}
                          {!e2eVerificationLoading && !e2eVerificationError && e2eVerificationState && (
                            <>
                              <div className="gchat-info-sub" style={{ marginTop: 8 }}>
                                Your code: <strong>{e2eVerificationState.safetyCodeMe || '—'}</strong>
                              </div>
                              <div className="gchat-info-sub" style={{ marginTop: 6 }}>
                                Peer code: <strong>{e2eVerificationState.safetyCodeOther || '—'}</strong>
                              </div>
                              {e2eVerificationState.verified ? (
                                <div className="gchat-info-state" style={{ marginTop: 10 }}>
                                  Verified
                                  {e2eVerificationState.verifiedAt
                                    ? ` · ${e2eVerificationState.verifiedAt.toLocaleString()}`
                                    : ''}
                                </div>
                              ) : (
                                <div style={{ marginTop: 10 }}>
                                  <div className="gchat-info-sub" style={{ opacity: 0.85, marginBottom: 6 }}>
                                    Compare the two codes with your peer. Then mark as verified.
                                  </div>
                                  <button
                                    type="button"
                                    className="gchat-info-admin-btn"
                                    disabled={!e2eVerificationState.safetyCodeOther || e2eVerificationLoading}
                                    onClick={() => void handleMarkE2eVerified()}
                                  >
                                    Mark as verified
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                          {!e2eVerificationLoading && !e2eVerificationError && !e2eVerificationState && (
                            <div className="gchat-info-state" style={{ marginTop: 8 }}>
                              Publish E2E keys to enable verification.
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {chatInfo.channel?.description ? (
                      <p className="gchat-info-desc">{chatInfo.channel.description}</p>
                    ) : null}
                    <div className="gchat-info-sub">{chatInfo.memberCount} members</div>
                    <div className="gchat-info-sub">Admins: {infoAdmins.length}</div>
                    {creatorUser ? (
                      <div className="gchat-info-sub">
                        Created by: {creatorUser.displayName || creatorUser.email}
                      </div>
                    ) : null}
                  </>
                )}
                {activeChannel.type !== 'dm' && (
                  <div className="gchat-info-members">
                    <div className="gchat-info-section-title">Members</div>
                    <input
                      type="search"
                      className="gchat-info-member-search"
                      placeholder="Search members"
                      value={chatInfoMemberQuery}
                      onChange={(e) => setChatInfoMemberQuery(e.target.value)}
                    />
                    {filteredInfoMembers.map((m) => (
                      <div key={m.id} className="gchat-info-member-row">
                        <button
                          type="button"
                          className="gchat-info-member-avatar gchat-info-member-avatar-btn"
                          onClick={() => setSelectedMemberInfo(m)}
                          title="View member profile"
                        >
                          {m.avatarUrl ? (
                            <img
                              src={m.avatarUrl}
                              alt={m.displayName || m.email || m.id}
                              className="gchat-info-member-avatar-img"
                            />
                          ) : (
                            initialsFromString(m.displayName || m.email || m.id)
                          )}
                        </button>
                        <div className="gchat-info-member-meta">
                          <div className="gchat-info-member-name">
                            {m.displayName || m.email}
                            {String(m.id) === String(user?.id) ? ' (You)' : ''}
                          </div>
                          <div className="gchat-info-member-sub">
                            {m.email}
                            {m.isAdmin ? ' • Admin' : ''}
                          </div>
                        </div>
                        {canManageAdmins && String(m.id) !== String(user?.id) && (
                          <div className="gchat-info-member-actions">
                            <button
                              type="button"
                              className="gchat-info-admin-btn"
                              onClick={() => handlePromoteDemoteAdmin(m)}
                              disabled={adminActionLoadingFor === String(m.id)}
                            >
                              {adminActionLoadingFor === String(m.id)
                                ? 'Saving...'
                                : m.isAdmin
                                  ? 'Demote'
                                  : 'Promote'}
                            </button>
                            <button
                              type="button"
                              className="gchat-info-admin-btn gchat-info-admin-btn--danger"
                              onClick={() => setRemoveConfirmMember(m)}
                              disabled={adminActionLoadingFor === String(m.id)}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {adminActionError && (
                      <div className="gchat-info-state gchat-info-state--error">{adminActionError}</div>
                    )}
                    {filteredInfoMembers.length === 0 && (
                      <div className="gchat-info-state">No members match your search.</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

