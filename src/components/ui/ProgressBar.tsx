import { cn, formatPercent } from '../../utils/cn'
import AnimatedProgress from '../motion/AnimatedProgress'

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
        <AnimatedProgress className={cn('progress-fill', accent === 'aqua' && 'aqua')} value={progress} />
      </div>
    </div>
  )
}
