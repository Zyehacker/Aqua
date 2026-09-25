import { motion, type HTMLMotionProps } from 'motion/react'
import { type ReactNode } from 'react'
import { aquaMotion } from '../../lib/motion'

export default function AnimatedIconButton({ children, ...props }: HTMLMotionProps<'button'> & { children: ReactNode }) {
  return <motion.button {...props} whileHover={{ y: -1, scale: 1.01 }} whileTap={{ scale: 0.975 }} transition={aquaMotion.button}>{children}</motion.button>
}
