import { useEffect, useState } from 'react'
import { CheckCircle2, Clock3, DownloadCloud, RotateCcw, X, XCircle, type LucideIcon } from 'lucide-react'
import Button from '../../components/ui/Button'
import ProgressBar from '../../components/ui/ProgressBar'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import type { DownloadJob } from '../../types'
import { invoke, listen } from '../../utils/tauri'
import { cn } from '../../utils/cn'
import { useTranslation } from '../../useTranslation'

const STATUS_ICON: Record<string, LucideIcon> = {
  downloading: DownloadCloud,
  installing: DownloadCloud,
  queued: Clock3,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: XCircle,
}

// Map a download status to the app's chip palette for consistent row styling.
function chipClass(s: string) {
  if (s === 'completed') return 'chip-success'
  if (s === 'failed' || s === 'cancelled') return 'chip-danger'
  if (s === 'installing') return 'chip-accent'
  return 'chip-aqua'
}

function isActive(s: string) {
  return s === 'downloading' || s === 'queued' || s === 'installing'
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function DownloadsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [jobs, setJobs] = useState<DownloadJob[]>([])

  useEffect(() => {
    let unlisten: (() => void) | null = null
    const init = async () => {
      try {
        const current = await invoke<DownloadJob[]>('list_downloads')
        if (current) setJobs(current)
      } catch { /* backend may be unavailable */ }

      const cleanup = await listen<DownloadJob>('download-status', (job) => {
        setJobs((prev) => {
          const idx = prev.findIndex((j) => j.id === job.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = job
            return next
          }
          return [job, ...prev]
        })
      })
      if (cleanup) unlisten = cleanup
    }
    void init()
    return () => { unlisten?.() }
  }, [])

  const refresh = async () => {
    try {
      const current = await invoke<DownloadJob[]>('list_downloads')
      if (current) setJobs(current)
      toast.pushToast(t('downloads.refreshed'), 'success')
    } catch {
      toast.pushToast('Refresh failed', 'error')
    }
  }

  const cancel = async (id: number) => {
    try {
      await invoke('cancel_download', { id })
      toast.pushToast(t('downloads.cancelled'), 'info')
    } catch (e) {
      toast.pushToast(e instanceof Error ? e.message : 'Cancel failed', 'error')
    }
  }

  const activeCount = jobs.filter((entry) => isActive(entry.status)).length

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <div>
          <p className="eyebrow">Transfers</p>
          <h1 className="page-title">{t('downloads.title')}</h1>
          <p className="page-subtitle">
            {activeCount > 0 ? `${activeCount} active download${activeCount === 1 ? '' : 's'}` : 'Track instance, mod, and pack downloads.'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          <RotateCcw size={13} />
          Refresh
        </Button>
      </div>

      {jobs.length === 0 ? (
        <div className="dl-empty">
          <EmptyState
            title={t('downloads.empty')}
            description={t('downloads.emptyDescription')}
            icon={<DownloadCloud size={20} />}
          />
        </div>
      ) : (
        <div className="dl-panel">
          {jobs.map((job) => {
            const Icon = STATUS_ICON[job.status] ?? DownloadCloud
            const active = isActive(job.status)
            const statusLabel = t(`downloads.status.${job.status}`)
            const pct = job.percentage ?? 0

            const detail = job.error
              ? job.error
              : `${formatBytes(job.downloaded_bytes)}${job.total_bytes ? ` / ${formatBytes(job.total_bytes)}` : ''}${job.speed ? ` · ${job.speed}` : ''}`

            return (
              <div key={job.id} className="dl-row">
                <div className="dl-row__main">
                  <span className={cn('dl-row__icon', job.status)}>
                    <Icon size={16} />
                  </span>
                  <div className="dl-row__info">
                    <strong className="dl-row__name">{job.name}</strong>
                    <span className={cn('dl-row__detail', job.error && 'is-error')}>{detail}</span>
                  </div>
                  <div className="dl-row__right">
                    <span className={cn('chip', chipClass(job.status))}>
                      <Icon size={11} />
                      {statusLabel}
                    </span>
                    {active ? (
                      <button
                        type="button"
                        className="dl-cancel"
                        aria-label="Cancel download"
                        onClick={() => void cancel(job.id)}
                      >
                        <X size={13} />
                      </button>
                    ) : null}
                  </div>
                </div>
                {active ? (
                  <ProgressBar
                    className="dl-progress"
                    value={pct}
                    accent="aqua"
                    showValue
                    label={`${formatBytes(job.downloaded_bytes)}${job.total_bytes ? ` / ${formatBytes(job.total_bytes)}` : ''}${job.speed ? ` · ${job.speed}` : ''}`}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}