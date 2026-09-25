import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, LoaderCircle, Plus, Trash2, UserRound } from 'lucide-react'
import Button from '../../components/ui/Button'
import LoadingIndicator from '../../components/ui/LoadingIndicator'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { useMaintenance } from '../../hooks/useMaintenanceHook'
import { validateMinecraftUsername } from '../../utils/minecraftUsername'
import { listAccounts, microsoftLogin, switchAccount, type AccountSummary } from '../../utils/tauri'
import { useTranslation } from '../../useTranslation'

const MAX_MICROSOFT_ACCOUNTS = 5
  const MAX_OFFLINE_ACCOUNTS = 2
  type OfflineProfile = { id: string; name: string }

  export default function ProfilesPage() {
    const { t } = useTranslation(); const toast = useToast(); const maintenance = useMaintenance()
    const { settings, updateSettings } = useLauncherData(); const [accounts, setAccounts] = useState<AccountSummary[]>([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState<string | null>(null); const [offlineDialogOpen, setOfflineDialogOpen] = useState(false); const [offlineName, setOfflineName] = useState(''); const [offlineError, setOfflineError] = useState<string | null>(null)
    const refresh = useCallback(async () => { setLoading(true); try { setAccounts(await listAccounts()) } catch (error) { toast.pushToast(error instanceof Error ? error.message : 'Unable to load Microsoft accounts.', 'error') } finally { setLoading(false) } }, [toast])
    useEffect(() => { const id = window.setTimeout(() => { void refresh() }, 0); return () => window.clearTimeout(id) }, [refresh])
    const offline = settings?.offline_profiles ?? []; const activeOffline = settings?.offline_mode ? settings.active_offline_profile_id : null; const activeMicrosoft = !settings?.offline_mode ? accounts.find((account) => account.username === settings?.username)?.uuid : null
    const addMicrosoft = async () => { if (accounts.length >= MAX_MICROSOFT_ACCOUNTS) return toast.pushToast('Microsoft account limit reached (5/5).', 'warning'); setBusy('add-ms'); try { await microsoftLogin(); await updateSettings({ offline_mode: false }); await refresh(); toast.pushToast('Microsoft account added.', 'success') } catch (error) { toast.pushToast(error instanceof Error ? error.message : 'Microsoft sign-in failed.', 'error') } finally { setBusy(null) } }
    const addOffline = async () => { if (offline.length >= MAX_OFFLINE_ACCOUNTS) return toast.pushToast('Offline account limit reached (2/2).', 'warning'); const name = offlineName.trim(); const invalid = validateMinecraftUsername(name); if (invalid) { setOfflineError(invalid); return } if (offline.some((profile) => profile.name.trim().toLowerCase() === name.toLowerCase())) { setOfflineError('An offline account with this name already exists.'); return } const profile = { id: `offline-${crypto.randomUUID()}`, name }; setBusy('add-offline'); try { await updateSettings({ offline_profiles: [...offline, profile], active_offline_profile_id: profile.id, offline_profile_name: name, offline_mode: true }); setOfflineDialogOpen(false); setOfflineName(''); setOfflineError(null); toast.pushToast('Offline account added.', 'success') } catch (error) { toast.pushToast(error instanceof Error ? error.message : 'Unable to save offline account.', 'error') } finally { setBusy(null) } }
    const selectMs = async (account: AccountSummary) => { setBusy(account.uuid); try { await switchAccount(account.uuid); await updateSettings({ offline_mode: false, username: account.username }); await refresh(); toast.pushToast(`${account.username} selected.`, 'success') } catch (error) { toast.pushToast(error instanceof Error ? error.message : 'Unable to select account.', 'error') } finally { setBusy(null) } }
    const selectOffline = async (profile: OfflineProfile) => { setBusy(profile.id); try { await updateSettings({ offline_mode: true, active_offline_profile_id: profile.id, offline_profile_name: profile.name }); toast.pushToast(`${profile.name} selected.`, 'success') } catch (error) { toast.pushToast(error instanceof Error ? error.message : 'Unable to select account.', 'error') } finally { setBusy(null) } }
    const removeOffline = async (id: string) => { if (offline.length <= 1) return toast.pushToast('Keep at least one offline profile.', 'warning'); const next = offline.filter((profile) => profile.id !== id); try { await updateSettings({ offline_profiles: next, active_offline_profile_id: next[0].id, offline_profile_name: next[0].name }); toast.pushToast('Offline account removed.', 'success') } catch (error) { toast.pushToast(error instanceof Error ? error.message : 'Unable to remove account.', 'error') } }
    const removeMs = async (uuid: string) => { setBusy(uuid); try { const result = await import('../../utils/tauri'); await result.removeAccount(uuid); await refresh(); toast.pushToast('Microsoft account removed.', 'success') } catch (error) { toast.pushToast(error instanceof Error ? error.message : 'Unable to remove account.', 'error') } finally { setBusy(null) } }
    return <div className="page profiles-page"><div className="page-header"><div><p className="eyebrow">{t('profiles.title')}</p><h1 className="page-title">Minecraft accounts</h1><p className="page-subtitle">Manage the accounts Aqua Client uses to launch Minecraft.</p></div></div><div className="profiles-layout"><AccountSection title="Microsoft Accounts" count={`${accounts.length}/${MAX_MICROSOFT_ACCOUNTS}`}>{loading ? <LoadingIndicator label="Loading Microsoft accounts" /> : accounts.length ? accounts.map((account) => <AccountCard key={account.uuid} name={account.username} type="Microsoft" selected={activeMicrosoft === account.uuid} busy={busy === account.uuid} onSelect={() => void selectMs(account)} onRemove={() => void removeMs(account.uuid)} />) : <EmptyState title="No Microsoft accounts" description="Add a Microsoft account to launch authenticated Minecraft sessions." icon={<UserRound size={20} />} />}<Button variant="aqua" size="sm" disabled={busy !== null || accounts.length >= 5 || maintenance.restricted} onClick={() => void addMicrosoft()}><Plus size={14} />{accounts.length >= 5 ? 'Limit reached (5/5)' : 'Add Microsoft Account'}</Button></AccountSection><AccountSection title="Offline Accounts" count={`${offline.length}/${MAX_OFFLINE_ACCOUNTS}`}><AnimatePresence initial={false}>{offline.map((profile) => <AccountCard key={profile.id} name={profile.name} type="Offline" selected={activeOffline === profile.id} busy={busy === profile.id} onSelect={() => void selectOffline(profile)} onRemove={offline.length > 1 ? () => void removeOffline(profile.id) : undefined} />)}</AnimatePresence><Button variant="ghost" size="sm" disabled={busy !== null || offline.length >= 2} onClick={() => { setOfflineName(''); setOfflineError(null); setOfflineDialogOpen(true) }}><Plus size={14} />{offline.length >= 2 ? 'Limit reached (2/2)' : 'Add Offline Account'}</Button></AccountSection></div><AnimatePresence>{offlineDialogOpen ? <motion.div className="dialog-backdrop" role="presentation" onMouseDown={() => setOfflineDialogOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section className="dialog profiles-offline-dialog" role="dialog" aria-modal="true" aria-labelledby="offline-dialog-title" onMouseDown={(event) => event.stopPropagation()} initial={{ opacity: 0, y: 8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: .99 }}><div className="dialog__header"><div><p className="eyebrow">Offline account</p><h2 id="offline-dialog-title">Add Offline Account</h2></div><Button variant="ghost" size="icon" aria-label="Close" onClick={() => setOfflineDialogOpen(false)}>×</Button></div><label className="profiles-offline-dialog__field"><span>Minecraft username</span><input autoFocus value={offlineName} maxLength={16} onChange={(event) => { setOfflineName(event.target.value); setOfflineError(null) }} placeholder="Player123" onKeyDown={(event) => { if (event.key === 'Enter') void addOffline(); if (event.key === 'Escape') setOfflineDialogOpen(false) }} />{offlineError ? <small role="alert">{offlineError}</small> : <small>3-16 letters, numbers, or underscores.</small>}</label><div className="dialog__actions"><Button variant="ghost" onClick={() => setOfflineDialogOpen(false)}>Cancel</Button><Button variant="aqua" disabled={!offlineName.trim() || busy === 'add-offline'} onClick={() => void addOffline()}>{busy === 'add-offline' ? <LoaderCircle size={14} className="spin" /> : null}Add Account</Button></div></motion.section></motion.div> : null}</AnimatePresence></div>
  }

  function AccountSection({ title, count, children }: { title: string; count: string; children: ReactNode }) { return <section className="profiles-account-section"><div className="profiles-section-heading"><h2>{title}</h2><span>{count}</span></div><div className="profiles-account-list">{children}</div></section> }
  function AccountCard({ name, type, selected, busy, onSelect, onRemove }: { name: string; type: string; selected: boolean; busy: boolean; onSelect: () => void; onRemove?: () => void }) { return <motion.article className={`profiles-account-card${selected ? ' is-selected' : ''}`} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .18 }}><div className="profiles-account-icon"><UserRound size={16} /></div><div className="profiles-account-copy"><strong>{name}</strong><span>{type}</span></div>{selected ? <span className="chip chip-aqua"><Check size={12} /> Selected</span> : <Button variant="ghost" size="sm" disabled={busy} onClick={onSelect}>{busy ? <LoaderCircle size={13} className="spin" /> : 'Select'}</Button>}{onRemove ? <Button variant="ghost" size="icon" disabled={busy} aria-label={`Remove ${name}`} onClick={onRemove}><Trash2 size={14} /></Button> : null}</motion.article> }

/* Legacy instance-profile implementation retained below only as a migration note.
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
    <div className="page profiles-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t('profiles.title')}</p>
          <h1 className="page-title">Switch between saved setups</h1>
          <p className="page-subtitle">Each profile keeps mods, settings, and saves isolated.</p>
        </div>
        <Button onClick={() => navigate('/instances')}>
          <Plus size={16} />
          Create profile
        </Button>
      </div>

      {loading ? (
        <LoadingIndicator label="Loading profiles" detail="Reading your saved Minecraft setups." />
      ) : instances.length === 0 ? (
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
        <div className="profiles-layout">
          <Card className="profiles-list-card">
            <div className="section-header">
              <h2>{t('profiles.yourProfiles')}</h2>
              <span className="small muted">{instances.length} total</span>
            </div>
            <div className="list-stack">
              {instances.map((profile, index) => (
                <motion.button
                  key={profile.id}
                  type="button"
                  className={cn('profile-card', activeId === profile.id && 'is-active')}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.04 }}
                  onClick={() => setActiveId(profile.id)}
                >
                  <div className="profile-card__top">
                    <div>
                      <strong>{profile.name}</strong>
                      <p className="small muted">
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
            <Card strong className="profiles-detail-card">
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
*/
