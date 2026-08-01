import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, Cpu, Gauge, HardDrive, RefreshCw, Thermometer } from 'lucide-react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import ProgressBar from '../../components/ui/ProgressBar'
import { useToast } from '../../components/ToastProvider'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export default function PerformancePage() {
  const toast = useToast()
  const [cpu, setCpu] = useState(42)
  const [ram, setRam] = useState(61)
  const [gpu, setGpu] = useState(38)
  const [disk, setDisk] = useState(24)

  useEffect(() => {
    const id = window.setInterval(() => {
      setCpu((value) => clamp(value + (Math.random() * 10 - 5), 18, 92))
      setRam((value) => clamp(value + (Math.random() * 6 - 3), 35, 88))
      setGpu((value) => clamp(value + (Math.random() * 12 - 6), 12, 95))
      setDisk((value) => clamp(value + (Math.random() * 4 - 2), 8, 70))
    }, 1600)
    return () => window.clearInterval(id)
  }, [])

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
            setCpu(40)
            setRam(58)
            setGpu(33)
            setDisk(22)
            toast.pushToast('Performance stats refreshed', 'success')
          }}
        >
          <RefreshCw size={16} />
          Refresh
        </Button>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        {[
          { label: 'CPU', value: `${Math.round(cpu)}%`, icon: Cpu },
          { label: 'Memory', value: `${Math.round(ram)}%`, icon: Activity },
          { label: 'GPU', value: `${Math.round(gpu)}%`, icon: Gauge },
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
            <ProgressBar value={cpu} label="CPU utilization" showValue accent="aqua" />
            <ProgressBar value={ram} label="Memory usage" showValue />
            <ProgressBar value={gpu} label="GPU load" showValue accent="aqua" />
            <ProgressBar value={disk} label="Disk activity" showValue />
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
