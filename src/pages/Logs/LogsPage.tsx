import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clipboard, ExternalLink, FileText, FolderOpen, RotateCcw, Search, WandSparkles, Wrench } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import * as tauri from '../../utils/tauri'
import { useTranslation } from '../../useTranslation'

type LogEntry = {
  timestamp?: string
  level?: string
  source?: string
  message?: string
  stream?: string
  line?: string
}

type LogFilter = 'all' | 'info' | 'success' | 'warning' | 'error'
type CrashAction = 'logs' | 'repair' | 'retry' | 'instance' | 'java'
type CrashAnalysis = { cause: string; evidence: string; confidence: 'High' | 'Medium' | 'Low'; fix: string; actions: CrashAction[] }

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
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const { activeInstance, settings, detectJava, refresh: refreshLauncher } = useLauncherData()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LogFilter>('all')
  const [query, setQuery] = useState('')
  const [analysis, setAnalysis] = useState<CrashAnalysis | null>(null)

  const refresh = useCallback(async (showToast = false) => {
    try {
      setEntries(parseLogs(await tauri.readLogs()))
      if (showToast) toast.pushToast(t('logs.refreshed'), 'success')
    } catch (error) {
      if (showToast) toast.pushToast(error instanceof Error ? error.message : 'Unable to read logs.', 'error')
    }
  }, [t, toast])

  useEffect(() => {
    let active = true
    void tauri.readLogs().then((raw) => {
      if (active) setEntries(parseLogs(raw))
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const visibleEntries = useMemo(
    () => entries.filter((entry) => (filter === 'all' || entry.level?.toLowerCase() === filter) && (!query.trim() || `${entry.source} ${entry.message}`.toLowerCase().includes(query.trim().toLowerCase()))),
    [entries, filter, query],
  )

  const analyzeCrash = () => {
    const evidence = entries.find((entry) => {
      const text = (entry.message ?? '').toLowerCase()
      return entry.level?.toLowerCase() === 'error' || /exception|error|crash|failed|invalid|missing|incompatible/.test(text)
    })
    const text = entries.map((entry) => entry.message ?? '').join('\n')
    const normalized = text.toLowerCase()
    const evidenceText = evidence?.message?.trim() || 'No error line was found in the loaded log tail.'
    if (!text.trim()) return setAnalysis({ cause: 'No crash evidence is available.', evidence: evidenceText, confidence: 'High', fix: 'Launch Minecraft or refresh the logs, then analyze again.', actions: ['logs'] })
    if (/outofmemory|java heap space|unable to create native thread/.test(normalized)) return setAnalysis({ cause: 'Minecraft ran out of memory.', evidence: evidenceText, confidence: 'High', fix: 'Lower content load or increase the instance RAM allocation.', actions: ['instance', 'retry'] })
    if (/could not find java|java runtime|unsupportedclassversion|class version/.test(normalized)) return setAnalysis({ cause: 'The Java runtime is missing or incompatible.', evidence: evidenceText, confidence: 'High', fix: 'Detect a compatible Java runtime before launching again.', actions: ['java', 'retry'] })
    if (/fabric/.test(normalized) && /mod resolution|incompatible|could not resolve|failed to load/.test(normalized)) return setAnalysis({ cause: 'Fabric could not resolve or load the instance content.', evidence: evidenceText, confidence: 'High', fix: 'Repair the instance and review the incompatible or missing mod.', actions: ['repair', 'instance', 'retry'] })
    if (/(missing|requires|depends on).*(dependency|mod)|dependency.*(missing|not found)/.test(normalized)) return setAnalysis({ cause: 'A required content dependency is missing.', evidence: evidenceText, confidence: 'Medium', fix: 'Review the affected dependency and install a compatible version.', actions: ['instance', 'logs'] })
    if (/requires minecraft|incompatible minecraft|incompatible version|not compatible/.test(normalized)) return setAnalysis({ cause: 'A Minecraft, loader, or content version is incompatible.', evidence: evidenceText, confidence: 'High', fix: 'Use matching Minecraft/loader/content versions, then retry.', actions: ['instance', 'retry'] })
    if (/no such file|file not found|invalid (zip|jar)|corrupt|failed to read|metadata/.test(normalized)) return setAnalysis({ cause: 'A required file or instance metadata appears missing or corrupt.', evidence: evidenceText, confidence: 'Medium', fix: 'Run instance repair and inspect the latest log file.', actions: ['repair', 'instance', 'logs'] })
    return setAnalysis({ cause: 'The failure cause is ambiguous from the available evidence.', evidence: evidenceText, confidence: 'Low', fix: 'Review the highlighted log rows before taking recovery action.', actions: ['logs', 'instance'] })
  }

  const copyVisible = async () => {
    try {
      await navigator.clipboard.writeText(visibleEntries.map((entry) => `${formatTimestamp(entry.timestamp)} [${entry.level}] ${entry.source}: ${entry.message}`).join('\n'))
      toast.pushToast('Logs copied', 'success')
    } catch {
      toast.pushToast('Unable to copy logs. Check clipboard permissions.', 'error')
    }
  }

  const runAction = async (action: CrashAction) => {
    try {
      if (action === 'logs') return await tauri.openLatestLog()
      if (action === 'instance') return activeInstance ? await tauri.openInstanceFolder(activeInstance.id, settings?.mc_dir) : toast.pushToast('No instance is selected.', 'info')
      if (action === 'repair') {
        if (!activeInstance) return toast.pushToast('No instance is selected.', 'info')
        await tauri.repairInstance(activeInstance.id, settings?.mc_dir)
        await refreshLauncher()
        toast.pushToast('Instance repaired.', 'success')
      }
      if (action === 'java') {
        const java = await detectJava()
        toast.pushToast(java ? 'Java runtime ready.' : 'Java runtime could not be resolved.', java ? 'success' : 'error')
      }
      if (action === 'retry') {
        if (!activeInstance) return toast.pushToast('No instance is selected.', 'info')
        await tauri.launchInstance(activeInstance)
        toast.pushToast('Launch started.', 'success')
      }
    } catch (error) {
      toast.pushToast(error instanceof Error ? error.message : 'Recovery action failed.', 'error')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('logs.title')}</h1>
          <p className="page-subtitle">{t('logs.subtitle')}</p>
        </div>
        <div className="log-toolbar">
          <select aria-label="Filter logs" value={filter} onChange={(event) => setFilter(event.target.value as LogFilter)}>
            <option value="all">{t('common.allLevels')}</option>
            <option value="info">{t('common.info')}</option>
            <option value="success">{t('common.success')}</option>
            <option value="warning">{t('common.warning')}</option>
            <option value="error">{t('common.error')}</option>
          </select>
          <label className="logs-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search logs" /></label>
          <Button variant="ghost" size="sm" onClick={() => void copyVisible()} disabled={!visibleEntries.length}><Clipboard size={13} />Copy</Button>
          <Button variant="ghost" size="sm" onClick={() => void tauri.openLatestLog().catch((error) => toast.pushToast(error instanceof Error ? error.message : 'Unable to open log file.', 'error'))}><ExternalLink size={13} />Open file</Button>
          <Button variant="ghost" size="sm" onClick={() => void tauri.openLogsFolder().catch((error) => toast.pushToast(error instanceof Error ? error.message : 'Unable to open logs folder.', 'error'))}><FolderOpen size={13} />Open folder</Button>
          <Button variant="ghost" size="sm" onClick={analyzeCrash}><WandSparkles size={13} />Analyze crash</Button>
          <Button variant="ghost" size="sm" onClick={() => void refresh(true)}>
            <RotateCcw size={13} />
            Refresh
          </Button>
        </div>
      </div>

      {visibleEntries.length === 0 ? (
        <div className="empty-shell">
          <EmptyState
            title={entries.length === 0 ? t('common.noLogs') : t('common.noMatchingLogs')}
            description={entries.length === 0 ? t('logs.empty') : t('logs.noMatch')}
            icon={<FileText size={20} />}
          />
        </div>
      ) : (
        <div className="log-list">
          {visibleEntries.map((entry, index) => {
            const level = entry.level?.toLowerCase() ?? 'info'
            const crashLine = /exception|error|crash|failed|invalid|missing|incompatible/i.test(entry.message ?? '')
            const levelClass = crashLine ? 'error' : ['info', 'success', 'warning', 'error'].includes(level) ? level : 'info'
            return (
              <div className={`log-row ${crashLine ? 'log-row--crash' : ''}`} key={`${entry.timestamp ?? 'log'}-${index}`}>
                <span className="log-time">{formatTimestamp(entry.timestamp)}</span>
                <span className="log-source">{entry.source ?? 'log'}</span>
                <span className={`log-level log-level--${levelClass}`}>{level}</span>
                <code>{entry.message}</code>
              </div>
            )
          })}
        </div>
      )}
      {analysis ? <section className="crash-analysis"><strong>Crash analysis</strong><p><b>Likely cause:</b> {analysis.cause}</p><p><b>Evidence:</b> {analysis.evidence}</p><p><b>Confidence:</b> {analysis.confidence}</p><p><b>Safe action:</b> {analysis.fix}</p><div className="crash-analysis__actions">{analysis.actions.includes('logs') ? <Button variant="ghost" size="sm" onClick={() => navigate('/logs')}><FileText size={13} />Open logs</Button> : null}{analysis.actions.includes('repair') ? <Button variant="ghost" size="sm" onClick={() => void runAction('repair')}><Wrench size={13} />Repair</Button> : null}{analysis.actions.includes('retry') ? <Button variant="ghost" size="sm" onClick={() => void runAction('retry')}><RotateCcw size={13} />Retry launch</Button> : null}{analysis.actions.includes('instance') ? <Button variant="ghost" size="sm" onClick={() => void runAction('instance')}><FolderOpen size={13} />Open instance</Button> : null}{analysis.actions.includes('java') ? <Button variant="ghost" size="sm" onClick={() => void runAction('java')}><WandSparkles size={13} />Java setup</Button> : null}</div><button type="button" onClick={() => setAnalysis(null)}>Dismiss</button></section> : null}
    </div>
  )
}