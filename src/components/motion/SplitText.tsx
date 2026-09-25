import { motion } from 'motion/react'
import { type ReactNode } from 'react'
import { aquaMotion } from '../../lib/motion'
import { useMotionEnabled } from './useMotionEnabled'

export default function SplitText({ children, className = '' }: { children: ReactNode; className?: string }) {
  const enabled = useMotionEnabled()
  const text = typeof children === 'string' ? children : ''
  if (!text) return <span className={className}>{children}</span>
  return <motion.span className={className} aria-label={text} initial={enabled ? 'hidden' : false} animate="visible" variants={{ visible: { transition: { staggerChildren: enabled ? 0.035 : 0 } } }}>
    {Array.from(text).map((character, index) => <motion.span key={`${character}-${index}`} aria-hidden="true" variants={{ hidden: { opacity: 0, y: enabled ? 8 : 0 }, visible: { opacity: 1, y: 0 } }} transition={enabled ? aquaMotion.small : { duration: 0.01 }}>{character === ' ' ? '\u00a0' : character}</motion.span>)}
  </motion.span>
}
