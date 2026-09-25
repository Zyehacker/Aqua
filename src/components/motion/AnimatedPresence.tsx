import { AnimatePresence as MotionPresence } from 'motion/react'
import { type ReactNode } from 'react'

export default function AnimatedPresence({ children, mode = 'sync' }: { children: ReactNode; mode?: 'sync' | 'wait' | 'popLayout' }) {
  return <MotionPresence initial={false} mode={mode}>{children}</MotionPresence>
}
