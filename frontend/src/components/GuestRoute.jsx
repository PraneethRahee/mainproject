import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import { AuthFlowLoading } from './AuthFlowLoading.jsx'

/**
 * Sign-in / sign-up pages only; signed-in users go to welcome flow.
 */
export function GuestRoute({ children }) {
  const { user, userLoading } = useApp()

  if (userLoading) {
    return <AuthFlowLoading message="Checking your account…" />
  }

  if (user) {
    return <Navigate to="/welcome" replace />
  }

  return children
}
