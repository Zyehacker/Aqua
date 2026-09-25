import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, LoaderCircle } from 'lucide-react'
import Button from './Button'

export type AsyncViewState = 'loading' | 'empty' | 'error' | 'ready' | 'saving' | 'success'

type Props = {
  state: AsyncViewState
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  children?: ReactNode
}

export default function AsyncState({ state, title, description, actionLabel = 'Retry', onAction, children }: Props) {
  if (state === 'ready' || state === 'success') return <>{children}</>
  const copy = state === 'loading' ? ['Loading', description ?? 'Preparing this view.'] : state === 'saving' ? ['Saving changes', description ?? 'Your changes are being saved.'] : state === 'empty' ? [title ?? 'Nothing here yet', description ?? 'There is nothing to show here yet.'] : [title ?? 'Unable to load this view', description ?? 'Check your connection and try again.']
  return <div className={`async-state async-state--${state}`} role={state === 'error' ? 'alert' : 'status'} aria-live="polite">
    <span className="async-state__icon">{state === 'loading' || state === 'saving' ? <LoaderCircle className="spin" size={20} /> : state === 'error' ? <AlertTriangle size={20} /> : <Inbox size={20} />}</span>
    <strong>{copy[0]}</strong><span>{copy[1]}</span>
    {onAction && state === 'error' ? <Button variant="ghost" size="sm" onClick={onAction}>{actionLabel}</Button> : null}
  </div>
}
