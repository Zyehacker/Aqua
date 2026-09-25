import { useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { cn } from '../../utils/cn'

export type FloatingDockItem = {
  to: string
  label: string
  icon?: React.ReactNode
}

export default function FloatingDock({ items, className }: { items: FloatingDockItem[]; className?: string }) {
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY)

  return (
    <nav
      aria-label="Primary"
      className={cn('aqua-floating-dock', className)}
      onMouseMove={(event) => mouseX.set(event.clientX)}
      onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
    >
      {items.map((item) => <DockItem key={item.to} item={item} mouseX={mouseX} />)}
    </nav>
  )
}

function DockItem({ item, mouseX }: { item: FloatingDockItem; mouseX: MotionValue<number> }) {
  const ref = useRef<HTMLAnchorElement>(null)
  const distance = useTransform(mouseX, (value) => {
    const bounds = ref.current?.getBoundingClientRect()
    return value - (bounds?.left ?? 0) - (bounds?.width ?? 0) / 2
  })
  const width = useSpring(useTransform(distance, [-140, 0, 140], [34, 44, 34]), { stiffness: 260, damping: 22 })

  return (
    <NavLink ref={ref} to={item.to} end={item.to === '/'} className={({ isActive }) => cn('aqua-floating-dock__item', isActive && 'active')}>
      {({ isActive }) => <>
        {isActive ? <motion.span className="aqua-floating-dock__active-background" layoutId="aqua-nav-background" transition={{ type: 'spring', stiffness: 420, damping: 34 }} aria-hidden="true" /> : null}
        <motion.span className="aqua-floating-dock__icon" style={{ width, height: width }} aria-hidden="true">{item.icon}</motion.span>
        <span className="aqua-floating-dock__label">{item.label}</span>
        {isActive ? <span className="aqua-floating-dock__indicator" /> : null}
      </>}
    </NavLink>
  )
}
