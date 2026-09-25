import { AnimatePresence, motion } from 'motion/react'
import { type ElementType } from 'react'
import { useMotionEnabled } from './useMotionEnabled'

type Props = { children: string; as?: ElementType; className?: string }

export default function TextMorph({ children, as: Component = 'span', className }: Props) {
  const enabled = useMotionEnabled()
  return <Component className={className} aria-live="polite"><AnimatePresence mode="wait" initial={false}><motion.span key={children} className="motion-text-morph__value" initial={{ opacity: 0, y: enabled ? 4 : 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: enabled ? -4 : 0 }} transition={{ duration: enabled ? .16 : .01 }}>{children}</motion.span></AnimatePresence></Component>
}
