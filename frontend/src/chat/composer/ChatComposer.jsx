import { useRef } from 'react'

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(1)} ${units[index]}`
}

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const iconAttach = (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path
      fill="currentColor"
      d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"
    />
  </svg>
)

const iconMic = (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path
      fill="currentColor"
      d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"
    />
  </svg>
)

const iconEmoji = (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path
      fill="currentColor"
      d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"
    />
  </svg>
)

const iconFormat = (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path
      fill="currentColor"
      d="M5 4v3h5.5V12h-5v3h5.25L16 8.5V4H5zm9 4.5l-2.5 3H14V8.5zM19 18h-2v2h-2v-2h-2v-2h2v-2h2v2h2v2z"
    />
  </svg>
)

export function ChatComposer({
  activeChannel,
  chatUnlocked,
  isSending,
  isRecordingVoiceNote,
  voiceRecordingElapsedSec,
  startVoiceRecording,
  stopVoiceRecording,
  cancelVoiceRecording,
  fileInputRef,
  handleFileInputChange,
  attachments,
  replyToDraft,
  setReplyToDraft,
  composerText,
  setComposerText,
  handleComposerKeyDown,
  composerError,
  composerGroupMetadata,
  composerMemberInfo,
  attachmentError,
  handleSend,
}) {
  const composerDisabled =
    !activeChannel ||
    isSending ||
    !chatUnlocked ||
    (activeChannel?.type === 'group' &&
      composerGroupMetadata?.whoCanSend === 'adminsOnly' &&
      !composerMemberInfo?.isAdmin)

  const voiceDragStartXRef = useRef(null)
  const recordingMode = Boolean(isRecordingVoiceNote)

  return (
    <div className="gchat-composer-wrap">
      <div className="gchat-composer">
        <div className="gchat-composer-tools">
          <button type="button" className="gchat-icon-btn" title="Emoji" aria-label="Emoji">
            {iconEmoji}
          </button>
          <button type="button" className="gchat-icon-btn" title="Formatting" aria-label="Formatting">
            {iconFormat}
          </button>
          <button
            type="button"
            className={`gchat-icon-btn${recordingMode ? ' gchat-icon-btn--recording' : ''}`}
            title={
              isRecordingVoiceNote
                ? 'Release to send · slide left to cancel'
                : 'Hold to record voice note'
            }
            aria-label="Record voice note"
            disabled={!activeChannel || isSending || !chatUnlocked}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              voiceDragStartXRef.current = e.clientX
              if (!isRecordingVoiceNote) startVoiceRecording()
            }}
            onPointerUp={(e) => {
              e.preventDefault()
              voiceDragStartXRef.current = null
              if (isRecordingVoiceNote) stopVoiceRecording()
            }}
            onPointerCancel={() => {
              voiceDragStartXRef.current = null
              if (isRecordingVoiceNote) stopVoiceRecording()
            }}
            onPointerMove={(e) => {
              if (!isRecordingVoiceNote) return
              if (voiceDragStartXRef.current == null) return
              const dx = e.clientX - voiceDragStartXRef.current
              if (dx < -60) {
                voiceDragStartXRef.current = null
                cancelVoiceRecording()
              }
            }}
          >
            {recordingMode ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden>●</span>
                <span style={{ fontSize: 12, opacity: 0.9 }}>
                  {formatSeconds(voiceRecordingElapsedSec)}
                </span>
              </span>
            ) : (
              iconMic
            )}
          </button>
          <button
            type="button"
            className="gchat-icon-btn"
            title="Attach file"
            aria-label="Attach file"
            disabled={!activeChannel}
            onClick={() => {
              if (!activeChannel) return
              fileInputRef.current?.click()
            }}
          >
            {iconAttach}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,application/x-7z-compressed,application/x-rar-compressed,application/x-tar,application/gzip,application/octet-stream"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />
        </div>

        {attachments.length > 0 && (
          <div className="gchat-attachments">
            {attachments.map((att) => (
              <div key={att.localId} className="gchat-att-item">
                {att.previewUrl &&
                  att.mimeType.startsWith('image/') &&
                  att.securityStatus === 'scanned_clean' && (
                    <img src={att.previewUrl} alt={att.fileName} className="gchat-att-preview" />
                  )}
                {att.previewUrl &&
                  att.mimeType.startsWith('video/') &&
                  att.securityStatus === 'scanned_clean' && (
                    <video src={att.previewUrl} className="gchat-att-preview" muted />
                  )}
                {att.previewUrl && att.mimeType.startsWith('audio/') && (
                  <audio src={att.previewUrl} controls className="gchat-att-preview" />
                )}
                <div className="gchat-att-meta">
                  <div className="gchat-att-name">{att.fileName}</div>
                  <div className="gchat-att-details">
                    <span>{formatBytes(att.size)}</span>
                    <span> · </span>
                    <span>{att.mimeType}</span>
                  </div>
                  <div className="gchat-att-bar">
                    <div className="gchat-att-bar-fill" style={{ width: `${att.progress || 0}%` }} />
                  </div>
                  {att.securityStatus &&
                    ['uploaded', 'quarantined'].includes(att.securityStatus) && (
                      <div className="gchat-att-scan">Scanning…</div>
                    )}
                  {att.securityStatus === 'scanned_clean' && (
                    <div className="gchat-att-scan gchat-att-scan--clean">Ready to send</div>
                  )}
                  {att.securityStatus === 'scanned_blocked' && (
                    <div className="gchat-att-scan gchat-att-scan--blocked">File blocked</div>
                  )}
                  {att.status === 'error' && att.errorMessage && (
                    <div className="gchat-att-err">{att.errorMessage}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {replyToDraft && activeChannel?.type === 'group' && (
          <div className="gchat-reply-composer">
            <div className="gchat-reply-composer-header">
              <span className="gchat-reply-composer-title">
                Replying to {replyToDraft.sender || 'User'}
              </span>
              <button
                type="button"
                className="gchat-reply-composer-cancel"
                onClick={() => setReplyToDraft(null)}
                title="Cancel reply"
              >
                Cancel
              </button>
            </div>
            <div className="gchat-reply-composer-content">{replyToDraft.content}</div>
          </div>
        )}

        {recordingMode ? (
          <div className="gchat-voice-recording-row" role="status" aria-live="polite">
            <button
              type="button"
              className="gchat-voice-cancel-btn"
              title="Cancel voice note"
              aria-label="Cancel voice note"
              onClick={() => cancelVoiceRecording()}
            >
              Cancel
            </button>
            <div className="gchat-voice-recording-status">
              <span className="gchat-voice-dot" aria-hidden>
                ●
              </span>
              <span className="gchat-voice-recording-text">Recording...</span>
              <span className="gchat-voice-recording-time">
                {formatSeconds(voiceRecordingElapsedSec)}
              </span>
            </div>
            <span className="gchat-voice-slide-hint">Slide left to cancel</span>
          </div>
        ) : (
          <textarea
            className="gchat-composer-input"
            placeholder={
              activeChannel ? `Message ${activeChannel.name || 'chat'}` : 'Select a chat'
            }
            rows={1}
            value={composerText}
            disabled={composerDisabled}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={handleComposerKeyDown}
          />
        )}
        {composerError && <div className="gchat-composer-error">{composerError}</div>}
        {activeChannel?.type === 'group' &&
          composerGroupMetadata?.whoCanSend === 'adminsOnly' &&
          !composerMemberInfo?.isAdmin &&
          !composerError && (
            <div className="gchat-composer-error">Posting is restricted to group admins.</div>
          )}
        {attachmentError && <div className="gchat-composer-error">{attachmentError}</div>}
        {recordingMode ? (
          <div className="gchat-composer-bottom">
            <span className="gchat-composer-hint">Release the mic button to send voice note</span>
          </div>
        ) : (
          <div className="gchat-composer-bottom">
            <span className="gchat-composer-hint">Enter to send · Shift+Enter new line</span>
            <button
              type="button"
              className="gchat-send-btn"
              disabled={composerDisabled}
              onClick={handleSend}
            >
              {isSending ? 'Sending…' : 'Send'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
