import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe, Play, Plus, Trash2 } from 'lucide-react'
import { useToast } from '../../hooks/useToast'
import { launchInstance, pingServer, type ServerInfo } from '../../utils/tauri'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { useAppStore } from '../../stores/appStore'

type TrackedServer = { entry: string; port: number }

const DEFAULT_SERVERS: TrackedServer[] = [
  { entry: 'play.hypixel.net', port: 25565 },
  { entry: 'mc.hypixel.net', port: 25565 },
]

function sanitizeEntry(raw: string): { entry: string; port: number } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.includes(':')) {
    const idx = trimmed.lastIndexOf(':')
    const host = trimmed.slice(0, idx)
    const port = Number(trimmed.slice(idx + 1))
    if (host && Number.isInteger(port) && port > 0 && port < 65536) return { entry: host, port }
  }
  return { entry: trimmed, port: 25565 }
}

function readFavorites(): TrackedServer[] {
  try {
    const raw = window.localStorage.getItem('aqua.servers')
    if (!raw) return DEFAULT_SERVERS
    const parsed = JSON.parse(raw) as TrackedServer[]
    return Array.isArray(parsed) ? parsed : DEFAULT_SERVERS
  } catch {
    return DEFAULT_SERVERS
  }
}

function latencyColor(ping?: number | null) {
  if (ping == null) return 'var(--muted)'
  if (ping <= 80) return 'var(--success)'
  if (ping <= 200) return 'var(--warning)'
  return 'var(--danger)'
}

export default function ServerBrowser() {
  const toast = useToast()
  const { activeInstance } = useLauncherData()
  const reduceMotion = useAppStore((s) => s.reduceMotion)
  const [servers, setServers] = useState<TrackedServer[]>(() => readFavorites())
  const [newEntry, setNewEntry] = useState('')
  const [statuses, setStatuses] = useState<Record<string, ServerInfo>>({})
  const [pinging, setPinging] = useState<Record<string, boolean>>({})
  const timersRef = useRef<Record<string, number>>({})

  const persist = useCallback((list: TrackedServer[]) => {
    try { window.localStorage.setItem('aqua.servers', JSON.stringify(list)) } catch { /* ignore */ }
  }, [])

  const pingOne = useCallback(async (server: TrackedServer) => {
    const key = `${server.entry}:${server.port}`
    setPinging((p) => ({ ...p, [key]: true }))
    try {
      const res = await pingServer(server.entry, server.port)
      const first = res?.[0]
      setStatuses((prev) => ({ ...prev, [key]: first ?? { host: server.entry, port: server.port, error: 'No response' } }))
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [key]: { host: server.entry, port: server.port, error: err instanceof Error ? err.message : 'Ping failed' } }))
    } finally {
      setPinging((p) => ({ ...p, [key]: false }))
    }
  }, [])

  // Initial pings
  useEffect(() => {
    servers.forEach((s) => void pingOne(s))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic refresh (every 30s) only while visible & motion allowed
  useEffect(() => {
    if (reduceMotion) return undefined
    if (servers.length === 0) return undefined
    const timer = window.setInterval(() => {
      servers.forEach((s) => void pingOne(s))
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [reduceMotion, servers, pingOne])

  useEffect(() => () => {
    Object.values(timersRef.current).forEach((id) => window.clearInterval(id))
  }, [])

  const addServer = () => {
    const parsed = sanitizeEntry(newEntry)
    if (!parsed) { toast.pushToast('Enter a server address (host or host:port).', 'info'); return }
    if (servers.some((s) => s.entry === parsed.entry && s.port === parsed.port)) {
      toast.pushToast('That server is already in your list.', 'info')
    } else {
      const next = [...servers, parsed]
      setServers(next); persist(next)
      void pingOne(parsed)
    }
    setNewEntry('')
  }

  const removeServer = (index: number) => {
    const next = servers.filter((_, i) => i !== index)
    setServers(next); persist(next)
    setStatuses((s) => { const c = { ...s }; delete c[`${servers[index].entry}:${servers[index].port}`]; return c })
  }

  const joinServer = async (server: TrackedServer) => {
    if (!activeInstance) {
      toast.pushToast('Select an instance before joining a server.', 'error')
      return
    }
    const port = server.port === 25565 ? '' : `:${server.port}`
    toast.pushToast(`Launching ${activeInstance.name} · ${server.entry}${port}...`, 'info')
    // Quick-launch currently starts the selected instance; dropping the player
    // directly onto the server address requires launch.rs to accept server args
    // and is left out of this pass rather than faked.
    await launchInstance(activeInstance).catch(async (err) => {
      toast.pushToast(err instanceof Error ? err.message : 'Launch failed.', 'error')
    })
  }

  return (
    <section className="server-browser" aria-labelledby="server-browser-title">
      <div className="server-browser__header">
        <div><p className="eyebrow">MULTIPLAYER</p><h2 id="server-browser-title">Quick Servers</h2></div>
        <form className="server-browser__add" onSubmit={(e) => { e.preventDefault(); addServer() }}>
          <input value={newEntry} onChange={(e) => setNewEntry(e.target.value)} placeholder="play.example.net" aria-label="Server address" />
          <button type="submit" className="btn btn-ghost btn-sm"><Plus size={14} />Add</button>
        </form>
      </div>

      {servers.length === 0 ? (
        <p className="server-browser__empty">No servers yet. Add one above to see its live status.</p>
      ) : (
        <ul className="server-browser__list">
          {servers.map((server, index) => {
            const key = `${server.entry}:${server.port}`
            const info = statuses[key]
            const loading = pinging[key]
            const color = latencyColor(info?.ping_ms)
            return (
              <li key={key} className="server-browser__row">
                {info?.favicon_data_url ? <img className="server-browser__favicon" src={info.favicon_data_url} alt="" /> : <span className="server-browser__favicon"><Globe size={14} /></span>}
                <div className="server-browser__meta">
                  <strong>{server.entry}</strong>
                  <span className="server-browser__motd">{info?.description ?? (loading ? 'Pinging…' : info?.version_name ?? '—')}</span>
                </div>
                <div className="server-browser__players">
                  {info?.online != null && info?.max != null
                    ? <span style={{ color }}>{info.online}/{info.max} online</span>
                    : <span className="server-browser__offline">offline</span>}
                </div>
                <span className="server-browser__ping" style={{ color }}>{loading ? '…' : info?.error ? '—' : `${info?.ping_ms ?? '—'}ms`}</span>
                <button type="button" className="btn btn-ghost btn-xs" disabled={!info?.ping_ms || info?.error != null} onClick={() => void joinServer(server)} title="Launch selected instance"><Play size={13} />Join</button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => removeServer(index)} title="Remove"><Trash2 size={13} /></button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}