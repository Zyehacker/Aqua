import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode } from 'react'
import { aquaMotion } from '../../lib/motion'
import { useMotionEnabled } from './useMotionEnabled'

type Props = { contentKey: string; children: ReactNode; className?: string }

export default function AnimatedContent({ contentKey, children, className }: Props) {
  const enabled = useMotionEnabled()
  return <AnimatePresence mode="wait" initial={false}><motion.div key={contentKey} className={className} initial={{ opacity: 0, y: enabled ? 5 : 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: enabled ? -4 : 0 }} transition={enabled ? aquaMotion.content : { duration: .01 }}>{children}</motion.div></AnimatePresence>
}
