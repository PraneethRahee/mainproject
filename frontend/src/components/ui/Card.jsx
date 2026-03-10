import React from 'react'
import PropTypes from 'prop-types'

export function Card({ children, elevated = false, className = '', ...props }) {
  return (
    <section
      className={className}
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        padding: 'var(--space-5)',
        background: elevated
          ? 'linear-gradient(145deg, rgba(15,23,42,0.96), rgba(30,64,175,0.75))'
          : 'var(--color-surface)',
        boxShadow: elevated
          ? '0 18px 45px rgba(15, 23, 42, 0.55)'
          : '0 10px 30px rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(18px)',
        transition: `transform var(--transition-base), box-shadow var(--transition-base)`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
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

