import { motion } from 'motion/react'
import { type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { aquaMotion } from '../../lib/motion'

export default function AnimatedCard({ children, ...props }: Omit<ComponentPropsWithoutRef<'section'>, 'onAnimationStart' | 'onAnimationEnd' | 'onDrag' | 'onDragStart' | 'onDragEnd'> & { children: ReactNode }) {
  return <motion.section {...props} whileHover={{ y: -1 }} transition={aquaMotion.small}>{children}</motion.section>
}
