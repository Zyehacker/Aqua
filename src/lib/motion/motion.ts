import type { Variants } from 'motion/react'
import { motionTokens, motionTransition } from '../../components/motion/motionTokens'

export const aquaEase = motionTokens.ease.standard

export const aquaMotion = {
  micro: motionTransition.fast,
  small: motionTransition.fast,
  page: motionTransition.normal,
  content: motionTransition.moderate,
  button: motionTokens.spring.snappy,
  spring: motionTokens.spring.standard,
  drawer: motionTokens.spring.gentle,
  modal: motionTokens.spring.standard,
  toggle: motionTokens.spring.snappy,
  list: motionTransition.normal,
  progress: motionTransition.moderate,
  ambient: motionTransition.cinematic,
} as const

export const MOTION = aquaMotion

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -5 },
}

export const popoverVariants: Variants = {
  initial: { opacity: 0, y: -4, scale: 0.985, transformOrigin: 'top center' },
  enter: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -3, scale: 0.99 },
}

export const listItemVariants: Variants = {
  initial: { opacity: 0, y: 7 },
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -5 },
}

export const pageMotion: Variants = pageVariants
export const socialsMotion: Variants = { initial: { opacity: 0, y: 10 }, enter: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 } }
export const socialsWorkspaceMotion: Variants = { initial: { opacity: 0, y: 12, scale: 0.985 }, enter: { opacity: 1, y: 0, scale: 1 } }
export const contentShellMotion: Variants = { initial: { opacity: 0, y: 10 }, enter: { opacity: 1, y: 0 } }
export const contentItemMotion: Variants = listItemVariants
export const listMotion: Variants = listItemVariants
