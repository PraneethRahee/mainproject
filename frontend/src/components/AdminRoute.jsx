import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'

/**
 * Protects admin-only routes. Only role === 'admin' can access; others redirect to /chat.
 */
export function AdminRoute({ children }) {
  const { user, userLoading } = useApp()

  if (userLoading) {
    return (
      <div className="page-placeholder" style={{ padding: 'var(--space-6)' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      </div>
    )
  }

  if (!user || user.role !== 'admin') {
    return <Navigate to="/chat" replace />
  }

  return children
}
