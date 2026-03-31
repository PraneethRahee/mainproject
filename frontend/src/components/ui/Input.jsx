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
    <div className="ui-input-container">
      {label && (
        <label
          htmlFor={inputId}
          className="ui-input-label"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        disabled={disabled}
        className={`ui-input ${className}`}
        style={{
          borderColor: error ? 'var(--color-error)' : undefined,
          opacity: disabled ? 0.6 : 1,
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

