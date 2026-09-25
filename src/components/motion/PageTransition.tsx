import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode } from 'react'
import { aquaMotion, pageVariants } from '../../lib/motion'

export default function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  return (
    <AnimatePresence initial={false} mode="sync">
      <motion.div
        key={routeKey}
        className="motion-layer"
        variants={pageVariants}
        initial="initial"
        animate="enter"
        exit="exit"
        transition={aquaMotion.page}
        style={{ minHeight: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
