import { useEffect, useState } from 'react'
import { CheckCircle2, Clock3, DownloadCloud, RotateCcw, X, XCircle, type LucideIcon } from 'lucide-react'
import Button from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import type { DownloadJob } from '../../types'
import { invoke, listen } from '../../utils/tauri'
import { useTranslation } from '../../useTranslation'

const STATUS_ICON: Record<string, LucideIcon> = {
  downloading: DownloadCloud,
  installing: DownloadCloud,
  queued: Clock3,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: XCircle,
}

function statusClass(s: string) {
  if (s === 'completed') return 'dl-status--ok'
  if (s === 'failed' || s === 'cancelled') return 'dl-status--err'
  return 'dl-status--active'
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

  const activeCount = jobs.filter((j) => j.status === 'downloading' || j.status === 'queued' || j.status === 'installing').length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('downloads.title')}</h1>
          {activeCount > 0 ? (
            <p className="page-subtitle">{activeCount} active</p>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          <RotateCcw size={13} />
          Refresh
        </Button>
      </div>

      {jobs.length === 0 ? (
        <div className="empty-shell">
          <EmptyState
            title={t('downloads.empty')}
            description={t('downloads.emptyDescription')}
          />
        </div>
      ) : (
        <div className="dl-list">
          {jobs.map((job) => {
            const Icon = STATUS_ICON[job.status] ?? DownloadCloud
            const isActive = job.status === 'downloading' || job.status === 'queued' || job.status === 'installing'
            const pct = job.percentage ?? 0

            return (
              <div key={job.id} className="dl-row">
                <div className="dl-row__top">
                  <div className="dl-row__info">
                    <strong className="dl-row__name">{job.name}</strong>
                    <span className="dl-row__detail">
                      {job.error ? (
                        <span style={{ color: 'var(--danger)' }}>{job.error}</span>
                      ) : (
                        <>
                          {formatBytes(job.downloaded_bytes)}
                          {job.total_bytes ? ` / ${formatBytes(job.total_bytes)}` : ''}
                          {job.speed ? ` · ${job.speed}` : ''}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="dl-row__right">
                    <span className={`dl-status ${statusClass(job.status)}`}>
                      <Icon size={12} />
                      {t(`downloads.status.${job.status}`)}
                    </span>
                    {isActive ? (
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
                {pct > 0 || isActive ? (
                  <div className="dl-progress">
                    <div
                      className={`dl-progress__fill ${job.status === 'completed' ? 'done' : ''}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
