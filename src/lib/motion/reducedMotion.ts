import { useReducedMotion } from 'motion/react'

export function useAquaReducedMotion() {
  return useReducedMotion()
}

export const reducedMotionTransition = { duration: 0.01 }
