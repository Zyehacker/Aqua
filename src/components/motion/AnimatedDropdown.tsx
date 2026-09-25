import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode } from 'react'
import { aquaMotion, popoverVariants } from '../../lib/motion'

export default function AnimatedDropdown({ open, children, className = '' }: { open: boolean; children: ReactNode; className?: string }) {
  return <AnimatePresence>{open ? <motion.div className={className} variants={popoverVariants} initial="initial" animate="enter" exit="exit" transition={aquaMotion.micro}>{children}</motion.div> : null}</AnimatePresence>
}
