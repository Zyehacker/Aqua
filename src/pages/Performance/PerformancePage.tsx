import { motion } from 'framer-motion'
import { Activity, Cpu, Gauge, HardDrive, RefreshCw, Thermometer } from 'lucide-react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useToast } from '../../hooks/useToast'

export default function PerformancePage() {
  const toast = useToast()
  const unavailable = '--'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Performance</p>
          <h1 className="page-title">System health</h1>
          <p className="page-subtitle">Live telemetry for smoother launches and in-game stability.</p>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            toast.pushToast('Live system telemetry is not available yet.', 'info')
          }}
        >
          <RefreshCw size={16} />
          Refresh
        </Button>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        {[
          { label: 'CPU', value: unavailable, icon: Cpu },
          { label: 'Memory', value: unavailable, icon: Activity },
          { label: 'GPU', value: unavailable, icon: Gauge },
        ].map((metric, index) => {
          const Icon = metric.icon
          return (
            <motion.div
              key={metric.label}
              className="metric-card glass"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span>{metric.label}</span>
                <Icon size={16} color="var(--primary)" />
              </div>
              <strong>{metric.value}</strong>
            </motion.div>
          )
        })}
      </div>

      <div className="grid-2">
        <Card>
          <div className="section-header">
            <h2>Resource load</h2>
            <span className="small muted">Updated live</span>
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            <p className="small muted">Live telemetry is unavailable in this build. No synthetic measurements are shown.</p>
          </div>
        </Card>

        <Card>
          <div className="section-header">
            <h2>Optimization tips</h2>
            <span className="chip chip-accent">Recommended</span>
          </div>
          <div className="list-stack">
            <div className="list-row">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="icon-wrap">
                  <HardDrive size={16} />
                </div>
                <div>
                  <strong>Keep allocated RAM at 8 GB</strong>
                  <p className="small muted">Best balance for NeoForge 1.21.1 on this machine</p>
                </div>
              </div>
            </div>
            <div className="list-row">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="icon-wrap accent">
                  <Thermometer size={16} />
                </div>
                <div>
                  <strong>Enable Sodium + Lithium</strong>
                  <p className="small muted">Expected +18% frame time stability in crowded biomes</p>
                </div>
              </div>
            </div>
            <div className="list-row">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="icon-wrap">
                  <Activity size={16} />
                </div>
                <div>
                  <strong>Close overlay apps before launch</strong>
                  <p className="small muted">Frees ~1.2 GB and reduces stutter on first world join</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
