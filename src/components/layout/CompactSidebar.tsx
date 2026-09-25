import { NavLink } from 'react-router-dom'
import { Home, Layers, Settings, Users, Download, Gamepad2, type LucideIcon } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useTranslation } from '../../useTranslation'
import { motion } from 'motion/react'
import { MOTION } from '../../lib/motion'

const ITEMS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/instances', label: 'Instances', icon: Gamepad2 },
  { to: '/content', label: 'Content', icon: Layers },
  { to: '/downloads', label: 'Downloads', icon: Download },
  { to: '/accounts', label: 'Accounts', icon: Users },
  { to: '/socials', label: 'Socials', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function CompactSidebar() {
  const { t } = useTranslation()
  return <aside className="compact-sidebar" aria-label="Compact navigation">
    <div className="compact-sidebar__mark"><img src="/favicon.png" alt="Aqua" /></div>
    <nav>{ITEMS.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('compact-sidebar__link', isActive && 'active')} title={t(`nav.${label.toLowerCase()}`)}>{({ isActive }) => <><Icon size={16} /><span>{t(`nav.${label.toLowerCase()}`)}</span>{isActive ? <motion.span className="sidebar-active-indicator" layoutId="sidebar-nav-indicator" transition={MOTION.spring} /> : null}</>}</NavLink>)}</nav>
  </aside>
}
