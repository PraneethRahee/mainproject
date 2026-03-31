const VAPID_PUBLIC_KEY_ENDPOINT = '/notifications/push/vapid-public-key'
const SUBSCRIBE_ENDPOINT = '/notifications/push/subscribe'

const SUBSCRIBE_FLAG_KEY = 'pushSubscriptionAttempted_v1'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function ensureWebPushSubscription({ apiRequest, enqueueToast }) {
  // Avoid repeatedly prompting users on every page navigation.
  const alreadyAttempted = window.localStorage.getItem(SUBSCRIBE_FLAG_KEY)
  if (alreadyAttempted === 'true') return { attempted: true, ok: true }

  if (!('Notification' in window)) {
    return { attempted: true, ok: false, error: 'Notifications unsupported' }
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { attempted: true, ok: false, error: 'Push unsupported' }
  }

  window.localStorage.setItem(SUBSCRIBE_FLAG_KEY, 'true')

  try {
    const permission = await window.Notification.requestPermission()
    if (permission !== 'granted') {
      enqueueToast?.('error', 'Notifications permission not granted')
      return { attempted: true, ok: false, error: 'permission denied', permission }
    }

    const resKey = await apiRequest(VAPID_PUBLIC_KEY_ENDPOINT)
    const dataKey = await resKey.json().catch(() => ({}))
    if (!resKey.ok || !dataKey.publicKey) {
      throw new Error(dataKey.error || 'Failed to fetch VAPID public key')
    }

    const vapidPublicKey = dataKey.publicKey
    const appServerKey = urlBase64ToUint8Array(vapidPublicKey)

    const registration = await navigator.serviceWorker.register('/service-worker.js')
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    })

    const res = await apiRequest(SUBSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save subscription')
    }

    enqueueToast?.('success', 'Notifications enabled')
    return { attempted: true, ok: true }
  } catch (err) {
    enqueueToast?.('error', err?.message || 'Failed to enable notifications')
    return { attempted: true, ok: false, error: err?.message || String(err) }
  }
}

