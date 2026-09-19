import { motion, type HTMLMotionProps } from 'framer-motion'
import { type ReactNode, memo } from 'react'
import { cn } from '../../utils/cn'
import { playUiSound, type UiSoundTone } from '../../utils/uiSound'

type Variant = 'primary' | 'aqua' | 'ghost' | 'danger'

type ButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  variant?: Variant
  size?: 'lg' | 'md' | 'sm' | 'icon'
  block?: boolean
  children: ReactNode
  sound?: UiSoundTone
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
  sound,
  onClick,
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
      onClick={(event) => { if (sound) playUiSound(sound); onClick?.(event) }}
      {...rest}
    >
      {typeof children === 'string' ? children : (
        <span className="btn__content">
          {children}
        </span>
      )}
    </motion.button>
  )
}

export default memo(Button)
