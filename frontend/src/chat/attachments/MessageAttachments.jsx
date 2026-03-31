import { useEffect, useState } from 'react'
import { VoiceNotePlayer } from '../VoiceNotePlayer.jsx'

function inferAttachmentKind(url, mimeType) {
  const m = (mimeType || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (url && typeof url === 'string' && url.includes('res.cloudinary.com')) {
    if (url.includes('/image/')) return 'image'
    if (url.includes('/video/')) return 'video'
  }
  return 'file'
}

function MessageThreadAttachment({ id, url: directUrl, mimeType, fileName, apiRequest }) {
  const [media, setMedia] = useState(() => ({
    url: directUrl || null,
    mime: mimeType || '',
  }))

  useEffect(() => {
    if (directUrl) {
      setMedia({ url: directUrl, mime: mimeType || '' })
      return
    }
    if (!id) return undefined
    if (typeof apiRequest !== 'function') return undefined

    let cancelled = false
    let objectUrl = null

    ;(async () => {
      try {
        const res = await apiRequest(`/files/${id}/download`)
        if (!res.ok || cancelled) return
        const blob = await res.blob()
        objectUrl = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setMedia({
          url: objectUrl,
          mime: blob.type || mimeType || '',
        })
      } catch {
        if (!cancelled) setMedia({ url: null, mime: mimeType || '' })
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id, directUrl, mimeType, apiRequest])

  const { url, mime } = media
  if (!url) {
    return (
      <div className="gchat-msg-att-item gchat-msg-att-item--fallback">
        {fileName || 'Attachment'}
        {id ? <span className="gchat-msg-att-err"> — could not load preview</span> : null}
      </div>
    )
  }

  const kind = inferAttachmentKind(url, mime)

  if (kind === 'image') {
    return (
      <div className="gchat-msg-att-item">
        <img src={url} alt={fileName || 'Attachment'} className="gchat-msg-att-preview" />
      </div>
    )
  }

  if (kind === 'video') {
    return (
      <div className="gchat-msg-att-item">
        <video src={url} className="gchat-msg-att-preview" controls />
      </div>
    )
  }

  if (kind === 'audio') {
    return (
      <div className="gchat-msg-att-item">
        <VoiceNotePlayer url={url} fileName={fileName} />
      </div>
    )
  }

  return (
    <div className="gchat-msg-att-item">
      <a href={url} target="_blank" rel="noopener noreferrer">
        {fileName || 'Attachment'}
      </a>
    </div>
  )
}

export function MessageAttachments({ message, apiRequest }) {
  const details = message && Array.isArray(message.attachmentDetails) ? message.attachmentDetails : []
  const withRenderable = details.filter((d) => d && (d.url || d.id))
  if (withRenderable.length === 0) return null

  return (
    <div className="gchat-msg-attachments">
      {withRenderable.map((d) => (
        <MessageThreadAttachment
          key={d.id}
          id={d.id}
          url={d.url}
          mimeType={d.mimeType}
          fileName={d.fileName}
          apiRequest={apiRequest}
        />
      ))}
    </div>
  )
}

