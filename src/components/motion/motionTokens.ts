import type { Transition } from 'motion/react'

export const motionTokens = {
  duration: {
    instant: 0.08,
    fast: 0.14,
    normal: 0.20,
    moderate: 0.28,
    slow: 0.40,
    cinematic: 0.65,
  },
  ease: {
    standard: [0.2, 0.8, 0.2, 1] as const,
    enter: [0.16, 1, 0.3, 1] as const,
    exit: [0.7, 0, 0.84, 0] as const,
    emphasized: [0.16, 1, 0.3, 1] as const,
  },
  spring: {
    snappy: { type: 'spring', stiffness: 500, damping: 35, mass: 0.7 } satisfies Transition,
    standard: { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 } satisfies Transition,
    gentle: { type: 'spring', stiffness: 260, damping: 28, mass: 0.9 } satisfies Transition,
  },
  distance: { xs: 2, sm: 4, md: 8, lg: 16, xl: 24 },
  scale: { press: 0.97, hover: 1.015, enter: 0.985 },
  stagger: { fast: 0.025, normal: 0.045, slow: 0.075 },
} as const

export const motionTransition = {
  instant: { duration: motionTokens.duration.instant, ease: motionTokens.ease.standard } satisfies Transition,
  fast: { duration: motionTokens.duration.fast, ease: motionTokens.ease.standard } satisfies Transition,
  normal: { duration: motionTokens.duration.normal, ease: motionTokens.ease.standard } satisfies Transition,
  moderate: { duration: motionTokens.duration.moderate, ease: motionTokens.ease.enter } satisfies Transition,
  cinematic: { duration: motionTokens.duration.cinematic, ease: motionTokens.ease.emphasized } satisfies Transition,
} as const
