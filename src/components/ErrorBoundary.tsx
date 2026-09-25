import { Component, type ErrorInfo, type ReactNode } from 'react'
import Button from './ui/Button'

type Props = { children: ReactNode; resetKey?: string }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State { return { error } }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Aqua UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="page"><section className="empty-shell" role="alert">
      <strong>This page could not be displayed.</strong>
      <span>{this.state.error.message || 'An unexpected UI error occurred.'}</span>
      <Button variant="aqua" onClick={() => this.setState({ error: null })}>Retry</Button>
    </section></main>
  }
}
