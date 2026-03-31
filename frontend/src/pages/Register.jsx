import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { config } from '../config/env.js'

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

function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setApiError('')

    const nextErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
      confirmPassword:
        !confirmPassword || confirmPassword !== password ? 'Passwords do not match' : '',
    }

    const hasErrors = Object.values(nextErrors).some(Boolean)
    if (hasErrors) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setIsSubmitting(true)

    try {
      const response = await fetch(`${config.apiBaseUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setApiError(data.error || 'Registration failed. Please try again.')
        return
      }

      navigate('/login', {
        replace: true,
        state: {
          message: 'Account created. Sign in with your email and password.',
        },
      })
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
      <h1>Create your account</h1>
      <p>Set up your workspace access in a few steps.</p>

      <form
        onSubmit={handleSubmit}
        style={{ marginTop: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}
        noValidate
      >
        <Input
          label="Name (optional)"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your display name"
        />

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

        <Input
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
          placeholder="Re-enter password"
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
            {isSubmitting ? 'Creating account…' : 'Create account'}
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
        Already have an account?{' '}
        <Link to="/login" style={{ color: 'var(--color-primary-hover)', fontWeight: 600 }}>
          Sign in
        </Link>
      </p>
    </div>
  )
}

export default Register
