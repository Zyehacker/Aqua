import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, LoaderCircle, ShieldCheck, Terminal } from 'lucide-react'
import Button from '../../components/ui/Button'
import { useAquaAuth } from '../../hooks/useAquaAuthHook'
import { getSystemStatus, setMaintenance, type SystemStatus } from '../../services/adminService'
import { useMaintenance } from '../../hooks/useMaintenanceHook'
import { maskEmail } from '../../utils/privacy'
import { useAdminAccess } from '../../hooks/useAdminAccess'

const DEFAULT_MAINTENANCE_MESSAGE = 'Aqua online services are temporarily unavailable. Offline Minecraft play remains available.'

export function AdminRoute({ children }: { children: ReactNode }) {
  const { allowed, loading } = useAdminAccess()

  if (loading) return <div className="page"><div className="empty-shell"><LoaderCircle className="spin" size={18} /> Checking admin access</div></div>
  return allowed ? children : <Navigate to="/" replace />
}

export default function AdminPage() {
  const aqua = useAquaAuth()
  const maintenance = useMaintenance()
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [command, setCommand] = useState('')
  const [commandBusy, setCommandBusy] = useState(false)
  const [terminalOutput, setTerminalOutput] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const next = await getSystemStatus()
      setStatus(next)
      setMessage(next.maintenance_message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load admin status.')
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function changeMaintenance(enabled: boolean) {
    if (!window.confirm(enabled ? 'Enable maintenance mode?' : 'End maintenance mode?')) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const next = await setMaintenance(enabled, message)
      setStatus(next)
      setMessage(next.maintenance_message)
      setNotice('Maintenance status updated.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update maintenance mode.')
    } finally {
      setBusy(false)
    }
  }

  async function runCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const entered = command.trim()
    if (!entered || commandBusy) return
    setCommand('')
    setCommandBusy(true)
    try {
      let next: SystemStatus
      if (entered === '/maintenancedone') {
        next = await setMaintenance(false)
      } else if (entered === '/maintenance' || entered.startsWith('/maintenance ')) {
        const supplied = entered.slice('/maintenance'.length).trim()
        next = await setMaintenance(true, supplied || DEFAULT_MAINTENANCE_MESSAGE)
      } else {
        setTerminalOutput((lines) => [...lines, `> ${entered}`, 'Unknown command. Use /maintenance, /maintenance <message>, or /maintenancedone.'])
        return
      }
      setStatus(next)
      setMessage(next.maintenance_message)
      await maintenance.refresh()
      setTerminalOutput((lines) => [...lines, `> ${entered}`, next.maintenance ? `Maintenance enabled: ${next.maintenance_message}` : 'Maintenance disabled. Online services restored.'])
    } catch (reason) {
      setTerminalOutput((lines) => [...lines, `> ${entered}`, `Error: ${reason instanceof Error ? reason.message : 'Command failed.'}`])
    } finally {
      setCommandBusy(false)
    }
  }

  return (
    <div className="page admin-page">
      <div className="page-header">
        <div><p className="eyebrow">Aqua control</p><h1 className="page-title">Admin</h1><p className="page-subtitle">System controls for the authenticated administrator.</p></div>
        <span className="chip chip-success"><ShieldCheck size={12} /> Verified admin</span>
      </div>
      {error ? <div className="state-banner state-banner--error" role="alert"><AlertTriangle size={15} />{error}</div> : null}
      {notice ? <div className="state-banner state-banner--success" role="status"><CheckCircle2 size={15} />{notice}</div> : null}
      <section className="admin-grid">
        <div className="admin-panel">
          <div className="admin-panel__heading"><div><span className="eyebrow">System status</span><h2>{status?.maintenance ? 'Maintenance active' : 'Online'}</h2></div><span className={`status-dot ${status?.maintenance ? 'status-dot--warning' : ''}`} /></div>
          <dl className="admin-details"><div><dt>Message</dt><dd>{status?.maintenance_message || 'No maintenance message'}</dd></div><div><dt>Last updated</dt><dd>{status?.updated_at ? new Date(status.updated_at).toLocaleString() : 'Unavailable'}</dd></div><div><dt>Account</dt><dd>{maskEmail(aqua.user?.email)}</dd></div></dl>
        </div>
        <div className="admin-panel"><span className="eyebrow">Maintenance</span><h2>{status?.maintenance ? 'End maintenance' : 'Enable maintenance'}</h2><p className="admin-copy">Normal launcher actions are restricted while maintenance is active. Admin access remains available.</p><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} placeholder="Optional maintenance message" aria-label="Maintenance message" /><Button variant={status?.maintenance ? 'ghost' : 'aqua'} disabled={busy} onClick={() => void changeMaintenance(!status?.maintenance)}>{busy ? <LoaderCircle className="spin" size={14} /> : null}{status?.maintenance ? 'End Maintenance' : 'Enable Maintenance'}</Button></div>
      </section>
      <section className="admin-panel admin-terminal">
        <div className="admin-panel__heading"><div><span className="eyebrow"><Terminal size={12} /> Command terminal</span><h2>Maintenance commands</h2></div><span className="admin-terminal__hint">Server-authorized</span></div>
        <div className="admin-terminal__output" role="log" aria-live="polite">{terminalOutput.length ? terminalOutput.map((line, index) => <div key={`${index}-${line}`}>{line}</div>) : <div>Ready. Enter a maintenance command.</div>}</div>
        <form className="admin-terminal__form" onSubmit={(event) => void runCommand(event)}>
          <span aria-hidden="true">&gt;</span>
          <input value={command} onChange={(event) => setCommand(event.target.value)} disabled={commandBusy} placeholder="/maintenance &lt;message&gt;" aria-label="Maintenance command" />
          <Button variant="aqua" size="sm" disabled={commandBusy || !command.trim()}>{commandBusy ? <LoaderCircle className="spin" size={14} /> : <Terminal size={14} />}Run</Button>
        </form>
      </section>
    </div>
  )
}
