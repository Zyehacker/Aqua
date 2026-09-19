import { LoaderCircle } from 'lucide-react'
import ProgressBar from './ProgressBar'

type LoadingIndicatorProps = {
  label: string
  progress?: number | null
  detail?: string
}

export default function LoadingIndicator({ label, progress = null, detail }: LoadingIndicatorProps) {
  return (
    <div className="loading-indicator" role="status" aria-live="polite" aria-busy="true">
      <LoaderCircle size={18} className="spin" aria-hidden="true" />
      <div className="loading-indicator__copy">
        <strong>{label}</strong>
        {detail ? <span>{detail}</span> : null}
        {progress !== null ? <ProgressBar value={progress} showValue /> : <div className="loading-indicator__pulse" aria-hidden="true" />}
      </div>
    </div>
  )
}
