import { motion } from 'motion/react'
import { type CSSProperties } from 'react'

export default function AnimatedSkeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <motion.div className={`skeleton ${className}`} style={style} initial={{ opacity: 0.55 }} animate={{ opacity: [0.55, 0.9, 0.55] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} aria-hidden="true" />
}
