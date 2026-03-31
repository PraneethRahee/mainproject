import React from 'react'
import PropTypes from 'prop-types'

const variants = {
  primary: 'ui-button-primary',
  secondary: 'ui-button-secondary',
  ghost: 'ui-button-ghost',
}

const sizes = {
  sm: 'ui-button-sm',
  md: 'ui-button-md',
  lg: 'ui-button-lg',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  type = 'button',
  className = '',
  ...props
}) {
  const variantClass = variants[variant] ?? variants.primary
  const sizeClass = sizes[size] ?? sizes.md

  return (
    <button
      type={type}
      disabled={disabled}
      className={`ui-button ${variantClass} ${sizeClass} ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      } ${className}`}
      style={disabled ? { opacity: 0.6, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
      {...props}
    >
      {children}
    </button>
  )
}

Button.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['primary', 'secondary', 'ghost']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  disabled: PropTypes.bool,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  className: PropTypes.string,
}

