import { useState, useEffect } from 'react'
import { exportKeyBundle, importKeyBundle, checkKeyBackupExists } from '../e2e/e2eService.js'
import { idbGet } from '../e2e/idb.js'

/**
 * E2EKeyBackupModal
 *
 * Shows in two modes:
 * 1. SETUP  — Fresh browser with no IDB keys but a backup exists on server → prompt to restore.
 * 2. BACKUP — First time keys are generated → prompt user to set a backup PIN.
 *
 * Props:
 *   mode: 'setup' | 'backup'
 *   onDone: () => void
 *   onSkip: () => void
 */
export function E2EKeyBackupModal({ mode, onDone, onSkip }) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [message, setMessage] = useState('')

  async function handleBackup() {
    if (pin.length < 4) return setMessage('PIN must be at least 4 characters.')
    if (pin !== confirmPin) return setMessage('PINs do not match.')
    setStatus('loading')
    setMessage('')
    try {
      await exportKeyBundle(pin)
      setStatus('success')
      setMessage('Keys backed up! You can now use this PIN to restore on any browser.')
      setTimeout(onDone, 1800)
    } catch (err) {
      setStatus('error')
      setMessage(err.message || 'Backup failed.')
    }
  }

  async function handleRestore() {
    if (pin.length < 4) return setMessage('PIN must be at least 4 characters.')
    setStatus('loading')
    setMessage('')
    try {
      await importKeyBundle(pin)
      setStatus('success')
      setMessage('Keys restored! Reloading…')
      setTimeout(() => { window.location.reload() }, 1200)
    } catch (err) {
      setStatus('error')
      setMessage(err.message || 'Restore failed — wrong PIN?')
    }
  }

  const isBackup = mode === 'backup'
  const loading = status === 'loading'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1e2433 0%, #161b2a 100%)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 18,
        padding: '36px 32px',
        width: '100%', maxWidth: 400,
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: isBackup ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'linear-gradient(135deg,#059669,#047857)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26,
          }}>
            {isBackup ? '🔐' : '🔑'}
          </div>
        </div>

        {/* Title */}
        <h2 style={{ textAlign: 'center', color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
          {isBackup ? 'Secure Your Messages' : 'Restore Encrypted Messages'}
        </h2>
        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, margin: '0 0 24px', lineHeight: 1.6 }}>
          {isBackup
            ? 'Set a backup PIN to access your encrypted messages on any browser. The PIN never leaves your device.'
            : 'Enter your backup PIN to restore your encryption keys and read your messages on this browser.'}
        </p>

        {/* PIN input */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isBackup ? 'Create PIN' : 'Enter PIN'}
          </label>
          <input
            type="password"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setMessage('') }}
            placeholder="Minimum 4 characters"
            disabled={loading}
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 10,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#f1f5f9', fontSize: 14, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {isBackup && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Confirm PIN
            </label>
            <input
              type="password"
              value={confirmPin}
              onChange={(e) => { setConfirmPin(e.target.value); setMessage('') }}
              placeholder="Re-enter PIN"
              disabled={loading}
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#f1f5f9', fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Status message */}
        {message && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
            background: status === 'error' ? 'rgba(239,68,68,0.15)' : status === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.12)',
            color: status === 'error' ? '#f87171' : status === 'success' ? '#34d399' : '#818cf8',
            border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.3)' : status === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'}`,
          }}>
            {message}
          </div>
        )}

        {/* Buttons */}
        <button
          onClick={isBackup ? handleBackup : handleRestore}
          disabled={loading || status === 'success'}
          style={{
            width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: loading ? 'rgba(255,255,255,0.08)' : isBackup ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'linear-gradient(135deg,#059669,#047857)',
            color: '#fff', fontSize: 14, fontWeight: 600, transition: 'opacity 0.2s',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Please wait…' : isBackup ? '🔐  Save Backup' : '🔑  Restore Keys'}
        </button>

        <button
          onClick={onSkip}
          disabled={loading}
          style={{
            width: '100%', marginTop: 10, padding: '10px', borderRadius: 10,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
            color: '#64748b', fontSize: 13, cursor: 'pointer',
          }}
        >
          {isBackup ? 'Skip for now' : 'Continue without restoring'}
        </button>
      </div>
    </div>
  )
}

/**
 * Hook to detect which E2E modal (if any) should be shown after login.
 * Returns: { modalMode: 'backup'|'setup'|null, dismissModal }
 */
export function useE2EBackupModal(user, e2eReady) {
  const [modalMode, setModalMode] = useState(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!user || !e2eReady || checked) return
    setChecked(true)

    ;(async () => {
      try {
        const hasLocalKeys = await idbGet('signal:identityKeyPair')
        const hasBackupFlag = await idbGet('signal:publishedIdentityKey')

        if (!hasLocalKeys) {
          // Fresh browser — check if there's a server backup to restore from.
          const backupExists = await checkKeyBackupExists()
          if (backupExists) {
            setModalMode('setup')  // Prompt to restore
            return
          }
          // No backup — nothing to do (keys will be generated by initE2E).
          return
        }

        if (!hasBackupFlag) {
          // Keys exist locally but never backed up — prompt to back up.
          setModalMode('backup')
        }
      } catch {
        // Non-critical — do not block the app.
      }
    })()
  }, [user, e2eReady, checked])

  const dismissModal = () => setModalMode(null)

  return { modalMode, dismissModal }
}
