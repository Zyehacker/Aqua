import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  Menu,
  MessageCircle,
  Moon,
  SunMedium,
  User,
  Waves,
  X,
  ArrowRight,
  FolderOpen,
  Server,
  Download,
  Sparkles,
  Settings2,
} from 'lucide-react'

const ICON_MAP: Record<string, any> = {
  '/': Waves,
  '/instances': Server,
  '/content': FolderOpen,
  '/profiles': User,
  '/downloads': Download,
  '/performance': Sparkles,
  '/settings': Settings2,
}
import { NAV_ITEMS, CURRENT_PROFILE } from '../../data/mock'
import { appActions, useAppStore } from '../../stores/appStore'
import { cn } from '../../utils/cn'
import Button from '../ui/Button'
import { useToast } from '../ToastProvider'

export default function TopNav() {
  const theme = useAppStore((s) => s.theme)
  const notificationsOpen = useAppStore((s) => s.notificationsOpen)
  const accountOpen = useAppStore((s) => s.accountOpen)
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen)
  const location = useLocation()
  const toast = useToast()

  return (
    <header className="top-nav">
      <div className="top-nav__brand">
        <div className="top-nav__logo" aria-hidden="true">
          <Waves size={20} />
        </div>
        <div>
          <div className="top-nav__title">Aqua Client</div>
          <div className="top-nav__subtitle">Premium Launcher</div>
        </div>
      </div>

      <nav className="top-nav__links" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const Icon = ICON_MAP[item.to] ?? ArrowRight
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              aria-label={item.label}
              className={({ isActive }) => cn('top-nav__link', isActive && 'active')}
            >
              <Icon size={16} className="icon" aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="top-nav__actions">
        <Button
          variant="ghost"
          size="icon"
          className="mobile-nav-toggle"
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
          onClick={() => appActions.toggleMobileNav()}
        >
          {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
        </Button>

        <div style={{ position: 'relative' }}>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            onClick={() => appActions.toggleNotifications()}
          >
            <Bell size={18} />
          </Button>
          <AnimatePresence>
            {notificationsOpen ? (
              <motion.div
                className="glass-strong"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18 }}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 48,
                  width: 280,
                  padding: 14,
                  zIndex: 40,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{ color: 'var(--text-strong)', fontSize: 14 }}>Notifications</strong>
                  <span className="chip chip-aqua">2 new</span>
                </div>
                <p className="small muted" style={{ marginTop: 8 }}>
                  Create+ finished staging pack metadata.
                </p>
                <p className="small muted" style={{ marginTop: 8 }}>
                  Profile sync completed for {CURRENT_PROFILE.name}.
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Open Discord"
          onClick={() => toast.pushToast('Opening Aqua Discord', 'info')}
        >
          <MessageCircle size={18} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label={theme === 'dark' ? 'Switch to dim theme' : 'Switch to dark theme'}
          onClick={() => {
            appActions.toggleTheme()
            toast.pushToast(theme === 'dark' ? 'Dim theme enabled' : 'Dark theme enabled', 'success')
          }}
        >
          {theme === 'dark' ? <SunMedium size={18} /> : <Moon size={18} />}
        </Button>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="top-nav__account"
            aria-expanded={accountOpen}
            aria-label="Account menu"
            onClick={() => appActions.toggleAccount()}
          >
            <span className="top-nav__avatar">
              <User size={14} />
            </span>
            <span className="small" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
              {CURRENT_PROFILE.username}
            </span>
          </button>
          <AnimatePresence>
            {accountOpen ? (
              <motion.div
                className="glass-strong"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18 }}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 48,
                  width: 220,
                  padding: 12,
                  zIndex: 40,
                }}
              >
                <p className="small muted">Signed in</p>
                <strong style={{ color: 'var(--text-strong)' }}>{CURRENT_PROFILE.username}</strong>
                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  <Button variant="ghost" size="sm" onClick={() => toast.pushToast('Account settings opened', 'info')}>
                    Manage account
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toast.pushToast('Signed out of Aqua Client', 'info')}>
                    Sign out
                  </Button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {mobileNavOpen ? (
          <motion.nav
            className="glass-strong"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            aria-label="Mobile"
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              top: 68,
              padding: 10,
              display: 'grid',
              gap: 4,
              zIndex: 30,
            }}
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => appActions.closeOverlays()}
                className={cn('top-nav__link', location.pathname === item.to && 'active')}
                style={{ width: '100%', justifyContent: 'space-between' }}
              >
                <span>{item.label}</span>
                <ArrowRight size={16} />
              </NavLink>
            ))}
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
