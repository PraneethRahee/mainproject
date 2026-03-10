import React from 'react'
import PropTypes from 'prop-types'

export function Input({
  label,
  error,
  className = '',
  id,
  type = 'text',
  disabled = false,
  ...props
}) {
  const inputId = id || `input-${Math.random().toString(36).slice(2)}`

  return (
    <div className="space-y-1">
      {label && (
        <label
          htmlFor={inputId}
          style={{
            display: 'block',
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
            color: 'var(--color-text-muted)',
            marginBottom: '0.15rem',
          }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        disabled={disabled}
        className={className}
        style={{
          width: '100%',
          borderRadius: 'var(--radius-md)',
          border: `1px solid ${
            error ? 'var(--color-error)' : 'rgba(148, 163, 184, 0.5)'
          }`,
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text)',
          fontSize: 'var(--text-sm)',
          padding: '0.55rem 0.7rem',
          outline: 'none',
          transition: `border-color var(--transition-base), box-shadow var(--transition-base), background-color var(--transition-base)`,
          opacity: disabled ? 0.6 : 1,
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--color-primary)'
          e.target.style.boxShadow = '0 0 0 1px rgba(79, 70, 229, 0.4)'
        }}
        onBlur={(e) => {
          e.target.style.borderColor = error
            ? 'var(--color-error)'
            : 'rgba(148, 163, 184, 0.5)'
          e.target.style.boxShadow = 'none'
        }}
        {...props}
      />
      {error && (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--text-xs)',
            color: 'var(--color-error)',
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}

Input.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  className: PropTypes.string,
  id: PropTypes.string,
  type: PropTypes.string,
  disabled: PropTypes.bool,
}

