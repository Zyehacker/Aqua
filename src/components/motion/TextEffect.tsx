import { motion } from 'motion/react'
import { type ReactNode } from 'react'
import { useMotionEnabled } from './useMotionEnabled'

type Props = { children: ReactNode; className?: string }

export default function TextEffect({ children, className }: Props) {
  const enabled = useMotionEnabled()
  return <motion.span className={className} initial={{ opacity: 0, y: enabled ? 4 : 0 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: enabled ? .22 : .01 }}>{children}</motion.span>
}
