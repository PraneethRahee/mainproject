import { useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { config } from '../config/env.js'
import { setSessionTokens } from '../lib/session.js'
import { useApp } from '../context/AppContext.jsx'

function validateCode(code) {
  if (!code) return 'Code is required'
  const trimmed = String(code).trim()
  if (!/^\d{6}$/.test(trimmed)) return 'Enter the 6-digit code from your authenticator app'
  return ''
}

function Mfa() {
  const location = useLocation()
  const navigate = useNavigate()
  const { refreshUser } = useApp()

  const state = location.state || {}
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [apiError, setApiError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const tempToken = state.tempToken
  const email = state.email

  const handleSubmit = async (event) => {
    event.preventDefault()
    setApiError('')

    const nextError = validateCode(code)
    if (nextError) {
      setError(nextError)
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch(`${config.apiBaseUrl}/auth/mfa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: String(code).trim(),
          tempToken,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setApiError(data.error || 'Verification failed. Please try again.')
        return
      }

      if (data.accessToken && data.refreshToken) {
        setSessionTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        })
        await refreshUser()
      }

      navigate('/chat', { replace: true })
    } catch (err) {
      setApiError('Unable to reach server. Check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!tempToken) {
    return (
      <div className="page-placeholder">
        <h1>MFA Verification</h1>
        <p>We could not find an active MFA challenge. Please sign in again.</p>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Button onClick={() => navigate('/login', { replace: true })} size="md" variant="primary">
            Go to login
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-placeholder">
      <h1>MFA Verification</h1>
      <p>
        Enter the 6-digit code from your authenticator app
        {email ? ` for ${email}.` : '.'}
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ marginTop: 'var(--space-5)', maxWidth: 320, display: 'grid', gap: 'var(--space-4)' }}
        noValidate
      >
        <Input
          label="Authentication code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          error={error}
          placeholder="123456"
        />

        {apiError && (
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-error)',
            }}
          >
            {apiError}
          </div>
        )}

        <div style={{ marginTop: 'var(--space-2)' }}>
          <Button type="submit" size="md" disabled={isSubmitting}>
            {isSubmitting ? 'Verifying…' : 'Verify and continue'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default Mfa
