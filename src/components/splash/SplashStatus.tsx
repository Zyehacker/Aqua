import { AnimatePresence, motion } from 'motion/react'

export default function SplashStatus({ status, ready, reducedMotion }: { status: string; ready: boolean; reducedMotion: boolean }) {
  return (
    <div className="aqua-splash__status-wrap" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: reducedMotion ? 0.08 : 0.2 }}>{status}</motion.span>
      </AnimatePresence>
      <div className={`aqua-splash__progress ${ready ? 'is-ready' : 'is-loading'}`}><motion.span initial={{ scaleX: 0 }} animate={{ scaleX: ready ? 1 : 0.38 }} transition={{ duration: reducedMotion ? 0.1 : 0.75, ease: 'easeOut' }} /></div>
    </div>
  )
}
