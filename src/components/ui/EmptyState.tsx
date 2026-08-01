import type { ReactNode } from 'react'
import { Inbox, AlertTriangle } from 'lucide-react'
import Button from './Button'

type EmptyStateProps = {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  icon?: ReactNode
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <div className="icon-wrap accent">{icon ?? <Inbox size={20} />}</div>
      <strong>{title}</strong>
      <p className="small muted">{description}</p>
      {actionLabel && onAction ? (
        <Button variant="ghost" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

type ErrorStateProps = {
  title?: string
  description?: string
  onRetry?: () => void
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'Aqua Client could not load this view. Try again in a moment.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <div className="icon-wrap" style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>
        <AlertTriangle size={20} />
      </div>
      <strong>{title}</strong>
      <p className="small muted">{description}</p>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}
