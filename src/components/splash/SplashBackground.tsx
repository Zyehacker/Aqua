import { motion } from 'motion/react'

export default function SplashBackground({ exiting, reducedMotion }: { exiting: boolean; reducedMotion: boolean }) {
  return (
    <div className="aqua-splash__environment" aria-hidden="true">
      <motion.img
        src="/herobackground.png"
        alt=""
        className="aqua-splash__environment-image"
        initial={{ opacity: 0, scale: reducedMotion ? 1 : 1.045, filter: reducedMotion ? 'blur(0px)' : 'blur(7px)', x: reducedMotion ? 0 : -5 }}
        animate={{ opacity: exiting ? 0 : 0.72, scale: 1, filter: 'blur(0px)', x: 0 }}
        transition={{ duration: reducedMotion ? 0.12 : exiting ? 0.42 : 1.05, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div className="aqua-splash__environment-shade" animate={{ opacity: exiting ? 0 : 1 }} transition={{ duration: reducedMotion ? 0.12 : 0.5 }} />
      <div className="aqua-splash__vignette" />
    </div>
  )
}
