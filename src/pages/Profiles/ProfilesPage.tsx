import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Plus, Shield, UserRound } from 'lucide-react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useToast } from '../../hooks/useToast'
import { PROFILES } from '../../data/mock'
import { cn } from '../../utils/cn'

export default function ProfilesPage() {
  const toast = useToast()
  const [activeId, setActiveId] = useState(PROFILES.find((profile) => profile.active)?.id ?? PROFILES[0].id)
  const active = PROFILES.find((profile) => profile.id === activeId) ?? PROFILES[0]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Profiles</p>
          <h1 className="page-title">Switch between curated setups</h1>
          <p className="page-subtitle">Each profile keeps mods, settings, and saves isolated.</p>
        </div>
        <Button onClick={() => toast.pushToast('Profile creator opened', 'info')}>
          <Plus size={16} />
          Create profile
        </Button>
      </div>

      <div className="grid-2">
        <Card>
          <div className="section-header">
            <h2>Your profiles</h2>
            <span className="small muted">{PROFILES.length} total</span>
          </div>
          <div className="list-stack">
            {PROFILES.map((profile, index) => (
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
                      {profile.version} · {profile.loader} · updated {profile.updated}
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

        <Card strong>
          <div className="section-header">
            <h2>Profile details</h2>
            <span className="chip chip-accent">Active config</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div className="icon-wrap accent">
              <UserRound size={18} />
            </div>
            <div>
              <strong style={{ color: 'var(--text-strong)', fontSize: 18 }}>{active.name}</strong>
              <p className="small muted" style={{ marginTop: 4 }}>
                {active.isolated ? 'Isolated profile' : 'Shared profile'}
              </p>
            </div>
          </div>

          <div className="hero-stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="stat-block">
              <span>Minecraft</span>
              <strong>{active.version}</strong>
            </div>
            <div className="stat-block">
              <span>Loader</span>
              <strong>{active.loader}</strong>
            </div>
            <div className="stat-block">
              <span>Java</span>
              <strong>{active.java}</strong>
            </div>
            <div className="stat-block">
              <span>RAM</span>
              <strong>{active.ram}</strong>
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
              onClick={() => {
                toast.pushToast(`${active.name} is now the active profile`, 'success')
              }}
            >
              Use profile
            </Button>
            <Button variant="ghost" onClick={() => toast.pushToast('Profile editor opened', 'info')}>
              Edit
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
