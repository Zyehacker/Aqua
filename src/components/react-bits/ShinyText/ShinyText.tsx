import { motion, useReducedMotion } from 'motion/react'
import { type ReactNode } from 'react'
import { useAppStore } from '../../../stores/appStore'

type ShinyTextProps = { children: ReactNode; className?: string }

export default function ShinyText({ children, className }: ShinyTextProps) {
  const reduceMotion = useReducedMotion()
  const reduceAquaMotion = useAppStore((state) => state.reduceMotion)
  const shouldReduce = Boolean(reduceMotion || reduceAquaMotion)
  return (
    <motion.span className={`aqua-shiny-text${className ? ` ${className}` : ''}`} animate={shouldReduce ? undefined : { backgroundPosition: ['120% 0', '-20% 0'] }} transition={shouldReduce ? undefined : { duration: 2.8, repeat: Infinity, ease: 'linear', repeatDelay: 1.8 }}>
      {children}
    </motion.span>
  )
}
