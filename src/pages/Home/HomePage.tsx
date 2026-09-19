import { Link } from 'react-router-dom'
import { AlertTriangle, FolderOpen, LoaderCircle, Play, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import Button from '../../components/ui/Button'
import Skeleton from '../../components/ui/Skeleton'
import { useToast } from '../../hooks/useToast'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { formatInstanceHeading } from '../../utils/instanceDisplay'
import { instanceStatus } from '../../utils/instanceStatus'
import * as tauri from '../../utils/tauri'
import { useTranslation } from '../../useTranslation'
import InstanceIcon from '../../components/ui/InstanceIcon'

export default function HomePage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { instances, versions, settings, loading, error, busy, activeInstanceId, selectInstance, refresh, detectJava } = useLauncherData()
  const [importing, setImporting] = useState(false)
  const [running, setRunning] = useState(false)
  const [launchMessage, setLaunchMessage] = useState<string | null>(null)
  const [launchPhase, setLaunchPhase] = useState<string | null>(null)
  const [launchPercent, setLaunchPercent] = useState<number | null>(null)
  const selectedInstance = instances.find((item) => item.id === activeInstanceId) ?? instances[0] ?? null
  const isEmpty = !loading && instances.length === 0
  const instanceName = selectedInstance ? formatInstanceHeading(selectedInstance) : null
  const versionLabel = selectedInstance
    ? `${selectedInstance.mc_version}${selectedInstance.loader && selectedInstance.loader !== 'vanilla' ? ` · ${selectedInstance.loader}` : ''}`
    : versions[0]?.id ?? ''
  const status = loading ? t('common.loading') : selectedInstance ? instanceStatus(selectedInstance) : ''
  const javaReady = Boolean(selectedInstance?.java_path || settings?.java_path || settings?.java_runtime)

  useEffect(() => {
    let cancelled = false
    const refreshRunning = async () => {
      const next = await tauri.isMinecraftRunning().catch(() => false)
      if (!cancelled) setRunning(next)
    }
    void refreshRunning()
    const timer = window.setInterval(() => void refreshRunning(), 1500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    void tauri.listen<{ phase?: string; message?: string; error?: string; code?: number; percent?: number }>('launch-status', (event) => {
      const message = event.message || event.error
      if (message) setLaunchMessage(message)
      if (event.phase) setLaunchPhase(event.phase)
      if (typeof event.percent === 'number') setLaunchPercent(event.percent)
      if (event.phase === 'error') toast.pushToast(message || 'Minecraft launch failed.', 'error')
      if (event.phase === 'exited' && event.message) toast.pushToast(event.message, event.code === 0 ? 'info' : 'error')
    }).then((cleanup) => { unsubscribe = cleanup })
    return () => unsubscribe?.()
  }, [toast])

  async function importInstance() {
    setImporting(true)
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const packagePath = await open({ filters: [{ name: 'Aqua Instance', extensions: ['aquainst'] }], multiple: false, directory: false })
      if (!packagePath || Array.isArray(packagePath)) return
      await tauri.importInstance(packagePath, settings?.mc_dir)
      await refresh()
      toast.pushToast('Instance imported', 'success')
    } catch (error) {
      toast.pushToast(error instanceof Error ? error.message : 'Import failed.', 'error')
    } finally {
      setImporting(false)
    }
  }

  async function launch() {
    if (!selectedInstance) return
    if (settings?.confirm_before_launch && !window.confirm(`Launch ${instanceName}?`)) return
    toast.pushToast(`Launching ${instanceName}...`, 'info')
    try {
      await tauri.launchInstance(selectedInstance)
      toast.pushToast('Launch started.', 'success')
    } catch (err) {
      toast.pushToast(err instanceof Error ? err.message : 'Launch failed.', 'error')
    }
  }

  async function runJavaCheck() {
    const result = await detectJava()
    toast.pushToast(result ? 'Java ready' : 'Java not detected. Check Settings > Java.', result ? 'success' : 'error')
  }

  return (
    <div className="home-page home-rebuild">
      <header className="home-rebuild__header">
        <div><span className="home-rebuild__kicker">AQUA CLIENT</span><h1>Manage Minecraft instances.</h1><p>Install content, check Java, and launch the selected instance.</p></div>
        <Link to="/instances" className="btn btn-ghost"><Plus size={15} />New instance</Link>
      </header>
      <section className="home-focus" aria-label="Quick launch">
        <div className="home-focus__art" aria-hidden="true"><img src="/herobackground.png" alt="" /></div>
        <div className="home-focus__main">
          {loading ? (
            <div className="home-hero__loading"><Skeleton style={{ height: 20, width: 100, marginBottom: 10 }} /><Skeleton style={{ height: 64, width: 360, marginBottom: 14 }} /><Skeleton style={{ height: 16, width: 180 }} /></div>
          ) : isEmpty ? (
            <div className="home-hero__empty"><span className="home-rebuild__kicker">FIRST RUN</span><h2>{t('common.noInstances')}</h2><p>{t('common.createToStart')}</p><Link to="/instances" className="btn btn-aqua btn-lg"><Plus size={18} />{t('common.createInstance')}</Link></div>
          ) : (
            <div className="home-focus__copy">
              <p className="home-rebuild__kicker"><InstanceIcon instance={selectedInstance} size={18} /> SELECTED INSTANCE</p>
              <h2>{instanceName}</h2>
              <label className="home-focus__select" htmlFor="home-instance-select"><span>Switch instance</span><select id="home-instance-select" value={selectedInstance.id} onChange={(event) => void selectInstance(event.target.value)}>{instances.map((instance) => <option key={instance.id} value={instance.id}>{formatInstanceHeading(instance)} · {instance.mc_version}</option>)}</select></label>
              <div className="home-focus__facts"><span>{versionLabel}</span><span className={status === 'Ready' ? 'home-hero__status-ready' : ''}>{status}</span><span>{selectedInstance.mod_count} mods</span></div>
              <div className="home-focus__actions">{running ? <button type="button" className="btn btn-danger btn-lg" onClick={() => void tauri.stopMinecraft().catch((err) => toast.pushToast(err instanceof Error ? err.message : 'Unable to stop Minecraft.', 'error'))}>Stop</button> : <button type="button" className="btn btn-aqua btn-lg" disabled={Boolean(busy) || !javaReady} onClick={() => void launch()}>{busy ? <LoaderCircle size={18} className="spin" /> : <Play size={18} />}{busy ? 'Preparing' : 'Launch'}</button>}<Link to="/content" className="btn btn-ghost"><Settings2 size={16} />Mods</Link></div>
              {(launchMessage || launchPhase) ? <div className="home-launch-status"><span>{launchMessage || launchPhase}</span>{launchPercent !== null ? <span>{Math.round(launchPercent * 100)}%</span> : null}</div> : null}
              <p className="home-hero__note">{`${selectedInstance.pack_count} resource packs · ${selectedInstance.last_played_at ? `Last played ${new Date(selectedInstance.last_played_at * 1000).toLocaleDateString()}` : 'Not played yet'}${!javaReady ? ' · Java required' : ''}`}</p>
            </div>
          )}
        </div>
        {!isEmpty && selectedInstance ? <aside className="home-focus__side"><div className="home-focus__icon"><InstanceIcon instance={selectedInstance} size={52} /></div><span>Runtime</span><strong>{selectedInstance.java_version || 'Auto-resolved Java'}</strong><span>Game directory</span><strong title={selectedInstance.game_dir || 'Default instance folder'}>{selectedInstance.game_dir || 'Default instance folder'}</strong><Link to="/instances" className="btn btn-ghost btn-sm">Instance settings</Link></aside> : null}
      </section>

      {error ? <div className="state-banner state-banner--error" role="alert"><AlertTriangle size={15} /><span>{error}</span><Button variant="ghost" size="sm" onClick={refresh}><RefreshCw size={13} />Retry</Button></div> : null}

      <section className="home-library" aria-labelledby="home-library-title">
        <div className="home-library__header"><div><p className="eyebrow">{t('common.yourLibrary')}</p><h2 id="home-library-title">{t('nav.instances')}</h2></div><div className="home-library__actions"><button type="button" className="btn btn-ghost btn-sm" disabled={importing} onClick={() => void importInstance()}><FolderOpen size={14} />{t('common.import')}</button><Link to="/instances" className="btn btn-ghost btn-sm">{t('common.manage')}</Link></div></div>
        {!instances.length ? <p className="home-empty-copy">Create your first Minecraft instance.</p> : <div className="home-instance-grid">{instances.slice(0, 4).map((instance, index) => { const itemStatus = instanceStatus(instance); const cardStyle = { '--card-index': index } as CSSProperties; return <article key={instance.id} className={`home-instance-card ${instance.id === selectedInstance?.id ? 'active' : ''}`} style={cardStyle}><button type="button" className="home-instance-card__select" onClick={() => void selectInstance(instance.id)}><span className="home-instance-card__art" /><span className="home-instance-card__body"><strong><InstanceIcon instance={instance} size={13} /> {formatInstanceHeading(instance)}</strong><span>{instance.mc_version} · {instance.loader || 'Vanilla'}</span><small>{itemStatus}</small></span></button><button type="button" className="home-instance-card__play" aria-label={`Launch ${formatInstanceHeading(instance)}`} onClick={() => { void selectInstance(instance.id); void tauri.launchInstance(instance) }}><Play size={14} /></button></article> })}</div>}
      </section>

      <div className="home-footer-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => void runJavaCheck()}><Settings2 size={14} />{t('common.checkJava')}</button><Link to="/content" className="btn btn-ghost btn-sm">{t('common.browseContent')}</Link></div>

    </div>
  )
}
