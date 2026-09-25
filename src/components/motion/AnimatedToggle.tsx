import { motion } from 'motion/react'
import { aquaMotion } from '../../lib/motion'

export default function AnimatedToggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <motion.button type="button" role="switch" aria-checked={checked} aria-label={label} aria-disabled={disabled} disabled={disabled} className={`toggle motion-layer${checked ? ' on' : ''}`} onClick={() => onChange(!checked)} whileTap={disabled ? undefined : { scale: 0.96 }} transition={aquaMotion.micro}><motion.span className="toggle__knob" animate={{ x: checked ? 16 : 0 }} transition={aquaMotion.toggle} /></motion.button>
}
