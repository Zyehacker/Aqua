import { type ReactNode } from 'react'
import { cn } from '../../utils/cn'

type Props = { children: ReactNode; className?: string; active?: boolean }

export default function AnimatedBorder({ children, className, active = false }: Props) {
  return <div className={cn('motion-animated-border', active && 'is-active', className)}>{children}</div>
}
