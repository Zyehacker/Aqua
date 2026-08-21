import { motion, type HTMLMotionProps } from 'framer-motion'
import { type MouseEvent, type ReactNode, memo } from 'react'
import { cn } from '../../utils/cn'
import { playUiSound } from '../../utils/uiSound'
import { useAppStore } from '../../stores/appStore'

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
  onClick,
  ...rest
}: ButtonProps) {
  const uiSounds = useAppStore((s) => s.uiSounds)
  const soundVolume = useAppStore((s) => s.soundVolume)

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event)
    if (uiSounds && !event.defaultPrevented) {
      playUiSound(variant === 'ghost' ? 'nav' : 'primary', soundVolume)
    }
  }

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
      onClick={handleClick}
      {...rest}
    >
      {typeof children === 'string' ? children : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {children}
        </span>
      )}
    </motion.button>
  )
}

export default memo(Button)
