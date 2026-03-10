import React from 'react'
import PropTypes from 'prop-types'

const baseClasses =
  'inline-flex items-center justify-center font-medium rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'

const variants = {
  primary:
    'bg-[var(--color-primary)] text-white border-transparent hover:bg-[var(--color-primary-hover)]',
  secondary:
    'bg-[var(--color-surface-elevated)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-primary)]',
  ghost:
    'bg-transparent text-[var(--color-text-muted)] border-transparent hover:bg-[var(--color-surface-elevated)]',
}

const sizes = {
  sm: 'text-[var(--text-xs)] px-[var(--space-3)] py-[0.35rem]',
  md: 'text-[var(--text-sm)] px-[var(--space-4)] py-[0.55rem]',
  lg: 'text-[var(--text-md)] px-[var(--space-5)] py-[0.7rem]',
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
  const variantClasses = variants[variant] ?? variants.primary
  const sizeClasses = sizes[size] ?? sizes.md

  return (
    <button
      type={type}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${sizeClasses} ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      } ${className}`}
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

