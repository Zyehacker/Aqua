import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../../utils/cn'
import { useMotionEnabled } from './useMotionEnabled'

type Props = { children: ReactNode; className?: string }

export default function GlareHover({ children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const enabled = useMotionEnabled()
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || !ref.current) return
    const bounds = ref.current.getBoundingClientRect()
    ref.current.style.setProperty('--glare-x', `${event.clientX - bounds.left}px`)
    ref.current.style.setProperty('--glare-y', `${event.clientY - bounds.top}px`)
    ref.current.style.setProperty('--glare-opacity', '1')
  }
  const style = { '--glare-opacity': '0' } as CSSProperties
  return <div ref={ref} className={cn('motion-glare', !enabled && 'motion-static', className)} style={style} onPointerMove={move} onPointerLeave={() => ref.current?.style.setProperty('--glare-opacity', '0')}>{children}<span aria-hidden="true" /></div>
}
