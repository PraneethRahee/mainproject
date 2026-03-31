/* eslint-disable no-restricted-globals */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }

  const type = data?.notificationType || 'message'
  const payload = data?.payload || {}

  const title =
    type === 'call'
      ? 'Incoming call'
      : type === 'story'
        ? 'New story'
        : 'New message'

  const body =
    typeof payload?.contentPreview === 'string' && payload.contentPreview.trim()
      ? payload.contentPreview.trim().slice(0, 160)
      : type === 'call'
        ? 'Tap to view call details'
        : type === 'story'
          ? 'Tap to view the story'
          : 'Tap to view the message'

  const tag = `gchat-${type}-${payload?.messageId || payload?.callId || payload?.storyId || 'general'}`

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data,
      renotify: false,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification && event.notification.data ? event.notification.data : {}
  const type = data?.notificationType || 'message'
  const payload = data?.payload || {}

  let url = '/chat'
  if (type === 'message' && payload?.messageId && payload?.conversationId) {
    const messageId = encodeURIComponent(String(payload.messageId))
    const conversationId = encodeURIComponent(String(payload.conversationId))
    url = `/chat?focus=message&conversationId=${conversationId}&messageId=${messageId}`
  } else
  if (type === 'story' && payload?.storyId) {
    const storyId = encodeURIComponent(String(payload.storyId))
    url = `/chat?focus=story&storyId=${storyId}`
  } else if (type === 'call' && payload?.callId) {
    const callId = encodeURIComponent(String(payload.callId))
    url = `/chat?focus=call&callId=${callId}`
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try focusing an existing tab first.
      for (const client of clientList) {
        if (client.url && client.url.includes('/chat')) {
          // Best-effort: if it's the same route but missing deep-link params, replace them.
          try {
            return client.navigate(url)
          } catch {
            return client.focus()
          }
        }
      }

      // Fallback: open chat.
      return self.clients.openWindow(url)
    }),
  )
})

