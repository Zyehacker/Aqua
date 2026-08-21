import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, RotateCcw } from 'lucide-react'
import Button from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import * as tauri from '../../utils/tauri'

type LogEntry = {
  timestamp?: string
  level?: string
  source?: string
  message?: string
  stream?: string
  line?: string
}

type LogFilter = 'all' | 'info' | 'success' | 'warning' | 'error'

function parseLogs(raw: string | null): LogEntry[] {
  if (!raw) return []

  return raw.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return []
    try {
      const parsed = JSON.parse(line) as LogEntry
      return [{
        ...parsed,
        level: parsed.level ?? (parsed.stream === 'stderr' ? 'error' : 'info'),
        message: parsed.message ?? parsed.line ?? '',
        source: parsed.source ?? parsed.stream ?? 'game',
      }]
    } catch {
      return [{ level: 'info', source: 'log', message: line }]
    }
  }).reverse()
}

function formatTimestamp(timestamp?: string) {
  if (!timestamp) return '--:--:--'
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleTimeString()
}

export default function LogsPage() {
  const toast = useToast()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LogFilter>('all')

  const refresh = useCallback(async (showToast = false) => {
    try {
      setEntries(parseLogs(await tauri.readLogs()))
      if (showToast) toast.pushToast('Logs refreshed', 'success')
    } catch (error) {
      if (showToast) toast.pushToast(error instanceof Error ? error.message : 'Unable to read logs.', 'error')
    }
  }, [toast])

  useEffect(() => {
    let active = true
    void tauri.readLogs().then((raw) => {
      if (active) setEntries(parseLogs(raw))
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const visibleEntries = useMemo(
    () => filter === 'all' ? entries : entries.filter((entry) => entry.level?.toLowerCase() === filter),
    [entries, filter],
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Logs</h1>
          <p className="page-subtitle">Recent launcher and game output</p>
        </div>
        <div className="log-toolbar">
          <select aria-label="Filter logs" value={filter} onChange={(event) => setFilter(event.target.value as LogFilter)}>
            <option value="all">All levels</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
          <Button variant="ghost" size="sm" onClick={() => void refresh(true)}>
            <RotateCcw size={13} />
            Refresh
          </Button>
        </div>
      </div>

      {visibleEntries.length === 0 ? (
        <div className="empty-shell">
          <EmptyState
            title={entries.length === 0 ? 'No logs yet' : 'No matching logs'}
            description={entries.length === 0 ? 'Launcher activity will appear here after you use Aqua.' : 'Try a different log level.'}
            icon={<FileText size={20} />}
          />
        </div>
      ) : (
        <div className="log-list">
          {visibleEntries.map((entry, index) => {
            const level = entry.level?.toLowerCase() ?? 'info'
            const levelClass = ['info', 'success', 'warning', 'error'].includes(level) ? level : 'info'
            return (
              <div className="log-row" key={`${entry.timestamp ?? 'log'}-${index}`}>
                <span className="log-time">{formatTimestamp(entry.timestamp)}</span>
                <span className="log-source">{entry.source ?? 'log'}</span>
                <span className={`log-level log-level--${levelClass}`}>{level}</span>
                <code>{entry.message}</code>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}