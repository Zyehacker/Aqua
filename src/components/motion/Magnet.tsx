import { motion, useMotionValue, useSpring } from 'motion/react'
import { type ReactNode, type PointerEvent } from 'react'
import { cn } from '../../utils/cn'
import { useMotionEnabled } from './useMotionEnabled'

type Props = { children: ReactNode; className?: string; strength?: number }

export default function Magnet({ children, className, strength = 3 }: Props) {
  const enabled = useMotionEnabled()
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const x = useSpring(rawX, { stiffness: 500, damping: 30 })
  const y = useSpring(rawY, { stiffness: 500, damping: 30 })
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled) return
    const bounds = event.currentTarget.getBoundingClientRect()
    rawX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * strength)
    rawY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * strength)
  }
  return <motion.div className={cn('motion-magnet', !enabled && 'motion-static', className)} style={enabled ? { x, y } : undefined} onPointerMove={move} onPointerLeave={() => { rawX.set(0); rawY.set(0) }}>{children}</motion.div>
}
