import { motion } from 'motion/react'
import { aquaMotion } from '../../lib/motion'

export default function AnimatedProgress({ value, className = '' }: { value: number; className?: string }) {
  const progress = Math.max(0, Math.min(100, value))
  return <motion.div className={className} style={{ width: '100%', transformOrigin: 'left center' }} initial={{ scaleX: 0 }} animate={{ scaleX: progress / 100 }} transition={aquaMotion.progress} />
}
