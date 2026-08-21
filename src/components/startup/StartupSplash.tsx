import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { useAppStore } from '../../stores/appStore'

const MESSAGES = [
  'Warming up the blocks...',
  'Finding the last missing chunk...',
  'Sharpening the pickaxe...',
  'Loading absolutely important pixels...',
]

function AquaMark() {
  return (
    <svg className="startup-splash__mark" viewBox="0 0 96 96" aria-label="Aqua loading">
      <path className="startup-splash__segment startup-splash__segment--one" d="M48 10a38 38 0 0 1 31 16L64 38a20 20 0 0 0-16-8Z" />
      <path className="startup-splash__segment startup-splash__segment--two" d="M80 48a32 32 0 0 1-16 28L54 60a18 18 0 0 0 8-15Z" />
      <path className="startup-splash__segment startup-splash__segment--three" d="M48 86A38 38 0 0 1 17 70l15-12a20 20 0 0 0 16 8Z" />
      <path className="startup-splash__segment startup-splash__segment--four" d="M16 48a32 32 0 0 1 16-28l10 16a18 18 0 0 0-8 15Z" />
      <circle className="startup-splash__core" cx="48" cy="48" r="9" />
    </svg>
  )
}

export default function StartupSplash() {
  const { loading, error } = useLauncherData()
  const reduceMotion = useAppStore((state) => state.reduceMotion)
  const [message] = MESSAGES
  const status = error ? 'Launcher data needs attention' : loading ? 'Loading launcher data...' : 'Preparing Home...'

  return (
    <section className={`startup-splash ${reduceMotion ? 'startup-splash--reduced' : ''}`} aria-label="Aqua startup" role="status" aria-live="polite">
      <div className="startup-splash__glow startup-splash__glow--top" />
      <div className="startup-splash__glow startup-splash__glow--bottom" />
      <div className="startup-splash__content">
        <div className="startup-splash__loader"><AquaMark /></div>
        <div className="startup-splash__brand"><span>Aqua</span><small>CLIENT</small></div>
        <p className="startup-splash__status">{status}</p>
      </div>
      <p className="startup-splash__message">{message}</p>
    </section>
  )
}
