import { MotionConfig } from 'motion/react'
import { type ReactNode } from 'react'
import { useAppStore } from '../../stores/appStore'

export default function AquaMotion({ children }: { children: ReactNode }) {
  const reduced = useAppStore((state) => state.reduceMotion)
  return <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>{children}</MotionConfig>
}
