import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../../utils/cn'
import { useMotionEnabled } from './useMotionEnabled'

type Props = { children: ReactNode; className?: string; active?: boolean; disabled?: boolean; blur?: number; spread?: number }

export default function GlowingEffect({ children, className, active = false, disabled = false, blur = 14, spread = 1 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const enabled = useMotionEnabled() && !disabled
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || !ref.current) return
    const bounds = ref.current.getBoundingClientRect()
    ref.current.style.setProperty('--glow-x', `${event.clientX - bounds.left}px`)
    ref.current.style.setProperty('--glow-y', `${event.clientY - bounds.top}px`)
    ref.current.style.setProperty('--glow-opacity', '1')
  }
  const style = { '--glow-blur': `${blur}px`, '--glow-spread': `${spread}px` } as CSSProperties
  return <div ref={ref} className={cn('motion-glow', active && 'is-active', !enabled && 'motion-static', className)} style={style} onPointerMove={move} onPointerLeave={() => ref.current?.style.setProperty('--glow-opacity', active ? '0.75' : '0')}>
    <span className="motion-glow__border" aria-hidden="true" />
    <div className="motion-glow__content">{children}</div>
  </div>
}
