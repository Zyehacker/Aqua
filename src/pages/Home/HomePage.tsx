import { Link } from 'react-router-dom'
import { AlertTriangle, FolderOpen, LoaderCircle, Play, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import Button from '../../components/ui/Button'
import Skeleton from '../../components/ui/Skeleton'
import { useToast } from '../../hooks/useToast'
import { useLauncherData } from '../../hooks/useLauncherData'
import { formatInstanceHeading } from '../../utils/instanceDisplay'
import * as tauri from '../../utils/tauri'

function instanceStatus(instance: tauri.BackendInstance) {
  const state = instance.install_state?.trim().toLowerCase() ?? ''
  if (state === 'installed' || state === 'ready') return 'Ready'
  if (state.includes('download')) return 'Downloading'
  if (state.includes('install')) return 'Installing'
  if (state.includes('fail') || state.includes('error')) return 'Failed'
  return 'Not installed'
}

export default function HomePage() {
  const toast = useToast()
  const { instances, versions, settings, loading, error, busy, activeInstanceId, selectInstance, refresh, detectJava } = useLauncherData()
  const [importing, setImporting] = useState(false)
  const [running, setRunning] = useState(false)
  const [launchMessage, setLaunchMessage] = useState<string | null>(null)
  const selectedInstance = instances.find((item) => item.id === activeInstanceId) ?? instances[0] ?? null
  const isEmpty = !loading && instances.length === 0
  const instanceName = selectedInstance ? formatInstanceHeading(selectedInstance) : null
  const versionLabel = selectedInstance
    ? `${selectedInstance.mc_version}${selectedInstance.loader && selectedInstance.loader !== 'vanilla' ? ` · ${selectedInstance.loader}` : ''}`
    : versions[0]?.id ?? ''
  const status = loading ? 'Loading...' : selectedInstance ? instanceStatus(selectedInstance) : ''
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
    void tauri.listen<{ phase?: string; message?: string; error?: string; code?: number }>('launch-status', (event) => {
      const message = event.message || event.error
      if (message) setLaunchMessage(message)
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
    <div className="home-page">
      <section className="home-hero" aria-label="Quick launch">
        <div className="home-hero__content">
          {loading ? (
            <div className="home-hero__loading"><Skeleton style={{ height: 20, width: 100, marginBottom: 10 }} /><Skeleton style={{ height: 64, width: 360, marginBottom: 14 }} /><Skeleton style={{ height: 16, width: 180 }} /></div>
          ) : isEmpty ? (
            <div className="home-hero__empty"><p className="home-hero__eyebrow">Aqua Client</p><h1>No instances yet</h1><p>Create an instance to start playing.</p><Link to="/instances" className="btn btn-aqua btn-lg home-hero__launch"><Plus size={18} />Create instance</Link></div>
          ) : (
            <div className="home-hero__instance">
              <p className="home-hero__eyebrow">Current instance</p>
              <h1 className="home-hero__name">{instanceName}</h1>
              <div className="home-hero__meta"><span>{versionLabel}</span><span className={status === 'Ready' ? 'home-hero__status-ready' : ''}>{status}</span>{selectedInstance?.loader_version ? <span>{selectedInstance.loader_version}</span> : null}</div>
              <div className="home-hero__actions">{running ? <button type="button" className="btn btn-danger btn-lg home-hero__launch" onClick={() => void tauri.stopMinecraft().catch((err) => toast.pushToast(err instanceof Error ? err.message : 'Unable to stop Minecraft.', 'error'))}>Stop</button> : <button type="button" className="btn btn-aqua btn-lg home-hero__launch" disabled={Boolean(busy) || !javaReady} onClick={() => void launch()}>{busy ? <LoaderCircle size={18} className="spin" /> : <Play size={18} />}Launch</button>}<Link to="/instances" className="btn btn-ghost"><Settings2 size={16} />Instance settings</Link>{running ? <Link to="/logs" className="btn btn-ghost">View logs</Link> : null}</div>
              <p className="home-hero__note">{launchMessage || `${selectedInstance.mod_count} mods · ${selectedInstance.pack_count} resource packs · ${selectedInstance.last_played_at ? `Last played ${new Date(selectedInstance.last_played_at * 1000).toLocaleDateString()}` : 'Not played yet'}${!javaReady ? ' · Java required' : ''}`}</p>
            </div>
          )}
        </div>
      </section>

      {error ? <div className="state-banner state-banner--error" role="alert"><AlertTriangle size={15} /><span>{error}</span><Button variant="ghost" size="sm" onClick={refresh}><RefreshCw size={13} />Retry</Button></div> : null}

      <section className="home-library" aria-labelledby="home-library-title">
        <div className="home-library__header"><div><p className="eyebrow">Your library</p><h2 id="home-library-title">Instances</h2></div><div className="home-library__actions"><button type="button" className="btn btn-ghost btn-sm" disabled={importing} onClick={() => void importInstance()}><FolderOpen size={14} />Import</button><Link to="/instances" className="btn btn-ghost btn-sm">Manage</Link></div></div>
        {!instances.length ? <p className="home-empty-copy">Create your first Minecraft instance.</p> : <div className="home-instance-grid">{instances.slice(0, 4).map((instance, index) => { const itemStatus = instanceStatus(instance); const cardStyle = { '--card-index': index } as CSSProperties; return <article key={instance.id} className={`home-instance-card ${instance.id === selectedInstance?.id ? 'active' : ''}`} style={cardStyle}><button type="button" className="home-instance-card__select" onClick={() => void selectInstance(instance.id)}><span className="home-instance-card__art" /><span className="home-instance-card__body"><strong>{formatInstanceHeading(instance)}</strong><span>{instance.mc_version} · {instance.loader || 'Vanilla'}</span><small>{itemStatus}</small></span></button><button type="button" className="home-instance-card__play" aria-label={`Launch ${formatInstanceHeading(instance)}`} onClick={() => { void selectInstance(instance.id); void tauri.launchInstance(instance) }}><Play size={14} /></button></article> })}</div>}
      </section>

      <div className="home-footer-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => void runJavaCheck()}><Settings2 size={14} />Check Java</button><Link to="/content" className="btn btn-ghost btn-sm">Browse content</Link></div>
    </div>
  )
}
