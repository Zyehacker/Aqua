import { cn, formatPercent } from '../../utils/cn'
import { motion } from 'framer-motion'

type ProgressBarProps = {
  value: number
  accent?: 'primary' | 'aqua'
  className?: string
  label?: string
  showValue?: boolean
}

export default function ProgressBar({
  value,
  accent = 'primary',
  className,
  label,
  showValue = false,
}: ProgressBarProps) {
  const progress = Math.max(0, Math.min(100, value))

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="progress-label">
          <span>{label}</span>
          {showValue && <strong>{formatPercent(progress)}</strong>}
        </div>
      )}
      <div
        className="progress-shell"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <motion.div
          className={cn('progress-fill', accent === 'aqua' && 'aqua')}
          style={{ width: `${progress}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}
