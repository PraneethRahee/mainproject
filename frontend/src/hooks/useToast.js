import { useState, useEffect, useCallback } from 'react'

/**
 * Hook for managing a queue of toast notifications.
 * Extracts toast state management from Chat.jsx.
 *
 * @returns {object} { enqueueToast, activeToast }
 */
export function useToast() {
  const [toastQueue, setToastQueue] = useState([])
  const [activeToast, setActiveToast] = useState(null)

  /**
   * Add a toast to the queue. It will be displayed after any current toasts.
   * @param {'success' | 'error'} type - Toast type
   * @param {string} text - Toast message
   */
  const enqueueToast = useCallback((type, text) => {
    setToastQueue((q) => [...q, { id: `${Date.now()}-${Math.random()}`, type, text }])
  }, [])

  // Process toast queue - take the next toast when activeToast is null
  useEffect(() => {
    if (activeToast || toastQueue.length === 0) return
    const [next, ...rest] = toastQueue
    setActiveToast(next)
    setToastQueue(rest)
  }, [toastQueue, activeToast])

  // Auto-dismiss active toast after timeout
  useEffect(() => {
    if (!activeToast) return
    const id = setTimeout(() => setActiveToast(null), 2600)
    return () => clearTimeout(id)
  }, [activeToast])

  return {
    enqueueToast,
    activeToast,
    setActiveToast,
  }
}