import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useAppStore } from '../../stores/appStore'

export default function AppBackground({ home = false }: { home?: boolean }) {
  const reduceMotion = useAppStore((s) => s.reduceMotion)
  const backgroundMotion = useAppStore((s) => s.backgroundMotion)
  const backgroundBlur = useAppStore((s) => s.backgroundBlur)
  const backgroundMode = useAppStore((s) => s.backgroundMode)
  const [videoFailedMode, setVideoFailedMode] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const lastVideoTimeRef = useRef(0)
  const frozenSinceRef = useRef<number | null>(null)
  const videoFailed = videoFailedMode === backgroundMode

  const recoverPlayback = () => {
    const video = videoRef.current
    if (!video || document.hidden || video.ended) return
    video.play().catch(() => undefined)
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video || reduceMotion || !backgroundMotion || videoFailed || (backgroundMode !== 'default' && backgroundMode !== 'video')) {
      if (video) video.pause()
      return undefined
    }

    const onVisibility = () => { if (!document.hidden) recoverPlayback() }
    const watchdog = window.setInterval(() => {
      if (document.hidden || video.paused || video.ended || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      const currentTime = video.currentTime
      if (Math.abs(currentTime - lastVideoTimeRef.current) < 0.01) {
        frozenSinceRef.current ??= Date.now()
        if (Date.now() - frozenSinceRef.current > 2500) {
          frozenSinceRef.current = null
          video.load()
          recoverPlayback()
        }
      } else {
        lastVideoTimeRef.current = currentTime
        frozenSinceRef.current = null
      }
    }, 1500)
    video.addEventListener('pause', recoverPlayback)
    video.addEventListener('stalled', recoverPlayback)
    video.addEventListener('loadeddata', recoverPlayback)
    video.addEventListener('canplay', recoverPlayback)
    video.addEventListener('waiting', recoverPlayback)
    document.addEventListener('visibilitychange', onVisibility)
    recoverPlayback()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      video.removeEventListener('loadeddata', recoverPlayback)
      video.removeEventListener('pause', recoverPlayback)
      video.removeEventListener('stalled', recoverPlayback)
      video.removeEventListener('canplay', recoverPlayback)
      video.removeEventListener('waiting', recoverPlayback)
      window.clearInterval(watchdog)
    }
  }, [backgroundMode, backgroundMotion, reduceMotion, videoFailed])

  return (
    <div className={`app-background ${home ? 'app-background--home' : 'app-background--surface'} app-background--${backgroundMode}`} style={{ '--background-blur': `${backgroundBlur}px` } as CSSProperties} aria-hidden="true">
      {videoFailed ? <img className="app-background__fallback" src="/backgrounds/background1.png" alt="" /> : null}
      {!videoFailed && (backgroundMode === 'default' || backgroundMode === 'video') ? (
        <video
          ref={videoRef}
          className="app-background__media"
          autoPlay={backgroundMotion && !reduceMotion}
          loop
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={recoverPlayback}
          onCanPlay={recoverPlayback}
          onError={() => setVideoFailedMode(backgroundMode)}
        >
          <source src="/backgrounds/livebg.mp4" type="video/mp4" />
        </video>
      ) : null}
      <div className="app-background__overlay" />
      <div className="app-background__vignette" />
    </div>
  )
}
