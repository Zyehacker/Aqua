import { useState } from 'react'
import { HardDrive, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Toggle from '../../components/ui/Toggle'
import { useToast } from '../../components/ToastProvider'
import { appActions, useAppStore } from '../../stores/appStore'

export default function SettingsPage() {
  const toast = useToast()
  const theme = useAppStore((s) => s.theme)
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [autoRam, setAutoRam] = useState(true)
  const [safeMode, setSafeMode] = useState(true)
  const [hardwareAccel, setHardwareAccel] = useState(true)
  const [discordRpc, setDiscordRpc] = useState(false)
  const [ram, setRam] = useState(8)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 className="page-title">Customize Aqua Client</h1>
          <p className="page-subtitle">Launch behavior, safety, appearance, and performance defaults.</p>
        </div>
        <Button
          onClick={() => toast.pushToast('Settings saved', 'success')}
        >
          Save changes
        </Button>
      </div>

      <div className="grid-2">
        <Card>
          <div className="section-header">
            <h2>Launch</h2>
            <SlidersHorizontal size={16} color="var(--primary)" />
          </div>

          <div className="settings-row">
            <div>
              <strong style={{ color: 'var(--text-strong)' }}>Automatic updates</strong>
              <p className="small muted">Keep Aqua Client and content indexes current</p>
            </div>
            <Toggle checked={autoUpdate} onChange={setAutoUpdate} label="Automatic updates" />
          </div>

          <div className="settings-row">
            <div>
              <strong style={{ color: 'var(--text-strong)' }}>Auto optimize RAM</strong>
              <p className="small muted">Suggest allocation based on available system memory</p>
            </div>
            <Toggle checked={autoRam} onChange={setAutoRam} label="Auto optimize RAM" />
          </div>

          <div className="settings-row">
            <div style={{ flex: 1 }}>
              <strong style={{ color: 'var(--text-strong)' }}>Allocated RAM</strong>
              <p className="small muted">{ram} GB reserved for Minecraft</p>
              <input
                aria-label="Allocated RAM"
                type="range"
                min={2}
                max={16}
                step={1}
                value={ram}
                onChange={(event) => setRam(Number(event.target.value))}
                style={{ width: '100%', marginTop: 10 }}
              />
            </div>
          </div>
        </Card>

        <Card>
          <div className="section-header">
            <h2>Security</h2>
            <ShieldCheck size={16} color="var(--accent)" />
          </div>

          <div className="settings-row">
            <div>
              <strong style={{ color: 'var(--text-strong)' }}>Safe mode validation</strong>
              <p className="small muted">Scan mods and packs before enabling them</p>
            </div>
            <Toggle checked={safeMode} onChange={setSafeMode} label="Safe mode validation" />
          </div>

          <div className="settings-row">
            <div>
              <strong style={{ color: 'var(--text-strong)' }}>Isolated profiles only</strong>
              <p className="small muted">Prevent shared folder conflicts across instances</p>
            </div>
            <Toggle checked={true} onChange={() => toast.pushToast('Isolation is required in Aqua Client', 'info')} label="Isolated profiles" />
          </div>
        </Card>

        <Card>
          <div className="section-header">
            <h2>Appearance</h2>
            <Sparkles size={16} color="var(--primary)" />
          </div>

          <div className="settings-row">
            <div>
              <strong style={{ color: 'var(--text-strong)' }}>Theme</strong>
              <p className="small muted">Currently using {theme === 'dark' ? 'Dark Glass' : 'Dim Glass'}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                appActions.toggleTheme()
                toast.pushToast('Theme updated', 'success')
              }}
            >
              Switch theme
            </Button>
          </div>

          <div className="settings-row">
            <div>
              <strong style={{ color: 'var(--text-strong)' }}>Discord rich presence</strong>
              <p className="small muted">Show current profile status in Discord</p>
            </div>
            <Toggle checked={discordRpc} onChange={setDiscordRpc} label="Discord rich presence" />
          </div>
        </Card>

        <Card>
          <div className="section-header">
            <h2>Advanced</h2>
            <HardDrive size={16} color="var(--accent)" />
          </div>

          <div className="settings-row">
            <div>
              <strong style={{ color: 'var(--text-strong)' }}>Hardware acceleration</strong>
              <p className="small muted">GPU-composited UI animations and blur</p>
            </div>
            <Toggle checked={hardwareAccel} onChange={setHardwareAccel} label="Hardware acceleration" />
          </div>

          <div className="settings-row">
            <div>
              <strong style={{ color: 'var(--text-strong)' }}>Reset launcher cache</strong>
              <p className="small muted">Clear temporary metadata without removing profiles</p>
            </div>
            <Button variant="danger" size="sm" onClick={() => toast.pushToast('Launcher cache cleared', 'success')}>
              Clear cache
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
