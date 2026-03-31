export function ChatToast({ activeToast, onDismiss }) {
  if (!activeToast) return null
  return (
    <div
      className={`gchat-toast${
        activeToast.type === 'error' ? ' gchat-toast--error' : ' gchat-toast--success'
      }`}
      role="status"
      aria-live="polite"
    >
      <span>{activeToast.text}</span>
      <button
        type="button"
        className="gchat-toast-close"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  )
}
