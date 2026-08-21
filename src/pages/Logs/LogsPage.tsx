import { useEffect, useMemo, useState } from 'react'
import { Check, Clipboard, Download, Trash2 } from 'lucide-react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { invoke, listen } from '../../utils/tauri'

type LogEvent = { stream?: string; line?: string }
type LogEntry = { id: number; level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'; source: string; message: string; time: string }

function classify(event: LogEvent): LogEntry['level'] {
  const line = event.line?.toLowerCase() ?? ''
  if (event.stream === 'stderr' || /error|exception|fatal|failed/.test(line)) return 'ERROR'
  if (/warning|warn/.test(line)) return 'WARNING'
  if (/success|verified|installed|ready|complete/.test(line)) return 'SUCCESS'
  return 'INFO'
}

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    void invoke<string>('read_logs').then((raw) => {
      if (!raw) return
      const restored = raw.split('\n').filter(Boolean).map((line, index) => ({
        id: index,
        level: classify({ line }),
        source: 'history',
        message: line,
        time: '',
      }))
      setEntries(restored.slice(-300))
    }).catch(() => undefined)
    void listen<LogEvent>('launch-log', (event) => {
      const line = event.line?.trim()
      if (!line) return
      setEntries((current) => [
        ...current,
        {
          id: Date.now() + current.length,
          level: classify(event),
          source: event.stream === 'stderr' ? 'stderr' : 'stdout',
          message: line,
          time: new Date().toLocaleTimeString(),
        },
      ].slice(-300))
    }).then((cleanup) => { unsubscribe = cleanup })
    return () => { unsubscribe?.() }
  }, [])

  const text = useMemo(() => entries.map((entry) => '[' + entry.time + '] ' + entry.level + ' ' + entry.source + ': ' + entry.message).join('\n'), [entries])

  const copyLogs = async () => {
    if (!text) return
    await navigator.clipboard?.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const exportLogs = () => {
    if (!text) return
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'aqua-session.log'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Logs</p>
          <h1 className="page-title">Logs</h1>
          <p className="page-subtitle">Live launcher and Minecraft output.</p>
        </div>
        <div className="log-toolbar">
          <Button variant="ghost" size="sm" disabled={!entries.length} onClick={() => void copyLogs()}>
            {copied ? <Check size={14} /> : <Clipboard size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="ghost" size="sm" disabled={!entries.length} onClick={exportLogs}>
            <Download size={14} />
            Export
          </Button>
          <Button variant="danger" size="sm" disabled={!entries.length} onClick={() => setEntries([])}>
            <Trash2 size={14} />
            Clear
          </Button>
        </div>
      </div>

      <Card>
        {entries.length ? (
          <div className="log-list" role="log" aria-live="polite">
            {entries.map((entry) => (
              <div className="log-row" key={entry.id}>
                <span className={'log-level log-level--' + entry.level.toLowerCase()}>{entry.level}</span>
                <span className="log-time">{entry.time}</span>
                <span className="log-source">{entry.source}</span>
                <code>{entry.message}</code>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No live logs" description="Launch Minecraft or install content to capture output." />
        )}
      </Card>
    </div>
  )
}
