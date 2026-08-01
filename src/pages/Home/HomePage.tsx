import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  FolderOpen,
  MemoryStick,
  Play,
  RefreshCw,
  Server,
  Settings2,
  Sparkles,
  Download,
  ChevronRight,
  Clock3,
} from 'lucide-react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import ProgressBar from '../../components/ui/ProgressBar'
import { useToast } from '../../components/ToastProvider'
import * as tauri from '../../utils/tauri'
import {
  CURRENT_PROFILE,
  FEATURED_CONTENT,
  INSTANCES,
  NEWS,
  QUICK_ACTIONS,
  DOWNLOADS,
} from '../../data/mock'

const actionIcons = [FolderOpen, RefreshCw, Settings2, MemoryStick]

export default function HomePage() {
  const toast = useToast()
  const recent = useMemo(() => INSTANCES.slice(0, 3), [])
  const activeDownloads = useMemo(() => DOWNLOADS.filter((item) => item.status === 'Downloading').length, [])

  return (
    <div className="page">
      <div className="home-layout">
        <div className="home-main">
          <motion.section
            className="hero-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
          >
            <div className="hero-card__top">
              <div style={{ flex: 1 }}>
                <p className="eyebrow">Current profile</p>
                <h1 className="page-title" style={{ fontSize: 'clamp(30px, 3vw, 40px)' }}>
                  {CURRENT_PROFILE.name}
                </h1>
                <p className="page-subtitle">
                  Isolated NeoForge profile tuned for survival, exploration, and smooth multiplayer sessions.
                </p>
              </div>
                <Button
                  className="hero-card__play"
                  variant="aqua"
                  size="lg"
                  aria-label={`Play ${CURRENT_PROFILE.name}`}
                  onClick={async () => {
                    toast.pushToast(`Starting ${CURRENT_PROFILE.name}…`, 'info')
                    const res = await tauri.launchInstance(CURRENT_PROFILE.name).catch(() => null)
                    if (res === null) {
                      // no backend available; fall back to toast
                      toast.pushToast(`Launch queued locally for ${CURRENT_PROFILE.name}`, 'success')
                    } else {
                      toast.pushToast(`Launched ${CURRENT_PROFILE.name}`, 'success')
                    }
                  }}
                >
                  <Play size={18} className="icon" />
                  Play
                </Button>
            </div>

            <div className="hero-stats">
              <div className="stat-block">
                <span>Minecraft</span>
                <strong>{CURRENT_PROFILE.version}</strong>
              </div>
              <div className="stat-block">
                <span>Loader</span>
                <strong>{CURRENT_PROFILE.loader}</strong>
              </div>
              <div className="stat-block">
                <span>Java</span>
                  <strong className="mono">{CURRENT_PROFILE.java}</strong>
              </div>
              <div className="stat-block">
                <span>Allocated RAM</span>
                <strong>{CURRENT_PROFILE.ram}</strong>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 18 }}>
              <ProgressBar value={62} label="Memory reserve" showValue accent="aqua" />
              <ProgressBar value={44} label="Launch readiness" showValue />
            </div>
          </motion.section>

          <div className="grid-2" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <Card>
              <div className="section-header">
                <div>
                  <h2>Quick actions</h2>
                  <p className="small muted" style={{ marginTop: 4 }}>One-click tools</p>
                </div>
                <span className="chip chip-aqua">Fast</span>
              </div>
              <div className="action-grid">
                {QUICK_ACTIONS.map((action, index) => {
                  const Icon = actionIcons[index] ?? Sparkles
                  return (
                    <button
                      key={action.id}
                      type="button"
                      className="action-card"
                      onClick={() => toast.pushToast(`${action.label} ready`, 'info')}
                    >
                      <div className={index % 2 === 0 ? 'icon-wrap' : 'icon-wrap accent'}>
                        <Icon size={18} />
                      </div>
                      <div>
                        <strong style={{ color: 'var(--text-strong)', fontSize: 14 }}>{action.label}</strong>
                        <p className="small muted">{action.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </Card>

            <Card>
              <div className="section-header">
                <div>
                  <h2>Recent instances</h2>
                  <p className="small muted" style={{ marginTop: 4 }}>Jump back in</p>
                </div>
                <span className="chip">{recent.length} ready</span>
              </div>
              <div className="list-stack">
                {recent.map((instance) => (
                  <div key={instance.id} className="list-row">
                    <div>
                      <strong>{instance.name}</strong>
                      <p className="small muted">
                        {instance.version} · {instance.loader}
                      </p>
                    </div>
                    <span className={`chip ${instance.status === 'Ready' ? 'chip-success' : ''}`}>
                      {instance.status}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div className="section-header">
              <div>
                <h2>Latest news</h2>
                <p className="small muted" style={{ marginTop: 4 }}>From Aqua Studio</p>
              </div>
              <span className="chip chip-accent">Fresh</span>
            </div>
            <div>
              {NEWS.map((item) => (
                <article key={item.id} className="news-item">
                  <span className="news-dot" />
                  <div>
                    <strong style={{ color: 'var(--text-strong)', fontSize: 14 }}>{item.title}</strong>
                    <p className="small muted" style={{ marginTop: 4 }}>
                      {item.summary}
                    </p>
                    <p className="small muted" style={{ marginTop: 6, fontFamily: 'var(--mono)' }}>
                      {item.time}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </Card>
        </div>

        <aside className="home-side" aria-label="Home sidebar">
          <Card className="side-card" strong>
            <div className="section-header" style={{ marginBottom: 10 }}>
              <div>
                <p className="eyebrow">Featured content</p>
                <h2>Curated picks</h2>
              </div>
              <Sparkles size={16} color="var(--accent)" />
            </div>
            <div className="list-stack" style={{ marginTop: 12 }}>
              {FEATURED_CONTENT.map((item) => (
                <div key={item.id} className="list-row">
                  <div>
                    <strong>{item.title}</strong>
                    <p className="small muted">{item.meta}</p>
                  </div>
                  <ChevronRight size={16} color="var(--muted)" />
                </div>
              ))}
            </div>
          </Card>

          <Card className="side-card">
            <div className="section-header">
              <div>
                <h2>Downloads</h2>
                <p className="small muted" style={{ marginTop: 4 }}>Active transfers</p>
              </div>
              <span className="chip chip-aqua">{activeDownloads} active</span>
            </div>
            <div className="list-stack">
              {DOWNLOADS.filter((item) => item.status !== 'Completed')
                .slice(0, 3)
                .map((job) => (
                  <div key={job.id}>
                    <div className="list-row" style={{ marginBottom: 8 }}>
                      <div>
                        <strong>{job.name}</strong>
                        <p className="small muted">
                          {job.category} · {job.speed}
                        </p>
                      </div>
                      <Download size={16} color="var(--primary)" />
                    </div>
                    <ProgressBar value={job.progress} accent={job.status === 'Queued' ? 'aqua' : 'primary'} />
                  </div>
                ))}
            </div>
          </Card>

          <Card className="side-card">
            <div className="section-header">
              <div>
                <h2>News pulse</h2>
                <p className="small muted" style={{ marginTop: 4 }}>Live update</p>
              </div>
              <Clock3 size={16} color="var(--primary)" />
            </div>
            <p style={{ margin: 0, color: 'var(--text-strong)', fontWeight: 600 }}>{NEWS[0].title}</p>
            <p className="small muted" style={{ marginTop: 8 }}>
              {NEWS[0].summary}
            </p>
          </Card>

          <Card className="side-card">
            <div className="section-header">
              <div>
                <h2>Server status</h2>
                <p className="small muted" style={{ marginTop: 4 }}>Aqua Network</p>
              </div>
              <Server size={16} color="var(--success)" />
            </div>
            <div className="status-pill">
              <span className="status-dot" />
              Online
            </div>
            <div className="hero-stats" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 14 }}>
              <div className="stat-block">
                <span>Latency</span>
                <strong>18 ms</strong>
              </div>
              <div className="stat-block">
                <span>Players</span>
                <strong>1,284</strong>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}
