import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X, ArrowRight, ShieldCheck, type LucideIcon } from 'lucide-react'
import { appActions, useAppStore } from '../../stores/appStore'
import { cn } from '../../utils/cn'
import Button from '../ui/Button'
import { useTranslation } from '../../useTranslation'
import AccountSwitcher from '../account/AccountSwitcher'
import { useAdminAccess } from '../../hooks/useAdminAccess'

type NavItem = { to: string; label: string; icon?: LucideIcon }

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home' },
  { to: '/instances', label: 'Instances' },
  { to: '/content', label: 'Content' },
  { to: '/downloads', label: 'Downloads' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/socials', label: 'Socials' },
  { to: '/settings', label: 'Settings' },
]

export default function TopNav() {
  const { t } = useTranslation()
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen)
  const location = useLocation()
  const { allowed: isAdmin } = useAdminAccess()
  const navItems = isAdmin ? [...NAV_ITEMS, { to: '/admin', label: 'Admin', icon: ShieldCheck }] : NAV_ITEMS

  return (
    <header className="top-nav">
      {/* Brand */}
      <div className="top-nav__brand">
        <img src="/favicon.png" alt="Aqua" className="top-nav__logo-img" />
        <span className="top-nav__title">Aqua</span>
      </div>

      {/* Primary navigation */}
      <nav className="top-nav__links" aria-label="Primary">
        {navItems.map((item) => {
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => cn('top-nav__link', isActive && 'active')}
            >
              {item.icon ? <item.icon size={14} aria-hidden="true" /> : null}
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

        {/* Account switcher dropdown */}
        <AccountSwitcher />
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
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => appActions.closeOverlays()}
                className={cn('mobile-nav__link', location.pathname === item.to && 'active')}
              >
                <span className="mobile-nav__label">
                  {item.icon ? <item.icon size={14} aria-hidden="true" /> : null}
                  <span>{t(`nav.${item.label.toLowerCase()}`)}</span>
                </span>
                <ArrowRight size={14} />
              </NavLink>
            ))}
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  )
}