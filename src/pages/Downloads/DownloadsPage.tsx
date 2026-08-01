import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Clock3, DownloadCloud, Pause, RotateCcw, XCircle } from 'lucide-react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import ProgressBar from '../../components/ui/ProgressBar'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import { DOWNLOADS } from '../../data/mock'
import type { DownloadJob } from '../../types'

const statusIcon = {
  Downloading: DownloadCloud,
  Queued: Clock3,
  Paused: Pause,
  Completed: CheckCircle2,
  Failed: XCircle,
} as const

export default function DownloadsPage() {
  const toast = useToast()
  const [jobs, setJobs] = useState<DownloadJob[]>(DOWNLOADS)

  const activeCount = useMemo(
    () => jobs.filter((job) => job.status === 'Downloading' || job.status === 'Queued').length,
    [jobs],
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Downloads</p>
          <h1 className="page-title">Transfer queue</h1>
          <p className="page-subtitle">Monitor installs, pauses, and completed content transfers.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="ghost"
            onClick={() => {
              setJobs((current) =>
                current.map((job) =>
                  job.status === 'Downloading' ? { ...job, status: 'Paused', speed: 'Paused' } : job,
                ),
              )
              toast.pushToast('All downloads paused', 'info')
            }}
          >
            <Pause size={16} />
            Pause all
          </Button>
          <Button
            variant="aqua"
            onClick={() => {
              setJobs(DOWNLOADS)
              toast.pushToast('Queue refreshed', 'success')
            }}
          >
            <RotateCcw size={16} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="metric-card glass">
          <span>Active</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="metric-card glass">
          <span>Completed</span>
          <strong>{jobs.filter((job) => job.status === 'Completed').length}</strong>
        </div>
        <div className="metric-card glass">
          <span>Failed</span>
          <strong>{jobs.filter((job) => job.status === 'Failed').length}</strong>
        </div>
      </div>

      <Card>
        <div className="section-header">
          <h2>Current transfers</h2>
          <span className="small muted">{jobs.length} items</span>
        </div>

        {jobs.length === 0 ? (
          <EmptyState
            title="Queue is empty"
            description="Install mods, packs, or shaders from Content Manager to see them here."
          />
        ) : (
          <div className="list-stack">
            {jobs.map((job, index) => {
              const Icon = statusIcon[job.status]
              return (
                <motion.div
                  key={job.id}
                  className="list-row"
                  style={{ flexDirection: 'column', alignItems: 'stretch' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.04 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%' }}>
                    <div>
                      <strong>{job.name}</strong>
                      <p className="small muted">
                        {job.category} · {job.speed}
                      </p>
                    </div>
                    <span className={`chip ${job.status === 'Completed' ? 'chip-success' : job.status === 'Failed' ? 'chip-danger' : ''}`}>
                      <Icon size={13} />
                      {job.status}
                    </span>
                  </div>
                  <ProgressBar value={job.progress} accent={job.status === 'Completed' ? 'aqua' : 'primary'} />
                </motion.div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
