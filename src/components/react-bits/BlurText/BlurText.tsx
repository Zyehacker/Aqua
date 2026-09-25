import { motion, useReducedMotion } from 'motion/react'
import { type ReactNode } from 'react'
import { aquaMotion } from '../../../lib/motion'
import { useAppStore } from '../../../stores/appStore'

type BlurTextProps = {
  children: ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span'
}

export default function BlurText({ children, className, as = 'h1' }: BlurTextProps) {
  const reduceMotion = useReducedMotion()
  const reduceAquaMotion = useAppStore((state) => state.reduceMotion)
  const shouldReduce = Boolean(reduceMotion || reduceAquaMotion)
  const text = typeof children === 'string' ? children : ''
  const Component = motion[as]

  if (!text) return <Component className={className}>{children}</Component>

  return (
    <Component className={className} aria-label={text} initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: shouldReduce ? 0 : 0.018 } } }}>
      {Array.from(text).map((character, index) => (
        <motion.span key={`${character}-${index}`} aria-hidden="true" variants={{ hidden: { opacity: 0, y: shouldReduce ? 0 : 4, filter: shouldReduce ? 'blur(0px)' : 'blur(3px)' }, visible: { opacity: 1, y: 0, filter: 'blur(0px)' } }} transition={shouldReduce ? { duration: 0.01 } : aquaMotion.small}>
          {character === ' ' ? '\u00a0' : character}
        </motion.span>
      ))}
    </Component>
  )
}
