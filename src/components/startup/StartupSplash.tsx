import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { useAppStore } from '../../stores/appStore'
import AppBackground from '../layout/AppBackground'
import LoadingIndicator from '../ui/LoadingIndicator'

export default function StartupSplash() {
  const { loading, error, refresh } = useLauncherData()
  const reduceMotion = useAppStore((state) => state.reduceMotion)
  const status = error ? 'Launcher initialization failed' : loading ? 'Loading instances' : 'Ready'

  return (
    <section className={`startup-splash ${reduceMotion ? 'startup-splash--reduced' : ''}`} aria-label="Aqua startup" role="status" aria-live="polite">
      <AppBackground />
      <div className="startup-splash__content">
        <div className="startup-splash__brand">
          <img src="/favicon.png" alt="" className="startup-splash__logo" />
          <div><strong>Aqua</strong><span>CLIENT</span></div>
        </div>
        <p className="startup-splash__status">{status}</p>
        {!error && loading ? <LoadingIndicator label="Preparing launcher" detail="Reading instances and runtime state" /> : null}
        {error ? <><p className="startup-splash__error">{error}</p><button type="button" className="startup-splash__retry" onClick={() => void refresh()}>Retry</button></> : null}
      </div>
    </section>
  )
}
