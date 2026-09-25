import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { type ReactNode } from 'react'
import { aquaMotion } from '../../../lib/motion'
import { useAppStore } from '../../../stores/appStore'

type AnimatedContentProps = {
  contentKey: string
  children: ReactNode
  className?: string
}

export default function AnimatedContent({ contentKey, children, className }: AnimatedContentProps) {
  const reduceMotion = useReducedMotion()
  const reduceAquaMotion = useAppStore((state) => state.reduceMotion)
  const shouldReduce = Boolean(reduceMotion || reduceAquaMotion)
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={contentKey} className={className} initial={{ opacity: 0, y: shouldReduce ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: shouldReduce ? 0 : -4 }} transition={shouldReduce ? { duration: 0.01 } : aquaMotion.content}>
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
