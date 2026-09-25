import { motion } from 'motion/react'
import { type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { aquaMotion } from '../../lib/motion'
import { motionTokens } from './motionTokens'

type Props = Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'onAnimationStart' | 'onAnimationEnd' | 'onDrag' | 'onDragStart' | 'onDragEnd'> & { children: ReactNode; loading?: boolean }

export default function AnimatedButton({ children, loading = false, disabled, ...props }: Props) {
  return (
    <motion.button
      {...props}
      disabled={disabled || loading}
      whileHover={disabled || loading ? undefined : { y: -1, scale: motionTokens.scale.hover }}
      whileTap={disabled || loading ? undefined : { y: 0, scale: motionTokens.scale.press }}
      transition={aquaMotion.button}
      aria-busy={loading || undefined}
    >
      {children}
    </motion.button>
  )
}
