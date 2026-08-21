import { useEffect, useMemo, useState } from 'react'
import { getAccount } from '../../utils/tauri'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { useAppStore } from '../../stores/appStore'

const STARTUP_TIMING = { greetingEnd: 1500, loaderEnd: 6500, revealEnd: 8500, finish: 10000, exit: 520 } as const
type StartupStage = 'greeting' | 'loading' | 'reveal' | 'finish'

function AquaMark() {
  return (
    <svg className="startup-splash__mark" viewBox="0 0 96 96" role="img" aria-label="Aqua loading">
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
  const [stage, setStage] = useState<StartupStage>('greeting')
  const [exiting, setExiting] = useState(false)
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getAccount().then((account) => {
      if (!cancelled && account?.username?.trim()) setUsername(account.username.trim())
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const timing = reduceMotion ? { greeting: 700, loading: 1800, reveal: 2600 } : { greeting: STARTUP_TIMING.greetingEnd, loading: STARTUP_TIMING.loaderEnd, reveal: STARTUP_TIMING.revealEnd }
    const timers = [
      window.setTimeout(() => setStage('loading'), timing.greeting),
      window.setTimeout(() => setStage('reveal'), timing.loading),
      window.setTimeout(() => setStage('finish'), timing.reveal),
    ]
    return () => timers.forEach(window.clearTimeout)
  }, [reduceMotion])

  const ready = !loading && stage === 'finish'
  useEffect(() => {
    if (!ready) return undefined
    const exitStart = window.setTimeout(() => setExiting(true), 0)
    const timer = window.setTimeout(() => setExiting(false), reduceMotion ? 120 : STARTUP_TIMING.exit)
    return () => {
      window.clearTimeout(exitStart)
      window.clearTimeout(timer)
    }
  }, [ready, reduceMotion])

  const status = useMemo(() => {
    if (error) return 'Launcher data needs attention'
    if (loading) return stage === 'greeting' ? 'Starting Aqua...' : stage === 'loading' ? 'Loading launcher data...' : stage === 'reveal' ? 'Preparing instances...' : 'Finishing startup...'
    return 'Ready'
  }, [error, loading, stage])

  if (ready && !exiting) return null

  return (
    <div className={`startup-splash startup-splash--${stage} ${exiting ? 'startup-splash--exiting' : ''}`} role="status" aria-live="polite">
      <div className="startup-splash__content">
        {stage === 'greeting' ? <p className="startup-splash__greeting">{username ? `Welcome back, ${username}` : 'Welcome back'}</p> : null}
        <div className="startup-splash__loader"><AquaMark /></div>
        <div className="startup-splash__brand"><span>Aqua</span><small>CLIENT</small></div>
        <p className="startup-splash__status">{status}</p>
      </div>
    </div>
  )
}
