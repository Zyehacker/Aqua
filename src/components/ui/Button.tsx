import { motion, type HTMLMotionProps } from 'framer-motion'
import React, { type ReactNode, memo } from 'react'
import { cn } from '../../utils/cn'

type Variant = 'primary' | 'aqua' | 'ghost' | 'danger'

type ButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  variant?: Variant
  size?: 'lg' | 'md' | 'sm' | 'icon'
  block?: boolean
  children: ReactNode
}

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  aqua: 'btn-aqua',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ y: 0, scale: 0.985 }}
      transition={{ duration: 0.18 }}
      className={cn(
        'btn',
        variantClass[variant],
        size === 'sm' && 'btn-sm',
        size === 'icon' && 'btn-icon',
        size === 'lg' && 'btn-lg',
        block && 'btn-block',
        className,
      )}
      {...rest}
    >
      {/* ensure SVG icons inside buttons adopt consistent sizing */}
      {typeof children === 'string' ? children : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {children}
        </span>
      )}
    </motion.button>
  )
}

export default memo(Button)
