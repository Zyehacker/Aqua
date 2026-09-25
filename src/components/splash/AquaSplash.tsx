import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { useAppStore } from '../../stores/appStore'
import SplashBackground from './SplashBackground'
import SplashLogo from './SplashLogo'
import SplashStatus from './SplashStatus'
import BlurText from '../react-bits/BlurText/BlurText'
import { SplitText } from '../motion'

const STATUS_STEPS = ['Initializing Aqua', 'Loading launcher', 'Checking instances', 'Preparing Minecraft']

export default function AquaSplash({ exiting = false }: { exiting?: boolean }) {
  const { loading, error } = useLauncherData()
  const reduceMotion = useAppStore((state) => state.reduceMotion)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (reduceMotion) return undefined
    const started = performance.now()
    const timer = window.setInterval(() => setElapsed(performance.now() - started), 80)
    return () => window.clearInterval(timer)
  }, [reduceMotion])

  const status = useMemo(() => {
    if (error) return 'Launcher needs attention'
    if (!loading) return 'Ready'
    return STATUS_STEPS[Math.min(Math.floor(elapsed / 360), STATUS_STEPS.length - 1)]
  }, [elapsed, error, loading])

  return (
    <motion.section className={`aqua-splash ${exiting ? 'is-exiting' : ''}`} aria-label="Aqua startup" role="status" initial={{ opacity: 1 }} animate={{ opacity: exiting ? 0 : 1 }} transition={{ duration: reduceMotion ? 0.12 : 0.42, ease: 'easeInOut' }}>
      <SplashBackground exiting={exiting} reducedMotion={reduceMotion} />
      <div className="aqua-splash__content">
        <SplashLogo exiting={exiting} reducedMotion={reduceMotion} />
        <motion.div className="aqua-splash__wordmark" initial={{ opacity: 0, y: 8 }} animate={{ opacity: exiting ? 0 : 1, y: exiting ? -8 : 0 }} transition={{ delay: reduceMotion ? 0 : 0.48, duration: reduceMotion ? 0.1 : 0.36 }}><strong><SplitText>Aqua</SplitText></strong><BlurText as="span">CLIENT</BlurText></motion.div>
        <motion.div className="aqua-splash__rule" initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: exiting ? 0 : 1, opacity: exiting ? 0 : 1 }} transition={{ delay: reduceMotion ? 0 : 0.68, duration: reduceMotion ? 0.1 : 0.35 }} />
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: exiting ? 0 : 1, y: exiting ? 5 : 0 }} transition={{ delay: reduceMotion ? 0 : 0.78, duration: reduceMotion ? 0.1 : 0.28 }}><SplashStatus status={status} ready={!loading && !error} reducedMotion={reduceMotion} /></motion.div>
        {error ? <button type="button" className="aqua-splash__retry" onClick={() => window.location.reload()}>Retry</button> : null}
      </div>
    </motion.section>
  )
}
