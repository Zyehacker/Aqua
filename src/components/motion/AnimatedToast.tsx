import { motion } from 'motion/react'
import { type ReactNode } from 'react'
import { aquaMotion } from '../../lib/motion'

export default function AnimatedToast({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 7, scale: 0.985 }} transition={aquaMotion.small}>{children}</motion.div>
}
