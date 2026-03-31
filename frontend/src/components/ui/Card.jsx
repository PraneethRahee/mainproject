import React from 'react'
import PropTypes from 'prop-types'

export function Card({ children, elevated = false, className = '', ...props }) {
  return (
    <section
      className={className}
      style={{
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border)',
        padding: 'var(--space-6)',
        background: elevated
          ? 'rgba(13, 16, 33, 0.8)'
          : 'var(--color-surface)',
        boxShadow: elevated
          ? 'var(--shadow-lg)'
          : 'var(--shadow-md)',
        backdropFilter: 'var(--blur-md)',
        WebkitBackdropFilter: 'var(--blur-md)',
        transition: `all var(--transition-base)`,
      }}
      onMouseEnter={(e) => {
        if (elevated) {
          e.currentTarget.style.transform = 'translateY(-4px)'
          e.currentTarget.style.boxShadow = 'var(--shadow-glow)'
        }
      }}
      onMouseLeave={(e) => {
        if (elevated) {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
        }
      }}
      {...props}
    >
      {children}
    </section>
  )
}

Card.propTypes = {
  children: PropTypes.node.isRequired,
  elevated: PropTypes.bool,
  className: PropTypes.string,
}

