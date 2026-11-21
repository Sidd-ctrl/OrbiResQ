import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Camera, StreamInfo } from '../types'
import StatusPill from './StatusPill'

interface Props {
  camera: Camera
}

type FeedState =
  | { phase: 'loading' }
  | { phase: 'ready'; info: StreamInfo }
  | { phase: 'error'; message: string }

export default function CameraFeed({ camera }: Props) {
  const [state, setState] = useState<FeedState>({ phase: 'loading' })
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setState({ phase: 'loading' })
    api
      .stream(camera.id)
      .then((info) => {
        if (!cancelled) setState({ phase: 'ready', info })
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ phase: 'error', message: error.message })
      })
    return () => {
      cancelled = true
    }
  }, [camera.id])

  useEffect(() => {
    if (state.phase !== 'ready' || !videoRef.current) return
    const video = videoRef.current
    const info = state.info
    if (info.playback_kind === 'hls' && info.url) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = info.url
        return
      }
      let destroyed = false
      let instance: { destroy: () => void } | null = null
      import('hls.js')
        .then(({ default: Hls }) => {
          if (destroyed || !Hls.isSupported()) return
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false })
          hls.loadSource(info.url as string)
          hls.attachMedia(video)
          instance = hls
        })
        .catch(() => undefined)
      return () => {
        destroyed = true
        instance?.destroy()
      }
    }
    if (info.playback_kind === 'video' && info.url) {
      video.src = info.url
      return
    }
  }, [state])

  return (
    <div className="stack">
      <div className="feed-frame">
        {state.phase === 'loading' ? <span className="spinner" /> : null}

        {state.phase === 'error' ? <span>Feed information unavailable: {state.message}</span> : null}

        {state.phase === 'ready' && state.info.playback_kind === 'unavailable' ? (
          <div style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, color: '#d5dee7', marginBottom: 4 }}>Stream not available</div>
            <div>{state.info.reason ?? 'The source did not pass a connection test.'}</div>
          </div>
        ) : null}

        {state.phase === 'ready' && (state.info.playback_kind === 'hls' || state.info.playback_kind === 'video') ? (
          <video ref={videoRef} controls playsInline muted preload="metadata" />
        ) : null}

        {state.phase === 'ready' && state.info.playback_kind === 'snapshot' && state.info.url ? (
          <img src={state.info.url} alt={`Latest snapshot from ${camera.name}`} />
        ) : null}

        {state.phase === 'ready' && state.info.playback_kind === 'external_page' ? (
          <div style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, color: '#d5dee7', marginBottom: 4 }}>Viewer page only</div>
            <div style={{ marginBottom: 10 }}>
              {state.info.reason ?? 'This source is a public web page, not a machine-playable stream.'}
            </div>
            {state.info.url ? (
              <a className="btn small" href={state.info.url} target="_blank" rel="noreferrer noopener">
                Open source page
              </a>
            ) : null}
          </div>
        ) : null}

        {state.phase === 'ready' && state.info.attribution ? (
          <div className="feed-note">Source: {state.info.attribution}</div>
        ) : null}
      </div>

      <div className="row between">
        <div className="row">
          <StatusPill value={camera.status} dot />
          <span className="muted small">{camera.source_type.replace(/_/g, ' ')}</span>
          <span className="muted small">·</span>
          <span className="muted small">{camera.access_classification}</span>
        </div>
        {camera.distance_km != null ? <span className="mono">{camera.distance_km.toFixed(1)} km</span> : null}
      </div>
    </div>
  )
}
