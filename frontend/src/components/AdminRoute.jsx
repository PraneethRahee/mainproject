import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import { AuthFlowLoading } from './AuthFlowLoading.jsx'

/**
 * Protects admin-only routes. Only role === 'admin' can access; others redirect to /chat.
 */
export function AdminRoute({ children }) {
  const { user, userLoading } = useApp()

  if (userLoading) {
    return <AuthFlowLoading message="Loading…" />
  }

  if (!user || user.role !== 'admin') {
    return <Navigate to="/chat" replace />
  }

  return children
}
