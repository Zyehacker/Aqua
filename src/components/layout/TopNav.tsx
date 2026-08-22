import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  User,
  LoaderCircle,
  LogIn,
  Home,
  Server,
  Package,
  Download,
  Settings2,
  Menu,
  X,
  ArrowRight,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { appActions, useAppStore } from '../../stores/appStore'
import { cn } from '../../utils/cn'
import Button from '../ui/Button'
import { useToast } from '../../hooks/useToast'
import { getAccount, getAccountTextures, listen, microsoftLogin, microsoftLogout, type MsaAccount } from '../../utils/tauri'
import { renderSkinHead } from '../../utils/skinHead'
import { useTranslation } from '../../useTranslation'

type AccountInfo = Pick<MsaAccount, 'username' | 'uuid'> & { authenticated: boolean }

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/instances', label: 'Instances', icon: Server },
  { to: '/content', label: 'Content', icon: Package },
  { to: '/downloads', label: 'Downloads', icon: Download },
  { to: '/settings', label: 'Settings', icon: Settings2 },
]

export default function TopNav() {
  const { t } = useTranslation()
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen)
  const accountOpen = useAppStore((s) => s.accountOpen)
  const location = useLocation()
  const toast = useToast()

  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [skinUrl, setSkinUrl] = useState<string | null>(null)
  const [skinHead, setSkinHead] = useState<string | null>(null)
  const [skinLoading, setSkinLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const raw = await getAccount()
        if (!cancelled && raw) {
          const username = raw.username || null
          if (username && username.trim()) {
            setAccount({ username: username.trim(), uuid: raw.uuid, authenticated: true })
            setSkinLoading(true)
            const textures = await getAccountTextures().catch(() => null)
            if (!cancelled) {
              setSkinUrl(textures?.skin_data_url ?? null)
              setSkinHead(textures?.skin_data_url ? await renderSkinHead(textures.skin_data_url) : null)
              setSkinLoading(false)
            }
          } else if (!cancelled) {
            setAccount(null); setSkinUrl(null); setSkinHead(null); setSkinLoading(false)
          }
        } else if (!cancelled) { setAccount(null); setSkinUrl(null); setSkinHead(null); setSkinLoading(false) }
      } catch {
        if (!cancelled) { setAccount(null); setSkinUrl(null); setSkinHead(null); setSkinLoading(false) }
      }
    }
    void load()
    let unlisten: (() => void) | null = null
    void listen('auth-changed', () => { void load() }).then((dispose) => { unlisten = dispose })
    return () => { cancelled = true; unlisten?.() }
  }, [])

  const isSignedIn = account !== null && account.authenticated

  return (
    <header className="top-nav">
      {/* Brand */}
      <div className="top-nav__brand">
        <img src="/favicon.png" alt="Aqua" className="top-nav__logo-img" />
        <span className="top-nav__title">Aqua</span>
      </div>

      {/* Primary navigation */}
      <nav className="top-nav__links" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => cn('top-nav__link', isActive && 'active')}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{t(`nav.${item.label.toLowerCase()}`)}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Actions */}
      <div className="top-nav__actions">
        {/* Mobile menu toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="mobile-nav-toggle"
          aria-label={mobileNavOpen ? t('common.close') : t('common.openMenu')}
          onClick={() => appActions.toggleMobileNav()}
        >
          {mobileNavOpen ? <X size={16} /> : <Menu size={16} />}
        </Button>

        {/* Account */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="top-nav__account"
            aria-expanded={accountOpen}
            aria-label={t('account.menu')}
            onClick={() => appActions.toggleAccount()}
          >
            <span className={`top-nav__avatar ${isSignedIn && skinUrl ? 'has-skin' : ''}`}>
              {isSignedIn && skinLoading ? <LoaderCircle size={12} className="spin" /> : isSignedIn && skinHead ? <img aria-hidden="true" className="top-nav__skin" src={skinHead} alt="" /> : <User size={12} />}
            </span>
            <span className="top-nav__account-label">
              {isSignedIn ? account!.username : t('account.notSignedIn')}
            </span>
          </button>

          <AnimatePresence>
            {accountOpen ? (
              <motion.div
                className="account-dropdown"
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.14 }}
              >
                {isSignedIn ? (
                  <>
                    <div className="account-dropdown__info">
                      <span className="account-dropdown__label">{t('account.signedIn')}</span>
                      <strong className="account-dropdown__name">{account!.username}</strong>
                    </div>
                    <div className="account-dropdown__actions">
                      <button
                        type="button"
                        className="account-dropdown__btn"
                        onClick={async () => {
                          appActions.closeOverlays()
                          const result = await microsoftLogin()
                          if (result) {
                            toast.pushToast('Microsoft account connected', 'success')
                            try {
                              const raw = await getAccount()
                              if (raw) {
                                const username = raw.username || null
                                if (username?.trim()) {
                                  setAccount({ username: username.trim(), uuid: raw.uuid, authenticated: true })
                                }
                              }
                            } catch { /* best effort */ }
                          }
                        }}
                      >
                        {t('account.switch')}
                      </button>
                      <button
                        type="button"
                        className="account-dropdown__btn danger"
                        onClick={async () => {
                          try {
                            await microsoftLogout()
                            setAccount(null)
                            toast.pushToast('Signed out', 'info')
                          } catch (error) {
                            toast.pushToast(error instanceof Error ? error.message : 'Sign out failed.', 'error')
                          } finally {
                            appActions.closeOverlays()
                          }
                        }}
                      >
                        {t('account.signOut')}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="account-dropdown__info">
                      <span className="account-dropdown__label">{t('account.notSignedIn')}</span>
                      <p className="account-dropdown__hint">{t('account.signInHint')}</p>
                    </div>
                    <div className="account-dropdown__actions">
                      <button
                        type="button"
                        className="account-dropdown__btn primary"
                        onClick={async () => {
                          appActions.closeOverlays()
                          const result = await microsoftLogin()
                          if (result) {
                            toast.pushToast('Microsoft account connected', 'success')
                            try {
                              const raw = await getAccount()
                              if (raw) {
                                const username = raw.username || null
                                if (username?.trim()) {
                                  setAccount({ username: username.trim(), uuid: raw.uuid, authenticated: true })
                                }
                              }
                            } catch { /* best effort */ }
                          } else {
                            toast.pushToast('Microsoft login requires the desktop app.', 'info')
                          }
                        }}
                      >
                        <LogIn size={13} />
                        {t('account.signIn')}
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile nav overlay */}
      <AnimatePresence>
        {mobileNavOpen ? (
          <motion.nav
            className="mobile-nav"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            aria-label="Mobile navigation"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => appActions.closeOverlays()}
                className={cn('mobile-nav__link', location.pathname === item.to && 'active')}
              >
                <span>{t(`nav.${item.label.toLowerCase()}`)}</span>
                <ArrowRight size={14} />
              </NavLink>
            ))}
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
