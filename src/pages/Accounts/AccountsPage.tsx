import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Edit3, Link2, LoaderCircle, LogIn, LogOut, Plus, ShieldCheck, Trash2, UserRound, X } from 'lucide-react'
import Button from '../../components/ui/Button'
import { useToast } from '../../hooks/useToast'
import { getAccount, getAccountTextures, listAccounts, microsoftLogin, microsoftLogout, removeAccount, switchAccount, type AccountSummary } from '../../utils/tauri'
import { renderSkinHead } from '../../utils/skinHead'
import { useTranslation } from '../../useTranslation'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { useAquaAuth } from '../../hooks/useAquaAuthHook'
import { appActions } from '../../stores/appStore'
import { validateMinecraftUsername } from '../../utils/minecraftUsername'
import { maskEmail } from '../../utils/privacy'
import { useMaintenance } from '../../hooks/useMaintenanceHook'

type AccountInfo = AccountSummary

export default function AccountsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const aqua = useAquaAuth()
  const maintenance = useMaintenance()
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const { settings, updateSettings } = useLauncherData()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skinUrl, setSkinUrl] = useState<string | null>(null)
  const [skinHead, setSkinHead] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)

  const loadAccount = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const raw = await getAccount()
      setAccounts(await listAccounts())
      const username = raw?.username || ''
      setAccount(raw && username.trim() ? { username: username.trim(), uuid: raw.uuid } : null)
      const texture = raw ? (await getAccountTextures().catch(() => null))?.skin_data_url ?? null : null
      setSkinUrl(texture)
      setSkinHead(texture ? await renderSkinHead(texture, 64) : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load account.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => { void loadAccount() }, 0)
    return () => window.clearTimeout(id)
  }, [loadAccount])

  const signIn = async () => {
    setBusy(true)
    try {
      const result = await microsoftLogin()
      if (result) {
        toast.pushToast(t('account.connectSuccess'), 'success')
        await updateSettings({ offline_mode: false })
        await loadAccount()
      } else {
        toast.pushToast('Microsoft login requires the desktop app.', 'info')
      }
    } catch (e) {
      toast.pushToast(e instanceof Error ? e.message : 'Login failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    setBusy(true)
    try {
      await microsoftLogout()
      setAccount(null)
      toast.pushToast(t('account.signOut'), 'info')
    } catch (e) {
      toast.pushToast(e instanceof Error ? e.message : 'Sign out failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const addOfflineProfile = async () => {
    const name = window.prompt('Minecraft username', 'AquaPlayer')?.trim()
    if (!name) return
    const validationError = validateMinecraftUsername(name)
    if (validationError) { toast.pushToast(validationError, 'error'); return }
    const existing = (settings?.offline_profiles ?? []).find(
      (profile) => profile.name.trim().toLowerCase() === name.toLowerCase(),
    )
    if (existing) {
      await updateSettings({
        active_offline_profile_id: existing.id,
        offline_profile_name: existing.name,
        offline_mode: true,
      })
      toast.pushToast(`Switched to existing profile "${existing.name}"`, 'info')
      return
    }
    const id = `offline-${crypto.randomUUID()}`
    const profiles = [...(settings?.offline_profiles ?? []), { id, name }]
    await updateSettings({ offline_profiles: profiles, active_offline_profile_id: id, offline_profile_name: name, offline_mode: true })
    toast.pushToast('Offline profile created', 'success')
  }

  const saveOfflineName = async (id: string) => {
    const name = editingName.trim()
    const validationError = validateMinecraftUsername(name)
    if (validationError) { setRenameError(validationError); return }
    const profiles = (settings?.offline_profiles ?? []).map((profile) => profile.id === id ? { ...profile, name } : profile)
    const active = settings?.active_offline_profile_id === id
    await updateSettings({ offline_profiles: profiles, ...(active ? { offline_profile_name: name } : {}) })
    setEditingId(null); setRenameError(null)
    toast.pushToast('Offline Minecraft username updated', 'success')
  }

  const removeOfflineProfile = async (id: string) => {
    const profiles = (settings?.offline_profiles ?? []).filter((profile) => profile.id !== id)
    if (!profiles.length) return
    const active = profiles[0]
    await updateSettings({ offline_profiles: profiles, active_offline_profile_id: active.id, offline_profile_name: active.name })
  }

  const selectMicrosoftAccount = async (uuid: string) => {
    try {
      await switchAccount(uuid)
      await updateSettings({ offline_mode: false })
      await loadAccount()
    } catch (e) {
      toast.pushToast(e instanceof Error ? e.message : 'Unable to switch account.', 'error')
    }
  }


  return (
    <div className="page accounts-page">
      <div className="page-header">
        <div><p className="eyebrow">Accounts</p><h1 className="page-title">Identity and profiles</h1><p className="page-subtitle">Manage your Aqua account separately from Minecraft launch identities.</p></div>
      </div>

      {error ? (
        <div className="state-banner state-banner--error" role="alert">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void loadAccount()}>{t('common.retry')}</Button>
        </div>
      ) : null}

      <div className="accounts-workspace">
        <section className="accounts-section aqua-account-section">
          <div className="accounts-section__heading"><div><span className="eyebrow">Aqua account</span><h2>{aqua.isSignedIn ? (aqua.profile?.display_name || aqua.profile?.username || 'Signed in') : 'Not signed in'}</h2></div><ShieldCheck size={18} className={aqua.isSignedIn ? 'accounts-status--good' : 'accounts-status--muted'} /></div>
          {aqua.loading ? <div className="accounts-inline-state"><LoaderCircle size={16} className="spin" /> Restoring account</div> : aqua.isSignedIn ? <div className="accounts-details"><div><span>Email</span><strong>{maskEmail(aqua.user?.email)}</strong></div><div><span>Verification</span><strong className="accounts-status--good"><CheckCircle2 size={14} /> Email confirmed</strong></div><div><span>Aqua username</span><strong>@{aqua.profile?.username ?? 'Not set'}</strong></div></div> : <p className="accounts-muted">Sign in to use Aqua social features and account services.</p>}
          <div className="accounts-actions"><Button variant={aqua.isSignedIn ? 'ghost' : 'aqua'} size="sm" disabled={maintenance.restricted} title={maintenance.restricted ? 'Aqua Account is unavailable during maintenance.' : undefined} onClick={() => appActions.toggleAccount()}><LogIn size={14} />{maintenance.restricted ? 'Aqua Account unavailable' : aqua.isSignedIn ? 'Manage Aqua account' : 'Sign in or create account'}</Button>{aqua.isSignedIn ? <Button variant="ghost" size="sm" disabled={maintenance.restricted} onClick={() => void aqua.signOut()}><LogOut size={14} />Sign out</Button> : null}</div>
        </section>
        <section className="accounts-section minecraft-section">
          <div className="accounts-section__heading"><div><span className="eyebrow">Minecraft identities</span><h2>{settings?.offline_mode ? 'Offline mode' : account ? account.username : 'No active identity'}</h2></div><Link2 size={18} className="accounts-status--muted" /></div>
          <div className="accounts-details"><div><span>Active launch identity</span><strong>{settings?.offline_mode ? (settings?.offline_profiles?.find((profile) => profile.id === settings.active_offline_profile_id)?.name ?? settings?.offline_profile_name ?? 'Offline') : account?.username ?? 'None'}</strong></div><div><span>Linked Minecraft identity</span><strong>{account ? `${account.username} · ${account.uuid}` : 'No Microsoft account linked'}</strong></div><div><span>Mode</span><strong>{settings?.offline_mode ? 'Local offline profile' : account ? 'Microsoft account' : 'Not configured'}</strong></div></div>
        </section>
      </div>

      {loading ? (
        <div className="account-card accounts-page__primary">
          <div className="account-card__icon">
            <LoaderCircle size={20} className="spin" />
          </div>
          <div className="account-card__body">
            <span className="account-card__label">{t('account.loading')}</span>
          </div>
        </div>
      ) : (
        <div className="account-card">
          <div className={`account-card__icon ${skinUrl ? 'has-skin' : ''}`}>
            {skinHead ? <img className="account-card__skin" src={skinHead} alt="" /> : <UserRound size={20} />}
          </div>
          <div className="account-card__body">
            <span className="account-card__label">{t('account.microsoft')}</span>
            <strong className="account-card__name">
              {account?.username ?? t('account.notSignedIn')}
            </strong>
            <p className="account-card__hint">
              {account
                ? t('account.authenticated')
                : t('account.signInHint')}
            </p>
          </div>
          {account ? <CheckCircle2 className="account-card__check" size={18} /> : null}
        </div>
      )}

      {!loading && !error ? <section className="account-list accounts-page__list">
        {accounts.map((entry) => <div className="account-list__row" key={entry.uuid}>
          <div><strong>{entry.username}</strong><span>{entry.uuid}</span></div>
          {entry.uuid === account?.uuid && !settings?.offline_mode ? <span className="chip chip-success">Active</span> : <Button variant="ghost" size="sm" onClick={() => void selectMicrosoftAccount(entry.uuid)}>Use account</Button>}
          <Button variant="ghost" size="icon" aria-label={`Remove ${entry.username}`} onClick={() => void removeAccount(entry.uuid).then(loadAccount)}><Trash2 size={14} /></Button>
        </div>)}
        {(settings?.offline_profiles ?? []).map((profile) => {
          const editing = editingId === profile.id
          return <div className="account-list__row" key={profile.id}>
            <div className="account-list__identity"><UserRound size={15} /><div>{editing ? <input className="account-rename-input" value={editingName} autoFocus onChange={(event) => { setEditingName(event.target.value); setRenameError(null) }} onKeyDown={(event) => { if (event.key === 'Enter') void saveOfflineName(profile.id); if (event.key === 'Escape') { setEditingId(null); setRenameError(null) } }} /> : <strong>{profile.name}</strong>}<span>{settings?.offline_mode && settings.active_offline_profile_id === profile.id ? 'Active offline profile' : 'Local Minecraft profile'}</span>{editing && renameError ? <small className="aqua-account-error">{renameError}</small> : null}</div></div>
            <div className="account-list__row-actions">{settings?.offline_mode && settings.active_offline_profile_id === profile.id ? <span className="chip chip-muted">Active</span> : <Button variant="ghost" size="sm" onClick={() => void updateSettings({ offline_mode: true, active_offline_profile_id: profile.id, offline_profile_name: profile.name })}>Use</Button>}{editing ? <><Button variant="aqua" size="icon" aria-label="Save username" onClick={() => void saveOfflineName(profile.id)}><CheckCircle2 size={14} /></Button><Button variant="ghost" size="icon" aria-label="Cancel rename" onClick={() => { setEditingId(null); setRenameError(null) }}><X size={14} /></Button></> : <Button variant="ghost" size="icon" aria-label={`Rename ${profile.name}`} onClick={() => { setEditingId(profile.id); setEditingName(profile.name); setRenameError(null) }}><Edit3 size={14} /></Button>}<Button variant="ghost" size="icon" aria-label={`Remove ${profile.name}`} disabled={(settings?.offline_profiles?.length ?? 0) <= 1} onClick={() => void removeOfflineProfile(profile.id)}><Trash2 size={14} /></Button></div>
          </div>
        })}
      </section> : null}

      {!loading && !error ? (
        <div className="account-actions">
          {account ? (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => void signIn()}>
                <LogIn size={15} />
                {t('account.switch')}
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => void signOut()}>
                {busy ? <LoaderCircle size={15} className="spin" /> : <LogOut size={15} />}
                {t('account.signOut')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => void addOfflineProfile()}>
                <Plus size={15} />
                Offline profile
              </Button>
              <Button variant="aqua" disabled={busy} onClick={() => void signIn()}>
                {busy ? <LoaderCircle size={15} className="spin" /> : <LogIn size={15} />}
                {busy ? 'Signing in...' : t('account.signIn')}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
