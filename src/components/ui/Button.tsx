import { type ComponentPropsWithoutRef, type ReactNode, memo } from 'react'
import { cn } from '../../utils/cn'
import { playUiSound, type UiSoundTone } from '../../utils/uiSound'
import AnimatedButton from '../motion/AnimatedButton'

type Variant = 'primary' | 'aqua' | 'ghost' | 'danger'

type ButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'onAnimationStart' | 'onAnimationEnd' | 'onDrag' | 'onDragStart' | 'onDragEnd'> & {
  variant?: Variant
  size?: 'lg' | 'md' | 'sm' | 'icon'
  block?: boolean
  children: ReactNode
  sound?: UiSoundTone
  loading?: boolean
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
  loading = false,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <AnimatedButton
      {...rest}
      loading={loading}
      className={cn(
        'btn motion-layer',
        variantClass[variant],
        size === 'sm' && 'btn-sm',
        size === 'icon' && 'btn-icon',
        size === 'lg' && 'btn-lg',
        block && 'btn-block',
        className,
      )}
      onClick={(event) => { if (sound) playUiSound(sound); onClick?.(event) }}
    >
      {typeof children === 'string' ? children : (
        <span className="btn__content">
          {children}
        </span>
      )}
    </AnimatedButton>
  )
}

export default memo(Button)
