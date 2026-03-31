import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { config } from '../config/env.js'
import { setSessionTokens } from '../lib/session.js'
import { resolvePostAuthDestination } from '../lib/authRedirect.js'
import { useApp } from '../context/AppContext.jsx'

function validateEmail(email) {
  if (!email) return 'Email is required'
  const trimmed = email.trim()
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!re.test(trimmed)) return 'Enter a valid email address'
  return ''
}

function validatePassword(password) {
  if (!password) return 'Password is required'
  if (password.length < 8) return 'Password must be at least 8 characters'
  return ''
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const navigate = useNavigate()
  const location = useLocation()
  const { refreshUser, logout } = useApp()

  useEffect(() => {
    const msg = location.state?.message
    if (typeof msg === 'string' && msg) {
      setSuccessMessage(msg)
      const { from } = location.state || {}
      navigate(location.pathname, {
        replace: true,
        state: from ? { from } : {},
      })
    }
  }, [location.pathname, location.state?.message, location.state?.from, navigate])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setApiError('')
    setSuccessMessage('')

    const nextErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    }

    const hasErrors = Object.values(nextErrors).some(Boolean)
    if (hasErrors) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setIsSubmitting(true)

    try {
      const response = await fetch(`${config.apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim(), password }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setApiError(data.error || 'Login failed. Please try again.')
        return
      }

      if (data.requiresMfa && data.tempToken) {
        navigate('/mfa', {
          state: {
            tempToken: data.tempToken,
            email: email.trim(),
            from: location.state?.from,
          },
          replace: true,
        })
      } else if (data.accessToken && data.refreshToken) {
        setSessionTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          sessionId: data.sessionId,
        })
        await refreshUser()
        const next = resolvePostAuthDestination(location.state?.from, '/chat')
        navigate('/welcome', { replace: true, state: { next } })
      } else {
        setSuccessMessage('Login successful.')
      }
    } catch (error) {
      setApiError('Unable to reach server. Check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="page-placeholder">
      <p style={{ marginBottom: 'var(--space-3)' }}>
        <Link
          to="/"
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--color-text-muted)',
            textDecoration: 'none',
          }}
        >
          ← Back to home
        </Link>
      </p>
      <h1>Welcome back</h1>
      <p>Sign in to continue chatting with your team.</p>

      <form
        onSubmit={handleSubmit}
        style={{ marginTop: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}
        noValidate
      >
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          placeholder="you@example.com"
        />

        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          placeholder="••••••••"
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

        {successMessage && (
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-success)',
            }}
          >
            {successMessage}
          </div>
        )}

        <div style={{ marginTop: 'var(--space-2)' }}>
          <Button type="submit" size="md" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </form>

      <p
        style={{
          marginTop: 'var(--space-5)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)',
          textAlign: 'center',
        }}
      >
        Don&apos;t have an account?{' '}
        <Link to="/register" style={{ color: 'var(--color-primary-hover)', fontWeight: 600 }}>
          Create account
        </Link>
      </p>

      <p
        style={{
          marginTop: 'var(--space-4)',
          fontSize: 'var(--text-sm)',
          textAlign: 'center',
        }}
      >
        <button
          type="button"
          onClick={() => {
            logout()
            setEmail('')
            setPassword('')
            setErrors({})
            setApiError('')
            setSuccessMessage('')
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'var(--color-primary-hover)',
            fontWeight: 600,
            fontSize: 'inherit',
            fontFamily: 'inherit',
            textDecoration: 'underline',
          }}
        >
          Use another account
        </button>
      </p>
    </div>
  )
}

export default Login
