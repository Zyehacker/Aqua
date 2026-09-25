import { type ComponentPropsWithoutRef, type ReactNode, memo } from 'react'
import { cn } from '../../utils/cn'
import AnimatedCard from '../motion/AnimatedCard'

type CardProps = Omit<ComponentPropsWithoutRef<'section'>, 'onAnimationStart' | 'onAnimationEnd' | 'onDrag' | 'onDragStart' | 'onDragEnd'> & {
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
    <AnimatedCard
      className={cn(
        strong ? 'glass-strong' : soft ? 'glass-soft' : 'glass',
        padded && 'section-card',
        className,
      )}
      {...rest}
    >
      {children}
    </AnimatedCard>
  )
}

export default memo(Card)
