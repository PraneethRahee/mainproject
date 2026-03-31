export function MemberProfileModal({
  selectedMemberInfo,
  onClose,
  initialsFromString,
  user,
  blockedUserIds,
  abuseActionLoadingFor,
  setAbuseModalBlockState,
  setAbuseModalReportState,
}) {
  if (!selectedMemberInfo) return null
  return (
    <div className="gchat-info-overlay" onClick={onClose}>
      <aside
        className="gchat-mini-profile"
        onClick={(e) => e.stopPropagation()}
        aria-label="Member profile"
      >
        <div className="gchat-info-header">
          <h3>Member profile</h3>
          <button
            type="button"
            className="gchat-icon-btn"
            aria-label="Close profile"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="gchat-info-body">
          <div className="gchat-info-avatar">
            {selectedMemberInfo.avatarUrl ? (
              <img
                src={selectedMemberInfo.avatarUrl}
                alt={selectedMemberInfo.displayName || selectedMemberInfo.email}
                className="gchat-info-avatar-img"
              />
            ) : (
              initialsFromString(selectedMemberInfo.displayName || selectedMemberInfo.email)
            )}
          </div>
          <div className="gchat-info-name">
            {selectedMemberInfo.displayName || selectedMemberInfo.email}
          </div>
          <div className="gchat-info-sub">{selectedMemberInfo.email}</div>
          <div className="gchat-info-sub">Role: {selectedMemberInfo.role || 'member'}</div>
          <div className="gchat-info-sub">Group admin: {selectedMemberInfo.isAdmin ? 'Yes' : 'No'}</div>
          {selectedMemberInfo.id && String(selectedMemberInfo.id) !== String(user?.id) && (
            <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {blockedUserIds.includes(String(selectedMemberInfo.id)) ? (
                <button
                  type="button"
                  className="gchat-info-admin-btn gchat-info-admin-btn--danger"
                  disabled={abuseActionLoadingFor === String(selectedMemberInfo.id)}
                  onClick={() =>
                    setAbuseModalBlockState({
                      targetUserId: String(selectedMemberInfo.id),
                      mode: 'unblock',
                      label: selectedMemberInfo.displayName || selectedMemberInfo.email || selectedMemberInfo.id,
                    })
                  }
                >
                  {abuseActionLoadingFor === String(selectedMemberInfo.id) ? 'Working…' : 'Unblock'}
                </button>
              ) : (
                <button
                  type="button"
                  className="gchat-info-admin-btn gchat-info-admin-btn--danger"
                  disabled={abuseActionLoadingFor === String(selectedMemberInfo.id)}
                  onClick={() =>
                    setAbuseModalBlockState({
                      targetUserId: String(selectedMemberInfo.id),
                      mode: 'block',
                      label: selectedMemberInfo.displayName || selectedMemberInfo.email || selectedMemberInfo.id,
                    })
                  }
                >
                  {abuseActionLoadingFor === String(selectedMemberInfo.id) ? 'Working…' : 'Block'}
                </button>
              )}
              <button
                type="button"
                className="gchat-info-admin-btn"
                disabled={abuseActionLoadingFor === String(selectedMemberInfo.id)}
                onClick={() =>
                  setAbuseModalReportState({
                    targetUserId: String(selectedMemberInfo.id),
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
                disabled={abuseActionLoadingFor === String(selectedMemberInfo.id)}
                onClick={() =>
                  setAbuseModalReportState({
                    targetUserId: String(selectedMemberInfo.id),
                    reason: 'spam',
                    details: '',
                  })
                }
              >
                Report spam
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

export function RemoveMemberConfirmModal({
  removeConfirmMember,
  onClose,
  onConfirmRemove,
  adminActionLoadingFor,
}) {
  if (!removeConfirmMember) return null
  return (
    <div className="gchat-info-overlay" onClick={onClose}>
      <aside
        className="gchat-mini-profile"
        onClick={(e) => e.stopPropagation()}
        aria-label="Confirm remove member"
      >
        <div className="gchat-info-header">
          <h3>Remove member</h3>
          <button
            type="button"
            className="gchat-icon-btn"
            aria-label="Close remove confirmation"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="gchat-info-body">
          <p className="gchat-info-desc">
            Remove <strong>{removeConfirmMember.displayName || removeConfirmMember.email}</strong> from this group?
          </p>
          <div className="gchat-info-confirm-actions">
            <button type="button" className="gchat-info-admin-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="gchat-info-admin-btn gchat-info-admin-btn--danger"
              onClick={() => onConfirmRemove(removeConfirmMember)}
              disabled={adminActionLoadingFor === String(removeConfirmMember.id)}
            >
              {adminActionLoadingFor === String(removeConfirmMember.id) ? 'Removing...' : 'Remove member'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

export function AbuseBlockModal({
  abuseModalBlockState,
  onClose,
  abuseActionLoadingFor,
  onConfirmUnblock,
  onConfirmBlock,
}) {
  if (!abuseModalBlockState) return null
  return (
    <div className="gchat-info-overlay" onClick={onClose}>
      <aside
        className="gchat-mini-profile"
        onClick={(e) => e.stopPropagation()}
        aria-label="Confirm block user"
      >
        <div className="gchat-info-header">
          <h3>{abuseModalBlockState.mode === 'unblock' ? 'Unblock user' : 'Block user'}</h3>
          <button
            type="button"
            className="gchat-icon-btn"
            aria-label="Close block confirmation"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="gchat-info-body">
          <p className="gchat-info-desc">
            {abuseModalBlockState.mode === 'unblock' ? 'Allow' : 'Block'}{' '}
            <strong>{abuseModalBlockState.label || abuseModalBlockState.targetUserId}</strong>?
          </p>
          <div className="gchat-info-confirm-actions">
            <button type="button" className="gchat-info-admin-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={`gchat-info-admin-btn${abuseModalBlockState.mode === 'block' ? ' gchat-info-admin-btn--danger' : ''}`}
              disabled={abuseActionLoadingFor === String(abuseModalBlockState.targetUserId)}
              onClick={() =>
                abuseModalBlockState.mode === 'unblock'
                  ? void onConfirmUnblock(abuseModalBlockState.targetUserId)
                  : void onConfirmBlock(abuseModalBlockState.targetUserId)
              }
            >
              {abuseActionLoadingFor === String(abuseModalBlockState.targetUserId)
                ? 'Working…'
                : abuseModalBlockState.mode === 'unblock'
                  ? 'Unblock'
                  : 'Block'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

export function AbuseReportModal({
  abuseModalReportState,
  setAbuseModalReportState,
  onClose,
  abuseActionLoadingFor,
  onSubmitReport,
}) {
  if (!abuseModalReportState) return null
  return (
    <div className="gchat-info-overlay" onClick={onClose}>
      <aside className="gchat-mini-profile" onClick={(e) => e.stopPropagation()} aria-label="Report user">
        <div className="gchat-info-header">
          <h3>Report user</h3>
          <button
            type="button"
            className="gchat-icon-btn"
            aria-label="Close report modal"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="gchat-info-body">
          <p className="gchat-info-desc">
            Reporting <strong>{abuseModalReportState.label || abuseModalReportState.targetUserId}</strong>
          </p>
          <div style={{ marginTop: 10 }}>
            <label className="gchat-info-sub" style={{ display: 'block', opacity: 0.85, marginBottom: 6 }}>
              Reason
            </label>
            <select
              value={abuseModalReportState.reason || 'other'}
              disabled={abuseActionLoadingFor === String(abuseModalReportState.targetUserId)}
              onChange={(e) =>
                setAbuseModalReportState((cur) =>
                  cur
                    ? {
                        ...cur,
                        reason: e.target.value,
                      }
                    : cur,
                )
              }
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.03)',
                color: '#fff',
              }}
            >
              <option value="spam">Spam</option>
              <option value="harassment">Harassment</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="gchat-info-sub" style={{ display: 'block', opacity: 0.85, marginBottom: 6 }}>
              Details (optional)
            </label>
            <textarea
              value={abuseModalReportState.details || ''}
              disabled={abuseActionLoadingFor === String(abuseModalReportState.targetUserId)}
              onChange={(e) =>
                setAbuseModalReportState((cur) =>
                  cur
                    ? {
                        ...cur,
                        details: e.target.value,
                      }
                    : cur,
                )
              }
              placeholder="What happened?"
              style={{
                width: '100%',
                minHeight: 90,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.03)',
                color: '#fff',
                resize: 'vertical',
              }}
            />
          </div>
          <div className="gchat-info-confirm-actions" style={{ marginTop: 14 }}>
            <button type="button" className="gchat-info-admin-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="gchat-info-admin-btn gchat-info-admin-btn--danger"
              disabled={abuseActionLoadingFor === String(abuseModalReportState.targetUserId)}
              onClick={() => void onSubmitReport(abuseModalReportState)}
            >
              {abuseActionLoadingFor === String(abuseModalReportState.targetUserId)
                ? 'Submitting…'
                : 'Submit report'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}
