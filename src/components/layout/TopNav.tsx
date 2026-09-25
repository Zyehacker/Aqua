import { ShieldCheck, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useTranslation } from '../../useTranslation'
import AccountSwitcher from '../account/AccountSwitcher'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import FloatingDock from '../aceternity/FloatingDock'

type NavItem = { to: string; label: string; icon?: LucideIcon }

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home' },
  { to: '/instances', label: 'Instances' },
  { to: '/content', label: 'Content' },
  { to: '/socials', label: 'Socials' },
  { to: '/downloads', label: 'Downloads' },
  { to: '/settings', label: 'Settings' },
  { to: '/profiles', label: 'Profile' },
]

export default function TopNav() {
  const { t } = useTranslation()
  const { allowed: isAdmin } = useAdminAccess()
  const navItems = isAdmin ? [...NAV_ITEMS, { to: '/admin', label: 'Admin', icon: ShieldCheck }] : NAV_ITEMS

  return (
    <header className="top-nav">
      {/* Brand */}
      <div className="top-nav__brand">
        <motion.img layoutId="aqua-mark" src="/favicon.png" alt="Aqua" className="top-nav__logo-img" />
        <span className="top-nav__title">Aqua</span>
      </div>

      {/* Primary navigation */}
      <FloatingDock
        className="top-nav__links"
        items={navItems.map((item) => ({
          ...item,
          label: t(`nav.${item.label.toLowerCase()}`),
          icon: item.icon ? <item.icon size={14} aria-hidden="true" /> : undefined,
        }))}
      />

      {/* Actions */}
      <div className="top-nav__actions">
        {/* Account switcher dropdown */}
        <AccountSwitcher />
      </div>
    </header>
  )
}
