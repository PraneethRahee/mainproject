import { useEffect, useRef, useState } from 'react'

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function VoiceNotePlayer({ url, fileName }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [rate, setRate] = useState(1)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined

    const onLoaded = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onTime = () => setCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => setIsPlaying(false)

    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [url])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return
    try {
      if (audio.paused) {
        audio.playbackRate = rate
        await audio.play()
      } else {
        audio.pause()
      }
    } catch {
      // If playback is blocked, keep UI conservative (user may need to interact again).
      setIsPlaying(false)
    }
  }

  const seekTo = (t) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = t
    setCurrentTime(t)
  }

  const playbackRates = [0.75, 1, 1.25, 1.5]

  return (
    <div
      className="gchat-voice-player"
      role="group"
      aria-label={`Voice note: ${fileName || 'audio'}`}
      onClick={(e) => {
        e.stopPropagation()
        const target = e.target
        if (target instanceof Element) {
          if (target.closest('button')) return
          if (target.closest('input')) return
        }
        void togglePlay()
      }}
    >
      <audio ref={audioRef} src={url} preload="metadata" style={{ display: 'none' }} />
      <div className="gchat-voice-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="gchat-icon-btn" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? '❚❚' : '►'}
        </button>
        <div style={{ flex: 1, minWidth: 120 }}>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => seekTo(parseFloat(e.target.value || '0'))}
            aria-label="Seek"
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.8 }}>
            <span>{formatSeconds(currentTime)}</span>
            <span>{formatSeconds(duration)}</span>
          </div>
        </div>
      </div>
      <div className="gchat-voice-speeds" style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {playbackRates.map((r) => (
          <button
            key={r}
            type="button"
            className="gchat-icon-btn"
            onClick={() => {
              setRate(r)
              const audio = audioRef.current
              if (audio) audio.playbackRate = r
            }}
            aria-label={`Playback speed ${r}x`}
            style={{
              padding: '6px 10px',
              opacity: rate === r ? 1 : 0.7,
              borderColor: rate === r ? 'currentColor' : 'transparent',
            }}
          >
            {r}x
          </button>
        ))}
      </div>
    </div>
  )
}

export function VoiceNotePlayerFromFile({ fileId, fileName, apiRequest }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let nextObjectUrl = null

    const run = async () => {
      if (!fileId) return
      if (typeof apiRequest !== 'function') return
      setLoading(true)
      setError('')
      try {
        const res = await apiRequest(`/files/${fileId}/download`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to download audio')
        }
        const blob = await res.blob()
        if (cancelled) return
        nextObjectUrl = URL.createObjectURL(blob)
        setObjectUrl(nextObjectUrl)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load audio')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl)
    }
  }, [fileId, apiRequest])

  if (error) {
    return (
      <div className="gchat-media-doc" style={{ padding: 10, borderRadius: 10 }}>
        {fileName || 'Audio'}
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{error}</div>
      </div>
    )
  }

  if (loading || !objectUrl) {
    return (
      <div className="gchat-media-doc" style={{ padding: 10, borderRadius: 10 }}>
        {fileName || 'Audio'}
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>Loading…</div>
      </div>
    )
  }

  return <VoiceNotePlayer url={objectUrl} fileName={fileName} />
}

