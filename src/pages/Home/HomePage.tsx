import { Link } from 'react-router-dom'
import { AlertTriangle, LoaderCircle, Play, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import Skeleton from '../../components/ui/Skeleton'
import InstanceIcon from '../../components/ui/InstanceIcon'
import ServerBrowser from '../../components/server/ServerBrowser'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { Magnet } from '../../components/motion'
import { useToast } from '../../hooks/useToast'
import { formatInstanceHeading } from '../../utils/instanceDisplay'
import { instanceStatus } from '../../utils/instanceStatus'
import * as tauri from '../../utils/tauri'

export default function HomePage() {
  const toast = useToast()
  const { instances, settings, loading, error, busy, activeInstanceId, selectInstance, refresh } = useLauncherData()
  const [running, setRunning] = useState(false)
  const [launchMessage, setLaunchMessage] = useState<string | null>(null)
  const selectedInstance = instances.find((item) => item.id === activeInstanceId) ?? instances[0] ?? null
  const javaReady = Boolean(selectedInstance?.java_path || settings?.java_path || settings?.java_runtime)

  useEffect(() => {
    let cancelled = false
    const check = async () => { const value = await tauri.isMinecraftRunning().catch(() => false); if (!cancelled) setRunning(value) }
    void check()
    const timer = window.setInterval(() => void check(), 2500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    let dispose: (() => void) | null = null
    void tauri.listen<{ phase?: string; message?: string; error?: string }>('launch-status', (event) => {
      const message = event.message || event.error
      if (message) setLaunchMessage(message)
      if (event.phase === 'error') toast.pushToast(message || 'Minecraft launch failed.', 'error')
    }).then((cleanup) => { dispose = cleanup })
    return () => dispose?.()
  }, [toast])

  const launch = async () => {
    if (!selectedInstance) return
    if (settings?.confirm_before_launch && !window.confirm(`Launch ${formatInstanceHeading(selectedInstance)}?`)) return
    setLaunchMessage('Preparing Minecraft…')
    try { await tauri.launchInstance(selectedInstance); toast.pushToast('Launch started.', 'success') }
    catch (err) { setLaunchMessage(err instanceof Error ? err.message : 'Launch failed.'); toast.pushToast(err instanceof Error ? err.message : 'Launch failed.', 'error') }
  }

  return (
    <main className="home-page home-compact">
      <header className="home-compact__header"><div><p className="eyebrow">AQUA CLIENT</p><h1>Ready when you are.</h1><p className="page-subtitle">Choose an instance, then launch Minecraft.</p></div><Link to="/instances" className="btn btn-ghost btn-sm"><Plus size={14} />New instance</Link></header>
      <div className="home-compact__grid">
        <section className="home-launch-card" aria-labelledby="quick-launch-title">
          <div className="home-launch-card__top"><span className="home-card-label">SELECTED INSTANCE</span>{selectedInstance ? <InstanceIcon instance={selectedInstance} size={20} /> : null}</div>
          {loading ? <div className="home-compact__loading"><Skeleton style={{ width: 240, height: 34 }} /><Skeleton style={{ width: 160, height: 14 }} /></div> : selectedInstance ? <>
            <h2 id="quick-launch-title">{formatInstanceHeading(selectedInstance)}</h2>
            <label className="home-instance-select" htmlFor="home-instance-select"><span>Instance</span><select id="home-instance-select" value={selectedInstance.id} onChange={(event) => void selectInstance(event.target.value)}>{instances.map((instance) => <option value={instance.id} key={instance.id}>{formatInstanceHeading(instance)} · {instance.mc_version}</option>)}</select></label>
            <div className="home-launch-card__facts"><span>{selectedInstance.mc_version}</span><span>{selectedInstance.loader || 'Vanilla'}</span><span className={instanceStatus(selectedInstance) === 'Ready' ? 'is-ready' : ''}>{instanceStatus(selectedInstance)}</span></div>
            <div className="home-launch-card__actions">{running ? <button type="button" className="btn btn-danger btn-lg" onClick={() => void tauri.stopMinecraft()}><span className="status-dot" />Stop</button> : <Magnet strength={2}><button type="button" className="btn btn-aqua btn-lg" disabled={Boolean(busy) || !javaReady} onClick={() => void launch()}>{busy ? <LoaderCircle size={17} className="spin" /> : <Play size={17} />}{busy ? 'Preparing' : javaReady ? 'Launch' : 'Java required'}</button></Magnet>}<Link to="/instances" className="btn btn-ghost btn-sm"><Settings2 size={14} />Manage</Link></div>
            {launchMessage ? <p className="home-launch-card__message" role="status">{launchMessage}</p> : null}<p className="home-launch-card__meta">{selectedInstance.mod_count} mods · {selectedInstance.pack_count} resource packs{selectedInstance.java_version ? ` · Java ${selectedInstance.java_version}` : ''}</p>
          </> : <div className="home-empty"><h2 id="quick-launch-title">No instance yet</h2><p>Create or import an instance to start playing.</p><Link to="/instances" className="btn btn-aqua"><Plus size={15} />Create instance</Link></div>}
        </section>
        <aside className="home-compact__rail"><section className="home-news-card" aria-labelledby="news-title"><div className="home-card-heading"><span className="home-card-label">AQUA UPDATES</span><span className="home-card-heading__mark">01</span></div><h2 id="news-title">A quieter, faster launcher.</h2><p>Manage instances, install Modrinth content, and get into the game without the clutter.</p><Link to="/content" className="text-link">Browse content →</Link></section><ServerBrowser /></aside>
      </div>
      {error ? <div className="state-banner state-banner--error" role="alert"><AlertTriangle size={15} /><span>{error}</span><Button variant="ghost" size="sm" onClick={refresh}><RefreshCw size={13} />Retry</Button></div> : null}
    </main>
  )
}
