import { motion, type HTMLMotionProps } from 'framer-motion'
import { type ReactNode, memo } from 'react'
import { cn } from '../../utils/cn'

type CardProps = HTMLMotionProps<'section'> & {
  children: ReactNode
  strong?: boolean
  soft?: boolean
  padded?: boolean
}

function Card({
  children,
  strong = false,
  soft = false,
  padded = true,
  className,
  ...rest
}: CardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        strong ? 'glass-strong' : soft ? 'glass-soft' : 'glass',
        padded && 'section-card',
        className,
      )}
      {...rest}
    >
      {children}
    </motion.section>
  )
}

export default memo(Card)
