import { AnimatePresence, motion } from 'motion/react'
import { useState, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../../utils/cn'
import { useMotionEnabled } from './useMotionEnabled'

type Spark = { id: number; x: number; y: number; angle: number }
type Props = { children: ReactNode; className?: string }

export default function ClickSpark({ children, className }: Props) {
  const enabled = useMotionEnabled()
  const [sparks, setSparks] = useState<Spark[]>([])
  const click = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const id = Date.now()
    const next = Array.from({ length: 6 }, (_, index) => ({ id: id + index, x: event.clientX - bounds.left, y: event.clientY - bounds.top, angle: index * 60 }))
    setSparks((current) => [...current, ...next].slice(-12))
  }
  return <div className={cn('motion-click-spark', !enabled && 'motion-static', className)} onPointerDown={click}>{children}<AnimatePresence>{sparks.map((spark) => <motion.i key={spark.id} style={{ left: spark.x, top: spark.y, rotate: spark.angle }} initial={{ opacity: .8, scale: .3, y: 0 }} animate={{ opacity: 0, scale: 1, y: -12 }} exit={{ opacity: 0 }} transition={{ duration: .32 }} onAnimationComplete={() => setSparks((current) => current.filter((item) => item.id !== spark.id))} />)}</AnimatePresence></div>
}
