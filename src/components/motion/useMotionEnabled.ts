import { useReducedMotion } from 'motion/react'
import { useAppStore } from '../../stores/appStore'

export function useMotionEnabled() {
  const systemReduced = useReducedMotion()
  const appReduced = useAppStore((state) => state.reduceMotion)
  return !systemReduced && !appReduced
}
