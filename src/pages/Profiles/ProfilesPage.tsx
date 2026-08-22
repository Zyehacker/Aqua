import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Plus, Shield, UserRound, Layers } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import * as tauri from '../../utils/tauri'
import { cn } from '../../utils/cn'
import { useTranslation } from '../../useTranslation'

export default function ProfilesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const [instances, setInstances] = useState<tauri.BackendInstance[]>([])
  const [settings, setSettings] = useState<tauri.LauncherSettings | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [insts, setts] = await Promise.all([
          tauri.listInstances(),
          tauri.getSettings(),
        ])
        if (!cancelled) {
          const list = insts ?? []
          setInstances(list)
          setSettings(setts)
          const currentActive = setts?.instance_id ?? list[0]?.id ?? null
          setActiveId(currentActive)
        }
      } catch {
        if (!cancelled) {
          setInstances([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const active = instances.find((profile) => profile.id === activeId) ?? instances[0] ?? null

  const handleSelectProfile = async (instanceId: string) => {
    setActiveId(instanceId)
    if (settings) {
      const updated = { ...settings, instance_id: instanceId }
      setSettings(updated)
      try {
        await tauri.saveSettings(updated)
        toast.pushToast('Active profile updated', 'success')
      } catch {
        toast.pushToast('Failed to save active profile', 'error')
      }
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t('profiles.title')}</p>
          <h1 className="page-title">Switch between curated setups</h1>
          <p className="page-subtitle">Each profile keeps mods, settings, and saves isolated.</p>
        </div>
        <Button onClick={() => navigate('/instances')}>
          <Plus size={16} />
          Create profile
        </Button>
      </div>

      {instances.length === 0 && !loading ? (
        <Card>
          <EmptyState
            title="No profiles found"
            description="Create an instance to configure isolated mods, settings, and loaders."
            actionLabel="Create profile"
            onAction={() => navigate('/instances')}
            icon={<Layers size={20} />}
          />
        </Card>
      ) : (
        <div className="grid-2">
          <Card>
            <div className="section-header">
              <h2>{t('profiles.yourProfiles')}</h2>
              <span className="small muted">{instances.length} total</span>
            </div>
            <div className="list-stack">
              {instances.map((profile, index) => (
                <motion.button
                  key={profile.id}
                  type="button"
                  className={cn('profile-card', activeId === profile.id && 'list-row active')}
                  style={{ width: '100%', textAlign: 'left' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.04 }}
                  onClick={() => setActiveId(profile.id)}
                >
                  <div className="profile-card__top">
                    <div>
                      <strong style={{ color: 'var(--text-strong)', fontSize: 15 }}>{profile.name}</strong>
                      <p className="small muted" style={{ marginTop: 6 }}>
                        {profile.mc_version || profile.installed_version_id} · {profile.loader} · {profile.mod_count} mods
                      </p>
                    </div>
                    {activeId === profile.id ? (
                      <span className="chip chip-aqua">
                        <Check size={12} />
                        Selected
                      </span>
                    ) : (
                      <span className="chip">Ready</span>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          </Card>

          {active && (
            <Card strong>
              <div className="section-header">
                <h2>{t('profiles.details')}</h2>
                <span className="chip chip-accent">Active config</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div className="icon-wrap accent">
                  <UserRound size={18} />
                </div>
                <div>
                  <strong style={{ color: 'var(--text-strong)', fontSize: 18 }}>{active.name}</strong>
                  <p className="small muted" style={{ marginTop: 4 }}>
                    Isolated profile
                  </p>
                </div>
              </div>

              <div className="hero-stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="stat-block">
                  <span>Minecraft</span>
                  <strong>{active.mc_version || active.installed_version_id}</strong>
                </div>
                <div className="stat-block">
                  <span>Loader</span>
                  <strong>{active.loader} {active.loader_version ? `(${active.loader_version})` : ''}</strong>
                </div>
                <div className="stat-block">
                  <span>Mods</span>
                  <strong>{active.mod_count} installed</strong>
                </div>
                <div className="stat-block">
                  <span>RAM</span>
                  <strong>{active.memory_mb ? `${Math.round(active.memory_mb / 1024)} GB` : `${Math.round((settings?.ram_mb ?? 2048) / 1024)} GB`}</strong>
                </div>
              </div>

              <div className="list-row" style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Shield size={16} color="var(--accent)" />
                  <div>
                    <strong>Content isolation</strong>
                    <p className="small muted">Mods and packs stay scoped to this profile</p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                <Button
                  onClick={() => handleSelectProfile(active.id)}
                >
                  Use profile
                </Button>
                <Button variant="ghost" onClick={() => navigate('/instances')}>
                  Manage
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

