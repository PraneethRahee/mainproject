import { Navigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import { AuthFlowLoading } from './AuthFlowLoading.jsx'

/**
 * Requires a logged-in user; otherwise sends to sign-in (like opening Chat without a session).
 */
export function ProtectedRoute({ children }) {
  const { user, userLoading } = useApp()
  const location = useLocation()

  if (userLoading) {
    return <AuthFlowLoading message="Signing you in…" />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
