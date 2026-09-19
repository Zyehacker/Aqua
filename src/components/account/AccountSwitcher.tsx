import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, LoaderCircle, Plus, UserRound } from 'lucide-react'
import { appActions } from '../../stores/appStore'
import { cn } from '../../utils/cn'
import { getAccount, getAccountTextures, listen, listAccounts, switchAccount, type MsaAccount } from '../../utils/tauri'
import { renderSkinHead } from '../../utils/skinHead'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { useAquaAuth } from '../../hooks/useAquaAuthHook'

type AccountInfo = Pick<MsaAccount, 'username' | 'uuid'> & { authenticated: boolean }

/**
 * Nav account control. Shows the active account as avatar + name; clicking
 * opens a dropdown grouping every account type (Aqua / Microsoft / Offline)
 * so the user can switch accounts in place, with "+ Add account" at the foot.
 */
export default function AccountSwitcher() {
  const { settings, updateSettings } = useLauncherData()
  const aqua = useAquaAuth()

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [skinUrl, setSkinUrl] = useState<string | null>(null)
  const [skinHead, setSkinHead] = useState<string | null>(null)
  const [skinLoading, setSkinLoading] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)

  const refreshAccounts = useCallback(async () => {
    try {
      const raw = await getAccount()
      const list = await listAccounts()
      setAccounts(list.map((entry) => ({ username: entry.username, uuid: entry.uuid, authenticated: true })))
      const username = raw?.username?.trim()
      if (raw && username) {
        setAccount({ username, uuid: raw.uuid, authenticated: true })
        setSkinLoading(true)
        const textures = await getAccountTextures().catch(() => null)
        setSkinUrl(textures?.skin_data_url ?? null)
        setSkinHead(textures?.skin_data_url ? await renderSkinHead(textures.skin_data_url) : null)
        setSkinLoading(false)
      } else {
        setAccount(null); setSkinUrl(null); setSkinHead(null); setSkinLoading(false)
      }
    } catch {
      setAccount(null); setAccounts([]); setSkinUrl(null); setSkinHead(null); setSkinLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshAccounts() }, 0)
    let unlisten: (() => void) | null = null
    void listen('auth-changed', () => { void refreshAccounts() }).then((dispose) => { unlisten = dispose })
    return () => { window.clearTimeout(timer); unlisten?.() }
  }, [refreshAccounts])

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const offlineProfiles = settings?.offline_profiles ?? []
  const offlineMode = settings?.offline_mode ?? false
  const offlineName = settings?.offline_profile_name || 'Aqua Player'
  const activeOfflineId = settings?.active_offline_profile_id

  const aquaSignedIn = aqua.isSignedIn
  const activeMsId = account?.uuid ?? null

  // Which account is "active" for the trigger: offline, then Microsoft, then Aqua.
  const triggerLabel = offlineMode
    ? offlineName
    : account
      ? account.username
      : aquaSignedIn
        ? aqua.profile?.username || aqua.profile?.display_name || 'Aqua'
        : 'Not signed in'

  const quickSwitchMs = async (uuid: string) => {
    if (switching) return
    setSwitching(uuid)
    try {
      await switchAccount(uuid)
      // Switching to a Microsoft account must explicitly disable offline mode in launcher settings,
      // ensuring the launch pipeline and all views treat this Microsoft account as the single active account.
      await updateSettings({ offline_mode: false })
      await refreshAccounts()
    } finally {
      setSwitching(null)
      setOpen(false)
    }
  }

  const quickSwitchOffline = async (id: string, name: string) => {
    if (offlineMode && id === activeOfflineId) return
    setSwitching(id)
    try {
      await updateSettings({ offline_mode: true, active_offline_profile_id: id, offline_profile_name: name })
    } finally {
      setSwitching(null)
      setOpen(false)
    }
  }

  return (
    <div className="acct-switcher" ref={rootRef}>
      <button
        type="button"
        className="top-nav__account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={cn('top-nav__avatar', account && skinUrl && 'has-skin')}>
          {account && skinLoading
            ? <LoaderCircle size={12} className="spin" />
            : account && skinHead
              ? <img aria-hidden="true" className="top-nav__skin" src={skinHead} alt="" />
              : <UserRound size={12} />}
        </span>
        <span className="top-nav__account-label">{triggerLabel}</span>
        <span
          className={cn(
            'top-nav__aqua-status',
            aqua.loading
              ? 'is-loading'
              : aquaSignedIn
                ? 'is-synced'
                : 'is-off',
          )}
        />
        <ChevronDown size={12} className="top-nav__chevron" style={open ? { transform: 'rotate(180deg)' } : undefined} />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="acct-menu"
            role="menu"
            aria-label="Accounts"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Aqua */}
            <div className="acct-menu__group">
              <span className="acct-menu__label">Aqua</span>
              {aquaSignedIn ? (
                <button type="button" role="menuitem" className="acct-item" onClick={() => { setOpen(false); appActions.toggleAccount() }}>
                  <span className="acct-item__avatar acct-item__avatar--aqua">
                    {aqua.profile?.avatar_url
                      ? <img src={aqua.profile.avatar_url} alt="" />
                      : (aqua.profile?.display_name || aqua.profile?.username || 'A').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="acct-item__body">
                    <strong>{aqua.profile?.display_name || aqua.profile?.username}</strong>
                    <span>@{aqua.profile?.username || 'manage'} · manage</span>
                  </span>
                  {/* Aqua is the trigger only when neither Offline nor Microsoft owns the active slot. */}
                  {!offlineMode && !account ? <Check size={14} className="acct-item__check" aria-hidden="true" /> : null}
                </button>
              ) : (
                <button type="button" role="menuitem" className="acct-item" onClick={() => { setOpen(false); appActions.toggleAccount() }}>
                  <span className="acct-item__avatar acct-item__avatar--aqua"><UserRound size={14} /></span>
                  <span className="acct-item__body"><strong>Sign in to Aqua</strong><span>Friends and profile features</span></span>
                </button>
              )}
            </div>

            {/* Microsoft */}
            <div className="acct-menu__group">
              <span className="acct-menu__label">Microsoft</span>
              {accounts.length ? accounts.map((entry) => {
                // Microsoft is the active trigger only when offline mode is off;
                // otherwise the offline profile owns the active slot (mutually
                // exclusive with the Offline group's checkmark).
                const isActive = !offlineMode && entry.uuid === activeMsId
                return (
                  <button
                    key={entry.uuid}
                    type="button"
                    role="menuitem"
                    className={cn('acct-item', isActive && 'acct-item--active')}
                    disabled={switching === entry.uuid}
                    onClick={() => void quickSwitchMs(entry.uuid)}
                  >
                    <span className={cn('acct-item__avatar', entry.uuid === activeMsId && skinUrl && 'has-skin')}>
                      {entry.uuid === activeMsId && skinHead ? <img className="acct-item__skin" src={skinHead} alt="" /> : <UserRound size={14} />}
                    </span>
                    <span className="acct-item__body"><strong>{entry.username}</strong><span>{isActive ? 'Active account' : 'Switch'}</span></span>
                    {isActive ? <Check size={14} className="acct-item__check" aria-hidden="true" /> : null}
                  </button>
                )
              }) : (
                <div className="acct-item acct-item--empty"><span>No Microsoft account</span></div>
              )}
            </div>

            {/* Offline */}
            <div className="acct-menu__group">
              <span className="acct-menu__label">Offline</span>
              {offlineProfiles.length ? offlineProfiles.map((profile) => {
                const isActive = offlineMode && profile.id === activeOfflineId
                return (
                  <button
                    key={profile.id}
                    type="button"
                    role="menuitem"
                    className={cn('acct-item', isActive && 'acct-item--active')}
                    disabled={switching === profile.id}
                    onClick={() => void quickSwitchOffline(profile.id, profile.name)}
                  >
                    <span className="acct-item__avatar acct-item__avatar--offline"><UserRound size={14} /></span>
                    <span className="acct-item__body"><strong>{profile.name}</strong><span>{isActive ? 'Active offline' : 'Use offline'}</span></span>
                    {isActive ? <Check size={14} className="acct-item__check" aria-hidden="true" /> : null}
                  </button>
                )
              }) : (
                <div className="acct-item acct-item--empty"><span>No offline profiles</span></div>
              )}
            </div>

            <button type="button" role="menuitem" className="acct-menu__add" onClick={() => { setOpen(false); appActions.toggleAccount() }}>
              <Plus size={14} />
              Add account
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}