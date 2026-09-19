import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../stores/appStore'

export default function AppBackground() {
  const reduceMotion = useAppStore((s) => s.reduceMotion)
  const [videoFailed, setVideoFailed] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || reduceMotion || videoFailed) return undefined

    const recoverPlayback = () => {
      if (document.hidden || video.ended) return
      video.play().catch(() => undefined)
    }
    const onVisibility = () => { if (!document.hidden) recoverPlayback() }
    video.addEventListener('pause', recoverPlayback)
    video.addEventListener('stalled', recoverPlayback)
    video.addEventListener('error', recoverPlayback)
    document.addEventListener('visibilitychange', onVisibility)
    recoverPlayback()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      video.removeEventListener('pause', recoverPlayback)
      video.removeEventListener('stalled', recoverPlayback)
      video.removeEventListener('error', recoverPlayback)
    }
  }, [reduceMotion, videoFailed])

  return (
    <div className="app-background" aria-hidden="true">
      {!videoFailed ? (
        <video
          ref={videoRef}
          className="app-background__media"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onError={() => setVideoFailed(true)}
        >
          <source src="/backgrounds/livebg.mp4" type="video/mp4" />
        </video>
      ) : null}
      <div className="app-background__overlay" />
      <div className="app-background__vignette" />
    </div>
  )
}