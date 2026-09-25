import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../../utils/cn'
import { useMotionEnabled } from './useMotionEnabled'

type Props = { children: ReactNode; className?: string; color?: string; size?: number }

export default function Spotlight({ children, className, color = 'var(--primary)', size = 260 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const enabled = useMotionEnabled()
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || !ref.current) return
    const bounds = ref.current.getBoundingClientRect()
    ref.current.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`)
    ref.current.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`)
  }
  const style = { '--spotlight-color': color, '--spotlight-size': `${size}px` } as CSSProperties
  return <div ref={ref} className={cn('motion-spotlight', !enabled && 'motion-static', className)} style={style} onPointerMove={move}>{children}</div>
}
