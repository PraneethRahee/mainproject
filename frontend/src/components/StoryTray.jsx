import { useEffect, useMemo, useState } from 'react'

function initialsFromString(value) {
  const s = String(value ?? '').trim()
  if (!s) return '?'
  const compact = s.replace(/\s+/g, '')
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase()
  return s.slice(0, 2).toUpperCase()
}

function msToCompactClock(ms) {
  const safe = Number.isFinite(ms) ? ms : 0
  if (safe <= 0) return 'now'
  const s = Math.floor(safe / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function removeStoryFocusQuery() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('focus') !== 'story') return
    params.delete('focus')
    params.delete('storyId')
    const qs = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  } catch {
    // ignore
  }
}

export default function StoryTray({ apiRequest, enqueueToast, user, initialStoryId }) {
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [viewerStory, setViewerStory] = useState(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerText, setComposerText] = useState('')
  const [composerSaving, setComposerSaving] = useState(false)
  const [composerAudienceType, setComposerAudienceType] = useState('everyone') // everyone|whitelist
  const [composerAudienceQuery, setComposerAudienceQuery] = useState('')
  const [composerAudienceCandidates, setComposerAudienceCandidates] = useState([])
  const [composerAudienceLoading, setComposerAudienceLoading] = useState(false)
  const [composerAudienceError, setComposerAudienceError] = useState('')
  const [composerAudienceSelected, setComposerAudienceSelected] = useState([])

  const [receiptsLoading, setReceiptsLoading] = useState(false)
  const [receiptsError, setReceiptsError] = useState('')
  const [receipts, setReceipts] = useState([])

  const viewerAuthorInitials = useMemo(() => {
    if (!viewerStory?.author?.displayName) return '?'
    return initialsFromString(viewerStory.author.displayName)
  }, [viewerStory])

  const latestByAuthor = useMemo(() => {
    const map = new Map()
    for (const s of stories || []) {
      const aid = String(s.authorId || '')
      if (!aid) continue
      if (!map.has(aid)) map.set(aid, s)
    }
    return Array.from(map.values())
  }, [stories])

  const refresh = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await apiRequest('/stories/feed?limit=50')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to fetch stories')
      setStories(Array.isArray(data.stories) ? data.stories : [])
    } catch (err) {
      setLoadError(err?.message || 'Failed to load stories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Load once per page load.
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!initialStoryId) return
    if (viewerStory) return

    let cancelled = false
    const loadStory = async () => {
      try {
        const res = await apiRequest(`/stories/${encodeURIComponent(initialStoryId)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load story')
        if (cancelled) return

        setViewerStory({
          id: data.id,
          authorId: data.authorId,
          author: data.author,
          kind: data.kind,
          content: data.content,
          expiresAt: data.expiresAt,
          audienceType: data.audienceType,
          hasViewed: Boolean(data.hasViewed),
          viewCount: data.viewCount,
          createdAt: data.createdAt,
        })
        removeStoryFocusQuery()
      } catch (err) {
        // Best-effort: if deep link fails, do nothing.
        console.error('Failed to deep-link story', err)
      }
    }

    void loadStory()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStoryId])

  useEffect(() => {
    if (composerAudienceType !== 'whitelist') return
    const q = composerAudienceQuery.trim()
    if (!q) {
      setComposerAudienceCandidates([])
      setComposerAudienceError('')
      setComposerAudienceLoading(false)
      return
    }

    let cancelled = false
    setComposerAudienceLoading(true)
    setComposerAudienceError('')
    const id = window.setTimeout(async () => {
      try {
        const res = await apiRequest(`/users/search?query=${encodeURIComponent(q)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Search failed')
        if (cancelled) return
        setComposerAudienceCandidates(Array.isArray(data.users) ? data.users : [])
      } catch (err) {
        if (!cancelled) setComposerAudienceError(err?.message || 'Search failed')
      } finally {
        if (!cancelled) setComposerAudienceLoading(false)
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerAudienceType, composerAudienceQuery])

  useEffect(() => {
    if (!viewerStory) return

    let cancelled = false
    setReceipts([])
    setReceiptsError('')
    setReceiptsLoading(false)
    const markViewed = async () => {
      try {
        await apiRequest(`/stories/${viewerStory.id}/view`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (cancelled) return
        setStories((cur) =>
          Array.isArray(cur)
            ? cur.map((s) => (String(s.id) === String(viewerStory.id) ? { ...s, hasViewed: true } : s))
            : cur,
        )
      } catch {
        // best-effort; viewer can still show content even if receipt fails
      }
    }

    const loadReceipts = async () => {
      setReceiptsLoading(true)
      try {
        const res = await apiRequest(`/stories/${viewerStory.id}/receipts`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to fetch receipts')
        if (cancelled) return
        setReceipts(Array.isArray(data.receipts) ? data.receipts : [])
      } catch (err) {
        if (!cancelled) setReceiptsError(err?.message || 'Failed to load receipts')
      } finally {
        if (!cancelled) setReceiptsLoading(false)
      }
    }

    void markViewed()
    void loadReceipts()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerStory?.id])

  const submitStory = async () => {
    if (!user?.id) return
    const text = composerText.trim()
    if (!text) {
      enqueueToast('error', 'Story content cannot be empty')
      return
    }

    setComposerSaving(true)
    try {
      const audienceType = composerAudienceType === 'whitelist' ? 'whitelist' : 'everyone'
      const audienceUserIds = audienceType === 'whitelist' ? composerAudienceSelected : []

      const res = await apiRequest('/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          privacy: {
            audienceType,
            audienceUserIds,
          },
          expiresInMinutes: 24 * 60,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to post story')

      enqueueToast('success', 'Story posted')
      setComposerText('')
      setComposerOpen(false)
      setComposerAudienceType('everyone')
      setComposerAudienceQuery('')
      setComposerAudienceCandidates([])
      setComposerAudienceSelected([])
      await refresh()
    } catch (err) {
      enqueueToast('error', err?.message || 'Failed to post story')
    } finally {
      setComposerSaving(false)
    }
  }

  const trayTitle = stories.length > 0 ? 'Stories' : 'No stories yet'

  return (
    <>
      <div
        className="gchat-story-tray"
        aria-label={trayTitle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(0,0,0,0.25)',
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          className="gchat-story-tray-add"
          onClick={() => setComposerOpen(true)}
          aria-label="Post a story"
          title="Post a story"
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.16)',
            background: 'rgba(255,255,255,0.06)',
            color: '#fff',
            fontSize: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flex: '0 0 auto',
          }}
        >
          +
        </button>

        {loading && <div style={{ opacity: 0.8, fontSize: 13 }}>Loading…</div>}
        {!loading && loadError && <div style={{ opacity: 0.8, fontSize: 13 }}>{loadError}</div>}

        {!loading && !loadError && latestByAuthor.length === 0 && (
          <div style={{ opacity: 0.8, fontSize: 13 }}>No one has posted stories yet.</div>
        )}

        {!loading &&
          !loadError &&
          latestByAuthor.map((s) => {
            const author = s.author || {}
            const initials = initialsFromString(author.displayName || author.id)
            return (
              <button
                key={String(s.id)}
                type="button"
                onClick={() => setViewerStory(s)}
                aria-label={`View story from ${author.displayName || 'unknown'}`}
                title={author.displayName || 'unknown'}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.16)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flex: '0 0 auto',
                  boxShadow: s.hasViewed ? 'none' : '0 0 0 2px rgba(65, 168, 255, 0.95)',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700 }}>{initials}</span>
              </button>
            )
          })}
      </div>

      {viewerStory && (
        <div
          className="gchat-story-viewer-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Story viewer"
          onClick={() => setViewerStory(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            className="gchat-story-viewer"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(760px, 96vw)',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(18,18,18,0.88)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.16)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    background: 'rgba(255,255,255,0.06)',
                    flex: '0 0 auto',
                    boxShadow: viewerStory.hasViewed ? 'none' : '0 0 0 2px rgba(65, 168, 255, 0.95)',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{viewerAuthorInitials}</span>
                </div>
                <div>
                  <div style={{ fontWeight: 800 }}>
                    {viewerStory.author?.displayName || 'Story'}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Expires in {msToCompactClock(new Date(viewerStory.expiresAt).getTime() - Date.now())}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="gchat-icon-btn"
                onClick={() => {
                  removeStoryFocusQuery()
                  setViewerStory(null)
                }}
                aria-label="Close story viewer"
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 18 }}>
              <div
                style={{
                  padding: 16,
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.03)',
                  color: '#fff',
                  minHeight: 140,
                  lineHeight: 1.45,
                  wordBreak: 'break-word',
                }}
                // Backend sanitizes story content.
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: viewerStory.content || '' }}
              />

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                  Viewed by {typeof viewerStory.viewCount === 'number' ? viewerStory.viewCount : receipts.length} people
                </div>
                {receiptsLoading && <div style={{ opacity: 0.8, fontSize: 13 }}>Loading receipts…</div>}
                {receiptsError && <div style={{ opacity: 0.8, fontSize: 13 }}>{receiptsError}</div>}
                {!receiptsLoading && !receiptsError && receipts.length > 0 && (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {receipts.slice(0, 12).map((r) => (
                      <div
                        key={String(r.userId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 10px',
                          borderRadius: 12,
                          border: '1px solid rgba(255,255,255,0.10)',
                          background: 'rgba(255,255,255,0.02)',
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            border: '1px solid rgba(255,255,255,0.16)',
                            background: 'rgba(255,255,255,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 11,
                            color: '#fff',
                            flex: '0 0 auto',
                          }}
                        >
                          {initialsFromString(r.displayName || r.email || r.userId)}
                        </div>
                        <div style={{ fontSize: 13, opacity: 0.9, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.displayName || r.email || 'Unknown'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {composerOpen && (
        <div
          className="gchat-story-composer-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Post story"
          onClick={() => setComposerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 51,
            padding: 16,
          }}
        >
          <div
            className="gchat-story-composer"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(680px, 96vw)',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(18,18,18,0.92)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontWeight: 900 }}>Post a story</div>
              <button
                type="button"
                className="gchat-icon-btn"
                onClick={() => setComposerOpen(false)}
                aria-label="Close story composer"
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 18 }}>
              <label className="gchat-info-sub" style={{ display: 'block', opacity: 0.85, marginBottom: 8 }}>
                Story text (max 2000 chars)
              </label>
              <textarea
                value={composerText}
                disabled={composerSaving}
                onChange={(e) => setComposerText(e.target.value)}
                placeholder="What’s happening?"
                style={{
                  width: '100%',
                  minHeight: 120,
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.03)',
                  color: '#fff',
                  resize: 'vertical',
                }}
              />

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Privacy</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="gchat-info-admin-btn"
                    disabled={composerSaving}
                    onClick={() => setComposerAudienceType('everyone')}
                    style={{
                      borderColor: composerAudienceType === 'everyone' ? 'rgba(65, 168, 255, 0.65)' : undefined,
                      opacity: composerAudienceType === 'everyone' ? 1 : 0.85,
                    }}
                  >
                    Everyone
                  </button>
                  <button
                    type="button"
                    className="gchat-info-admin-btn"
                    disabled={composerSaving}
                    onClick={() => setComposerAudienceType('whitelist')}
                    style={{
                      borderColor: composerAudienceType === 'whitelist' ? 'rgba(65, 168, 255, 0.65)' : undefined,
                      opacity: composerAudienceType === 'whitelist' ? 1 : 0.85,
                    }}
                  >
                    Only selected
                  </button>
                </div>

                {composerAudienceType === 'whitelist' && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Select who can view</div>
                    <input
                      type="search"
                      value={composerAudienceQuery}
                      placeholder="Search by name/email…"
                      onChange={(e) => {
                        const v = e.target.value
                        setComposerAudienceQuery(v)
                      }}
                      disabled={composerSaving}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(255,255,255,0.03)',
                        color: '#fff',
                        marginBottom: 10,
                      }}
                    />

                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
                      Selected: {composerAudienceSelected.length}
                    </div>

                    {composerAudienceLoading && <div style={{ opacity: 0.8, fontSize: 13 }}>Searching…</div>}
                    {composerAudienceError && <div style={{ opacity: 0.8, fontSize: 13 }}>{composerAudienceError}</div>}

                    {!composerAudienceLoading && !composerAudienceError && composerAudienceQuery.trim() && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflow: 'auto', paddingRight: 6 }}>
                        {composerAudienceCandidates.map((c) => {
                          const cid = String(c.id || c._id)
                          const already = composerAudienceSelected.some((id) => String(id) === cid)
                          return (
                            <button
                              key={cid}
                              type="button"
                              className="gchat-info-admin-btn"
                              disabled={composerSaving}
                              onClick={() => {
                                if (already) {
                                  setComposerAudienceSelected((cur) => cur.filter((id) => String(id) !== cid))
                                } else {
                                  setComposerAudienceSelected((cur) => Array.from(new Set([...cur, cid])))
                                }
                              }}
                              style={{
                                textAlign: 'left',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 10,
                                padding: '10px 12px',
                              }}
                            >
                              <span style={{ fontSize: 13, fontWeight: 800, opacity: 0.95 }}>
                                {c.displayName || c.email || cid}
                              </span>
                              <span style={{ fontSize: 12, opacity: 0.85 }}>{already ? 'Selected' : 'Select'}</span>
                            </button>
                          )
                        })}
                        {composerAudienceCandidates.length === 0 && (
                          <div style={{ opacity: 0.8, fontSize: 13 }}>No matches.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="gchat-info-admin-btn"
                  onClick={() => setComposerOpen(false)}
                  disabled={composerSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="gchat-info-admin-btn gchat-info-admin-btn--danger"
                  onClick={() => void submitStory()}
                  disabled={composerSaving}
                >
                  {composerSaving ? 'Posting…' : 'Post story'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


