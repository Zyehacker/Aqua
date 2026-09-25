import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, LoaderCircle, Mail } from 'lucide-react'
import Button from '../ui/Button'
import { useAquaAuth } from '../../hooks/useAquaAuthHook'
import { getPendingConfirmationEmail, hasAquaAuthCallback, processAquaAuthCallback } from '../../services/aquaAuthService'
import { useMaintenance } from '../../hooks/useMaintenanceHook'

type CallbackState =
  | { kind: 'loading' }
  | { kind: 'success' }
  | { kind: 'expired'; email: string }
  | { kind: 'error'; message: string; email: string }

export default function AuthCallbackGate({ children }: { children: ReactNode }) {
  const aqua = useAquaAuth()
  const maintenance = useMaintenance()
  const [state, setState] = useState<CallbackState | null>(() => hasAquaAuthCallback() ? { kind: 'loading' } : null)
  const processedRef = useRef(false)
  const [resendState, setResendState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (maintenance.restricted) return undefined
    if (processedRef.current) return undefined
    const callback = processAquaAuthCallback()
    if (!callback) return undefined
    processedRef.current = true
    void callback.then(async (result) => {
      if (!result) return
      if (result.status === 'error') {
        setState({ kind: result.errorCode === 'otp_expired' ? 'expired' : 'error', email: getPendingConfirmationEmail(), message: 'This confirmation link could not be used.' })
        return
      }
      await aqua.refresh()
      setState({ kind: 'success' })
    }).catch((reason) => {
      setState({ kind: 'error', email: getPendingConfirmationEmail(), message: reason instanceof Error ? reason.message : 'This confirmation link could not be used.' })
    })
  }, [aqua, maintenance.restricted])

  useEffect(() => {
    if (!cooldown) return undefined
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  if (!state || maintenance.restricted) return children
  if (state.kind === 'loading') return <AuthCallbackState icon={<LoaderCircle className="spin" size={22} />} title="Confirming your email" detail="Verifying your Aqua Account with Supabase." />
  if (state.kind === 'success') return <AuthCallbackState icon={<CheckCircle2 size={22} />} title="Email confirmed" detail="Your Aqua Account is ready." action={<Button variant="aqua" onClick={() => window.location.replace('/')}>Continue to Aqua</Button>} />

  const resend = async () => {
    if (!state.email || cooldown) return
    setResendState('loading')
    try {
      await aqua.resendConfirmation(state.email)
      setResendState('success'); setCooldown(30)
    } catch {
      setResendState('error')
    }
  }

  return <AuthCallbackState
    icon={<CircleAlert size={22} />}
    title={state.kind === 'expired' ? 'Email link expired' : 'Email confirmation failed'}
    detail={state.kind === 'expired' ? 'This confirmation link is no longer valid. Request a new confirmation email.' : state.message}
    action={<div className="auth-callback__actions">
      <Button variant="aqua" disabled={!state.email || cooldown > 0 || resendState === 'loading'} onClick={() => void resend()}>
        {resendState === 'loading' ? <LoaderCircle className="spin" size={15} /> : <Mail size={15} />}
        {cooldown ? `Resend in ${cooldown}s` : resendState === 'success' ? 'Email sent' : 'Resend confirmation email'}
      </Button>
      {resendState === 'error' ? <span className="aqua-account-error" role="alert">Unable to send the confirmation email. Try again.</span> : null}
      <Button variant="ghost" onClick={() => window.location.replace('/')}>Back to login</Button>
    </div>}
  />
}

function AuthCallbackState({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return <main className="auth-callback" role="status">
    <div className="account-overlay__brand"><img src="/favicon.png" alt="Aqua" /><div><strong>Aqua Account</strong><span>Email confirmation</span></div></div>
    <section className="aqua-account-window__state"><span className="auth-callback__icon">{icon}</span><strong>{title}</strong><span>{detail}</span>{action}</section>
  </main>
}