import { motion, useMotionValue, useSpring } from 'motion/react'
import { type ReactNode, type PointerEvent } from 'react'
import { cn } from '../../utils/cn'
import { useMotionEnabled } from './useMotionEnabled'

type Props = { children: ReactNode; className?: string; strength?: number }

export default function MagneticButton({ children, className, strength = 4 }: Props) {
  const enabled = useMotionEnabled()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 420, damping: 28, mass: 0.25 })
  const springY = useSpring(y, { stiffness: 420, damping: 28, mass: 0.25 })
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled) return
    const bounds = event.currentTarget.getBoundingClientRect()
    x.set(((event.clientX - bounds.left) / bounds.width - 0.5) * strength)
    y.set(((event.clientY - bounds.top) / bounds.height - 0.5) * strength)
  }
  return <motion.div className={cn('motion-magnetic', !enabled && 'motion-static', className)} style={enabled ? { x: springX, y: springY } : undefined} onPointerMove={move} onPointerLeave={() => { x.set(0); y.set(0) }}>{children}</motion.div>
}
