import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react'
import { aquaMotion } from '../../lib/motion'

export default function AnimatedStatus({ state, label }: { state: 'loading' | 'success' | 'error' | 'idle'; label: string }) {
  const Icon = state === 'success' ? CheckCircle2 : state === 'error' ? CircleAlert : LoaderCircle
  return <AnimatePresence mode="wait" initial={false}><motion.span key={state} className={`animated-status animated-status--${state}`} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={aquaMotion.micro}>{state !== 'idle' ? <Icon size={13} className={state === 'loading' ? 'spin' : undefined} /> : null}{label}</motion.span></AnimatePresence>
}
