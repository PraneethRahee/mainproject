import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { useApp } from '../context/AppContext.jsx'
import { resolvePostAuthDestination } from '../lib/authRedirect.js'
import { config } from '../config/env.js'
import { getAccessToken, setSessionTokens } from '../lib/session.js'
import QRCode from 'qrcode'

function initialsFromUser(user) {
  if (!user) return '?'
  const raw = (user.name || user.email || user.id || '').trim()
  if (!raw) return '?'
  const compact = raw.replace(/\s+/g, '')
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase()
  return raw.slice(0, 2).toUpperCase()
}

/**
 * Post–sign-in chooser (Google-style): continue as this account or switch account.
 */
function Welcome() {
  const { user, logout, refreshUser } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [setupData, setSetupData] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [mfaSuccess, setMfaSuccess] = useState('')
  const [isSettingUpMfa, setIsSettingUpMfa] = useState(false)
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copyStatus, setCopyStatus] = useState('')

  const next = resolvePostAuthDestination(location.state?.next, '/chat')

  useEffect(() => {
    let isMounted = true

    async function generateQr() {
      if (!setupData?.otpauthUrl) {
        setQrDataUrl('')
        return
      }
      try {
        const dataUrl = await QRCode.toDataURL(setupData.otpauthUrl, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 220,
        })
        if (isMounted) {
          setQrDataUrl(dataUrl)
        }
      } catch {
        if (isMounted) {
          setQrDataUrl('')
        }
      }
    }

    generateQr()
    return () => {
      isMounted = false
    }
  }, [setupData])

  const displayName =
    user?.name?.trim() ||
    (user?.email ? user.email.split('@')[0] : null) ||
    'there'

  const handleContinue = () => {
    navigate(next, { replace: true })
  }

  const handleUseAnother = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const handleSetupMfa = async () => {
    setMfaError('')
    setMfaSuccess('')
    setSetupData(null)
    setMfaCode('')
    setCopyStatus('')

    const accessToken = getAccessToken()
    if (!accessToken) {
      setMfaError('Your session expired. Please sign in again.')
      return
    }

    setIsSettingUpMfa(true)
    try {
      const response = await fetch(`${config.apiBaseUrl}/auth/mfa/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessToken }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.secret) {
        setMfaError(data.error || 'Could not set up MFA. Please try again.')
        return
      }
      setSetupData({
        secret: data.secret,
        otpauthUrl: data.otpauthUrl || '',
      })
    } catch {
      setMfaError('Unable to reach server. Check your connection and try again.')
    } finally {
      setIsSettingUpMfa(false)
    }
  }

  const handleVerifyMfa = async () => {
    setMfaError('')
    setMfaSuccess('')
    setCopyStatus('')
    const accessToken = getAccessToken()
    const code = String(mfaCode).trim()
    if (!accessToken) {
      setMfaError('Your session expired. Please sign in again.')
      return
    }
    if (!/^\d{6}$/.test(code)) {
      setMfaError('Enter a valid 6-digit code.')
      return
    }

    setIsVerifyingMfa(true)
    try {
      const response = await fetch(`${config.apiBaseUrl}/auth/mfa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken,
          code,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.accessToken || !data.refreshToken) {
        setMfaError(data.error || 'MFA verification failed. Please try again.')
        return
      }

      setSessionTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        sessionId: data.sessionId,
      })
      await refreshUser()
      setMfaSuccess(
        user?.mfaEnabled
          ? 'Authentication successful.'
          : 'MFA enabled successfully. Future logins will require a code.',
      )
      setSetupData(null)
      setMfaCode('')
      navigate(next, { replace: true })
    } catch {
      setMfaError('Unable to reach server. Check your connection and try again.')
    } finally {
      setIsVerifyingMfa(false)
    }
  }

  const handleCopySecret = async () => {
    if (!setupData?.secret) return
    try {
      await navigator.clipboard.writeText(setupData.secret)
      setCopyStatus('Secret copied')
    } catch {
      setCopyStatus('Copy failed')
    }
  }

  return (
    <div className="page-placeholder welcome-screen">
      <div className="welcome-avatar" aria-hidden>
        {initialsFromUser(user)}
      </div>
      <h1>Hi, {displayName}</h1>
      <p>
        Continue to Chat with this account, or sign in with a different account.
      </p>

      <div
        style={{
          marginTop: 'var(--space-5)',
          display: 'grid',
          gap: 'var(--space-3)',
        }}
      >
        <Button type="button" size="md" onClick={handleContinue}>
          Continue to Chat
        </Button>
        <Button type="button" size="md" variant="secondary" onClick={handleUseAnother}>
          Use another account
        </Button>
      </div>

      <div
        style={{
          marginTop: 'var(--space-5)',
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          background: 'var(--color-muted-surface)',
          textAlign: 'left',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 'var(--text-md)',
            fontFamily: 'var(--font-heading)',
          }}
        >
          Multi-factor authentication (MFA)
        </h3>
        {user?.mfaEnabled ? (
          <div
            style={{
              marginTop: 'var(--space-3)',
              display: 'grid',
              gap: 'var(--space-3)',
            }}
          >
            <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              MFA is enabled. Enter a current 6-digit code to authenticate this app.
            </p>
            <Input
              label="Authentication code"
              type="text"
              placeholder="123456"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <Button type="button" size="sm" onClick={handleVerifyMfa} disabled={isVerifyingMfa}>
              {isVerifyingMfa ? 'Authenticating…' : 'Authenticate app'}
            </Button>
          </div>
        ) : (
          <>
            <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
              Add an authenticator app for stronger account security.
            </p>
            {!setupData && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleSetupMfa}
                disabled={isSettingUpMfa}
              >
                {isSettingUpMfa ? 'Preparing setup…' : 'Enable MFA'}
              </Button>
            )}
            {setupData && (
              <div
                style={{
                  marginTop: 'var(--space-3)',
                  display: 'grid',
                  gap: 'var(--space-3)',
                }}
              >
                <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                  Add this secret in your authenticator app (Time-based / TOTP):
                </p>
                <code
                  style={{
                    display: 'block',
                    padding: '0.55rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-input-bg)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--text-xs)',
                    wordBreak: 'break-all',
                  }}
                >
                  {setupData.secret}
                </code>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Button type="button" size="sm" variant="secondary" onClick={handleCopySecret}>
                    Copy secret
                  </Button>
                  {copyStatus && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {copyStatus}
                    </span>
                  )}
                </div>
                {setupData.otpauthUrl && (
                  <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                    <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                      Scan this QR code in your authenticator app:
                    </p>
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="MFA setup QR code"
                        width={220}
                        height={220}
                        style={{
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--color-border)',
                          background: '#fff',
                          padding: '0.35rem',
                        }}
                      />
                    ) : (
                      <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                        Preparing QR code...
                      </p>
                    )}
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                        Show setup URL
                      </summary>
                      <code
                        style={{
                          display: 'block',
                          marginTop: 'var(--space-2)',
                          padding: '0.55rem 0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-input-bg)',
                          border: '1px solid var(--color-border)',
                          fontSize: 'var(--text-xs)',
                          wordBreak: 'break-all',
                        }}
                      >
                        {setupData.otpauthUrl}
                      </code>
                    </details>
                  </div>
                )}
                <Input
                  label="Enter 6-digit code"
                  type="text"
                  placeholder="123456"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleVerifyMfa}
                  disabled={isVerifyingMfa}
                >
                  {isVerifyingMfa ? 'Verifying…' : 'Verify and activate'}
                </Button>
              </div>
            )}
          </>
        )}

        {mfaError && (
          <p
            style={{
              marginTop: 'var(--space-3)',
              marginBottom: 0,
              fontSize: 'var(--text-sm)',
              color: 'var(--color-error)',
            }}
          >
            {mfaError}
          </p>
        )}
        {mfaSuccess && (
          <p
            style={{
              marginTop: 'var(--space-3)',
              marginBottom: 0,
              fontSize: 'var(--text-sm)',
              color: 'var(--color-success)',
            }}
          >
            {mfaSuccess}
          </p>
        )}
      </div>

      {user?.email && (
        <p
          style={{
            marginTop: 'var(--space-5)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-muted)',
            wordBreak: 'break-all',
          }}
        >
          {user.email}
        </p>
      )}
    </div>
  )
}

export default Welcome
