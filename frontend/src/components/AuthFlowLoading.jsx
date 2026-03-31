/**
 * Full-screen loading state while resolving session (Google-style “checking…”).
 */
export function AuthFlowLoading({ message = 'Loading…' }) {
  return (
    <div className="auth-flow-screen">
      <div className="auth-flow-loading-inner" role="status" aria-live="polite">
        <div className="auth-flow-spinner" aria-hidden />
        <p>{message}</p>
      </div>
    </div>
  )
}
