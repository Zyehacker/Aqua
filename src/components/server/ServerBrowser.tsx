import { useCallback, useEffect, useMemo, useState } from 'react'
import { Globe, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../hooks/useToast'
import { launchInstance, pingServer, type ServerInfo } from '../../utils/tauri'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { useAppStore } from '../../stores/appStore'

type TrackedServer = { name: string; entry: string; port: number }
type EditableServer = TrackedServer & { index: number }

const FEATURED_SERVERS: TrackedServer[] = [
  { name: 'Hypixel', entry: 'play.hypixel.net', port: 25565 },
  { name: 'CubeCraft', entry: 'play.cubecraft.net', port: 25565 },
]
const CUSTOM_STORAGE_KEY = 'aqua.custom-servers'

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

function readCustomServers(): TrackedServer[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(CUSTOM_STORAGE_KEY) ?? '[]') as TrackedServer[]
    return Array.isArray(value) ? value.filter((server) => server?.entry && server?.port) : []
  } catch { return [] }
}

function serverKey(server: TrackedServer) { return `${server.entry}:${server.port}` }
function latencyColor(ping?: number | null) { return ping == null ? 'var(--text-muted)' : ping <= 80 ? 'var(--success)' : ping <= 200 ? 'var(--warning)' : 'var(--danger)' }

export default function ServerBrowser() {
  const toast = useToast()
  const navigate = useNavigate()
  const { activeInstance } = useLauncherData()
  const reduceMotion = useAppStore((s) => s.reduceMotion)
  const showPartnerServers = useAppStore((s) => s.showPartnerServers)
  const [customServers, setCustomServers] = useState<TrackedServer[]>(readCustomServers)
  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [editing, setEditing] = useState<EditableServer | null>(null)
  const [statuses, setStatuses] = useState<Record<string, ServerInfo>>({})
  const [pinging, setPinging] = useState<Record<string, boolean>>({})
  const allServers = useMemo(() => [...FEATURED_SERVERS, ...customServers], [customServers])

  const persist = useCallback((servers: TrackedServer[]) => {
    setCustomServers(servers)
    try { window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(servers)) } catch { /* storage unavailable */ }
  }, [])

  const pingOne = useCallback(async (server: TrackedServer) => {
    const key = serverKey(server)
    setPinging((current) => ({ ...current, [key]: true }))
    try {
      const response = await pingServer(server.entry, server.port)
      setStatuses((current) => ({ ...current, [key]: response?.[0] ?? { host: server.entry, port: server.port, error: 'No response' } }))
    } catch (error) {
      setStatuses((current) => ({ ...current, [key]: { host: server.entry, port: server.port, error: error instanceof Error ? error.message : 'Ping failed' } }))
    } finally { setPinging((current) => ({ ...current, [key]: false })) }
  }, [])

  useEffect(() => {
    if (!showPartnerServers) return
    allServers.forEach((server) => void pingOne(server))
  }, [allServers, pingOne, showPartnerServers])
  useEffect(() => {
    if (!showPartnerServers || reduceMotion || !allServers.length) return undefined
    const timer = window.setInterval(() => allServers.forEach((server) => void pingOne(server)), 30_000)
    return () => window.clearInterval(timer)
  }, [allServers, pingOne, reduceMotion, showPartnerServers])

  const joinServer = async (server: TrackedServer) => {
    if (!activeInstance) { toast.pushToast('Select an instance before joining a server.', 'info'); navigate('/instances'); return }
    toast.pushToast(`Launching ${activeInstance.name} · ${server.name}...`, 'info')
    try { await launchInstance(activeInstance, { host: server.entry, port: server.port }) }
    catch (error) { toast.pushToast(error instanceof Error ? error.message : 'Launch failed.', 'error') }
  }

  const saveCustomServer = () => {
    const parsed = sanitizeEntry(editing ? editing.entry : newAddress)
    const name = (editing ? editing.name : newName).trim()
    if (!parsed) { toast.pushToast('Enter a server address (host or host:port).', 'info'); return }
    if (!name) { toast.pushToast('Give the server a name.', 'info'); return }
    const next = [...customServers]
    const value = { name, ...parsed }
    if (editing) next[editing.index] = value
    else if (allServers.some((server) => serverKey(server) === serverKey(value))) { toast.pushToast('That server is already in your list.', 'info'); return }
    else next.push(value)
    persist(next); setEditing(null); setNewName(''); setNewAddress('')
  }

  const renderRow = (server: TrackedServer, featured: boolean, index: number) => {
    const key = serverKey(server)
    const info = statuses[key]
    const isLoading = pinging[key]
    const online = !info?.error && info?.ping_ms != null
    return <li key={key} className="server-browser__row">
      {info?.favicon_data_url ? <img className="server-browser__favicon" src={info.favicon_data_url} alt="" /> : <span className="server-browser__favicon"><Globe size={14} /></span>}
      <div className="server-browser__meta"><strong>{server.name}</strong><span className="server-browser__motd">{server.entry}{info?.description ? ` · ${info.description}` : ''}</span></div>
      <div className="server-browser__players"><span className={online ? 'server-browser__online' : 'server-browser__offline'}>{online ? 'Online' : isLoading ? 'Checking' : 'Offline'}</span>{info?.online != null && info.max != null ? <small>{info.online}/{info.max}</small> : null}</div>
      <span className="server-browser__ping" style={{ color: latencyColor(info?.ping_ms) }}>{info?.ping_ms != null ? `${info.ping_ms}ms` : '—'}</span>
      <button type="button" className="btn btn-ghost btn-xs" disabled={!online} onClick={() => void joinServer(server)}><Play size={12} />JOIN</button>
      {featured ? <span className="server-browser__featured">Featured</span> : <div className="server-browser__manage"><button type="button" className="btn btn-ghost btn-xs" aria-label={`Edit ${server.name}`} onClick={() => setEditing({ ...server, index })}><Pencil size={12} /></button><button type="button" className="btn btn-ghost btn-xs" aria-label={`Delete ${server.name}`} onClick={() => persist(customServers.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={12} /></button></div>}
    </li>
  }

  if (!showPartnerServers) return null

  return <section className="server-browser" aria-labelledby="server-browser-title">
    <div className="server-browser__header"><div><p className="eyebrow">MULTIPLAYER</p><h2 id="server-browser-title">Partner Servers</h2></div></div>
    <div className="server-browser__section"><h3>Featured Servers</h3><ul className="server-browser__list">{FEATURED_SERVERS.map((server, index) => renderRow(server, true, index))}</ul></div>
    <div className="server-browser__section server-browser__custom"><div className="server-browser__section-heading"><h3>Custom Servers (Beta)</h3>{editing ? <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditing(null)}><X size={12} />Cancel</button> : null}</div>
      <form className="server-browser__add" onSubmit={(event) => { event.preventDefault(); saveCustomServer() }}><input value={editing?.name ?? newName} onChange={(event) => editing ? setEditing({ ...editing, name: event.target.value }) : setNewName(event.target.value)} placeholder="Server name" aria-label="Server name" /><input value={editing?.entry ?? newAddress} onChange={(event) => editing ? setEditing({ ...editing, entry: event.target.value }) : setNewAddress(event.target.value)} placeholder="host or host:port" aria-label="Server address" /><button type="submit" className="btn btn-ghost btn-sm"><Plus size={13} />{editing ? 'Save' : 'Add'}</button></form>
      {customServers.length ? <ul className="server-browser__list">{customServers.map((server, index) => renderRow(server, false, index))}</ul> : <p className="server-browser__empty">Add a server to keep it close at hand.</p>}
    </div>
  </section>
}
