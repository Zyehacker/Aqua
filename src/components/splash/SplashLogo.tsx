import { motion } from 'motion/react'

export default function SplashLogo({ exiting, reducedMotion }: { exiting: boolean; reducedMotion: boolean }) {
  return (
    <motion.img
      layoutId="aqua-mark"
      src="/favicon.png"
      alt="Aqua"
      className="aqua-splash__logo"
      initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.78, filter: reducedMotion ? 'blur(0px)' : 'blur(9px)' }}
      animate={{ opacity: exiting ? 0 : 1, scale: exiting ? 0.82 : 1, filter: 'blur(0px)' }}
      transition={{ opacity: { duration: reducedMotion ? 0.12 : 0.32 }, filter: { duration: reducedMotion ? 0.12 : 0.55 }, scale: reducedMotion ? { duration: 0.12 } : { type: 'spring', stiffness: 170, damping: 16, mass: 0.7 } }}
    />
  )
}
