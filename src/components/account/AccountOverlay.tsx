import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Eye, EyeOff, ImagePlus, LoaderCircle, LogOut, ShieldCheck, X } from 'lucide-react'
import Button from '../ui/Button'
import Avatar from '../ui/Avatar'
import { useToast } from '../../hooks/useToast'
import { useAquaAuth } from '../../hooks/useAquaAuthHook'
import { MOTION } from '../../lib/motion'
import { checkUsernameAvailable, uploadAquaAvatar, validateAquaUsername } from '../../services/aquaSocialService'
import { appActions, useAppStore } from '../../stores/appStore'
import { useMaintenance } from '../../hooks/useMaintenanceHook'
import { formatProfileError } from '../../utils/profileError'
import { playUiSound } from '../../utils/uiSound'

/**
 * In-app Aqua Account overlay. Replaces the fragile separate Tauri window that
 * rendered a blank black WebView. Everything account-related lives inside the
 * main launcher window, so the route/init-script plumbing is gone entirely.
 */
export default function AccountOverlay() {
  const open = useAppStore((s) => s.accountOpen)
  const toast = useToast()
  const aqua = useAquaAuth()
  const maintenance = useMaintenance()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [profileName, setProfileName] = useState('')
  const [profileDisplayName, setProfileDisplayName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarProgress, setAvatarProgress] = useState(0)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'invalid' | 'checking' | 'available' | 'unavailable' | 'error'>('idle')
  const [usernameMessage, setUsernameMessage] = useState('')
  const usernameTimerRef = useRef<number | null>(null)
  const usernameRequestRef = useRef(0)
  const accountRefreshRef = useRef(false)
  const soundOpenRef = useRef(false)
  const aquaProfileUsername = aqua.profile?.username ?? ''
  const aquaProfileDisplayName = aqua.profile?.display_name ?? ''
  const aquaConfigured = aqua.configured
  const aquaLoading = aqua.loading
  const refreshAqua = aqua.refresh

  const scheduleUsernameValidation = (nextUsername: string) => {
    if (usernameTimerRef.current !== null) {
      window.clearTimeout(usernameTimerRef.current)
      usernameTimerRef.current = null
    }

    // The live inline availability feedback below the username field is the
    // single source of truth for availability issues. Clear any stale
    // form-level error so the two can never render at the same time.
    setFormError(null)

    const trimmed = nextUsername.trim()
    const requestId = ++usernameRequestRef.current
    if (!trimmed) {
      setUsernameStatus('idle'); setUsernameMessage(''); return
    }

    const validationError = validateAquaUsername(nextUsername)
    if (validationError) {
      setUsernameStatus('invalid'); setUsernameMessage(validationError); return
    }

    setUsernameStatus('checking'); setUsernameMessage('Checking username availability...')
    usernameTimerRef.current = window.setTimeout(() => {
      void checkUsernameAvailable(trimmed)
        .then((available) => {
          if (requestId !== usernameRequestRef.current) return
          setUsernameStatus(available ? 'available' : 'unavailable')
          setUsernameMessage(available ? 'Username is available.' : 'That username was just taken.')
        })
        .catch((reason) => {
          if (requestId !== usernameRequestRef.current) return
          const message = reason instanceof Error ? reason.message : String(reason)
          if (import.meta.env.DEV) console.warn('Username availability check failed:', message)
          setUsernameStatus('error')
          setUsernameMessage(message)
        })
    }, 320)
  }

  const closeAndReset = () => {
    // toggle off via store; reset transient auth-form state on a fresh open
    appActions.closeOverlays()
    setFormError(null)
    setMode('signin')
    setPassword(''); setConfirmPassword('')
    setShowPassword(false); setShowConfirmPassword(false)
    setEmail(''); setUsername(''); setDisplayName('')
    setUsernameStatus('idle'); setUsernameMessage('')
    aqua.clearError()
  }

  useEffect(() => {
    if (soundOpenRef.current !== open) playUiSound(open ? 'popup' : 'close')
    soundOpenRef.current = open
  }, [open])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProfileName(aquaProfileUsername)
      setProfileDisplayName(aquaProfileDisplayName)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [aquaProfileDisplayName, aquaProfileUsername])

  useEffect(() => {
    if (!open) {
      accountRefreshRef.current = false
      return
    }
    if (!aquaConfigured || aquaLoading || accountRefreshRef.current) return
    accountRefreshRef.current = true
    void refreshAqua().catch(() => undefined)
  }, [aquaConfigured, aquaLoading, open, refreshAqua])

  useEffect(() => () => {
    if (usernameTimerRef.current !== null) window.clearTimeout(usernameTimerRef.current)
  }, [])

  async function submit() {
    setFormError(null)
    if (maintenance.restricted) {
      setFormError('Aqua online account services are temporarily unavailable during maintenance.')
      return
    }
    if (!email.trim() || !password) return setFormError('Email and password are required.')
    if (mode === 'signup') {
      const validationError = validateAquaUsername(username)
      // Username problems already surface live in the inline feedback below
      // the field (invalid / checking / taken / network error). Return without
      // writing a duplicate form-level error so only one error ever renders.
      if (validationError) return
      // The debounced inline availability check may be mid-flight (checking)
      // or stale by the time the user hits submit. Instead of silently
      // dropping the click with no feedback, let signUpAqua perform its own
      // authoritative availability check and surface a real error if the
      // operation actually fails.
      if (!displayName.trim()) return setFormError('Display name is required.')
      if (password.length < 8) return setFormError('Password must be at least 8 characters.')
      if (password !== confirmPassword) return setFormError('Passwords do not match.')
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        const result = await aqua.signIn(email.trim(), password)
        setPassword(''); setConfirmPassword('')
        if (result.emailConfirmationRequired) {
          setFormError('Check your email to confirm your account')
        } else {
          toast.pushToast('Aqua Account signed in', 'success')
        }
      } else {
        const result = await aqua.signUp(email.trim(), password, username.trim(), displayName.trim())
        setPassword(''); setConfirmPassword('')
        if (result.emailConfirmationRequired) {
          setMode('signin')
          setFormError('Check your email to confirm your account')
          setUsername(''); setDisplayName('')
          setUsernameStatus('idle'); setUsernameMessage('')
          toast.pushToast('Aqua Account created — check your email to confirm', 'success')
        } else {
          toast.pushToast('Aqua Account created', 'success')
        }
      }
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : 'The Aqua Account request failed. Try again.'
      if (mode === 'signin' && (msg.toLowerCase().includes('email not confirmed') || msg.toLowerCase().includes('not confirmed'))) {
        setFormError('Check your email to confirm your account')
      } else {
        setFormError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  async function saveProfile() {
    setFormError(null); setBusy(true)
    try {
      const values: { display_name?: string } = {}
      if (profileDisplayName.trim() !== (aqua.profile?.display_name ?? '')) values.display_name = profileDisplayName.trim()
      if (Object.keys(values).length) await aqua.updateProfile(values)
      toast.pushToast('Aqua profile updated', 'success')
    } catch (reason) {
      setFormError(formatProfileError(reason))
    } finally { setBusy(false) }
  }

  async function uploadAvatar(file: File) {
    if (!aqua.user) return
    setAvatarBusy(true); setAvatarProgress(0); setAvatarError(null)
    try {
      await uploadAquaAvatar(aqua.user.id, file, setAvatarProgress, setAvatarPreview)
      await aqua.refresh()
    } catch (reason) {
      setAvatarPreview(null)
      setAvatarError(reason instanceof Error ? reason.message : 'Avatar upload failed.')
    } finally { setAvatarBusy(false) }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="account-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Aqua Account"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.micro}
        >
          <button type="button" className="account-overlay__backdrop" aria-label="Close Aqua Account" onClick={closeAndReset} />
          <motion.section
            className="account-overlay__sheet"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={MOTION.drawer}
          >
            <div className="account-overlay__head">
              <div className="account-overlay__brand">
                <img src="/favicon.png" alt="Aqua" />
                <div>
                  <strong>Aqua Account</strong>
                  <span>Your account for Aqua services</span>
                </div>
              </div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={closeAndReset}>
                <X size={16} />
              </Button>
            </div>

            {maintenance.restricted ? (
              <section className="aqua-account-window__state">
                <ShieldCheck size={20} />
                <strong>Online account services paused</strong>
                <span>{maintenance.status?.maintenance_message || 'Aqua online services are temporarily unavailable.'} Offline Minecraft profiles remain available.</span>
              </section>
            ) : aqua.loading ? (
              <section className="aqua-account-window__state" aria-busy="true">
                <LoaderCircle size={22} className="spin" />
                <strong>Loading Aqua Account</strong>
                <span>Restoring your session and profile.</span>
              </section>
            ) : !aqua.configured ? (
              <section className="aqua-account-window__state">
                <ShieldCheck size={20} />
                <strong>Aqua Account unavailable</strong>
                <span>Supabase is not configured for this build. The launcher remains available.</span>
              </section>
            ) : aqua.user && !aqua.isSignedIn ? (
              <section className="aqua-account-window__state">
                <strong>Profile unavailable</strong>
                <span>Your session is valid, but the Aqua profile could not be loaded. Sign out and try again.</span>
                <Button variant="ghost" size="sm" disabled={aqua.loading} onClick={() => void aqua.signOut().catch((reason) => setFormError(reason instanceof Error ? reason.message : 'Unable to sign out.'))}>Sign out</Button>
              </section>
            ) : aqua.isSignedIn && aqua.profile ? (
              <section className="aqua-account-window__profile">
                <div className="aqua-account-window__avatar">{avatarPreview ? <img src={avatarPreview} alt="" /> : <Avatar src={aqua.profile.avatar_url} label={aqua.profile.display_name || aqua.profile.username} size="lg" />}</div>
                <label className="aqua-avatar-upload"><ImagePlus size={14} /><span>{avatarBusy ? `Uploading ${avatarProgress}%` : 'Change avatar'}</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={avatarBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.currentTarget.value = '' }} /></label>
                {avatarError ? <p className="aqua-account-error" role="alert">{avatarError}</p> : null}
                <strong>{aqua.profile.display_name || 'Aqua profile'}</strong>
                <span>@{aqua.profile.username || 'username unavailable'}</span>
                <em>Signed in</em>
                <div className="aqua-account-window__profile-form">
                  <label><span>Username</span><input value={profileName} readOnly aria-readonly="true" /></label>
                  <label><span>Display name</span><input value={profileDisplayName} onChange={(event) => setProfileDisplayName(event.target.value)} /></label>
                  <Button variant="ghost" size="sm" disabled={busy || aqua.loading} onClick={() => void saveProfile()}>{busy ? <LoaderCircle size={14} className="spin" /> : null}Save profile</Button>
                </div>
                {formError || aqua.error ? <p className="aqua-account-error" role="alert">{formError || aqua.error}</p> : null}
                <Button variant="ghost" size="sm" disabled={aqua.loading} onClick={() => void aqua.signOut().then(() => toast.pushToast('Aqua Account signed out', 'info')).catch((reason) => setFormError(reason instanceof Error ? reason.message : 'Unable to sign out.'))}>{aqua.loading ? <LoaderCircle size={14} className="spin" /> : <LogOut size={14} />}Sign out</Button>
              </section>
            ) : (
              <section className="aqua-account-window__form">
                <div className="aqua-account-window__tabs">
                  <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setFormError(null); aqua.clearError() }}>Sign in{mode === 'signin' ? <motion.span className="account-tab-indicator" layoutId="account-tab-indicator" transition={MOTION.spring} /> : null}</button>
                  <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setFormError(null); aqua.clearError() }}>Create account{mode === 'signup' ? <motion.span className="account-tab-indicator" layoutId="account-tab-indicator" transition={MOTION.spring} /> : null}</button>
                </div>
                {mode === 'signup' ? <>
                  <label className="aqua-account-field"><span>Username</span><input value={username} onChange={(event) => {
                    const nextUsername = event.target.value
                    setUsername(nextUsername)
                    scheduleUsernameValidation(nextUsername)
                  }} placeholder="3-24 letters, numbers, _ or -" autoComplete="off" /></label>
                  {usernameStatus !== 'idle' && username.trim() ? <small role={usernameStatus === 'error' || usernameStatus === 'invalid' || usernameStatus === 'unavailable' ? 'alert' : 'status'} className={usernameStatus === 'available' ? 'aqua-account-username--available' : usernameStatus === 'invalid' || usernameStatus === 'unavailable' || usernameStatus === 'error' ? 'aqua-account-username--invalid' : 'aqua-account-username--info'}>{usernameMessage}</small> : null}
                  <label className="aqua-account-field"><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="How you appear to friends" autoComplete="nickname" /></label>
                </> : null}
                <label className="aqua-account-field"><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" /></label>
                <label className="aqua-account-field">
                  <span>Password</span>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={mode === 'signin' ? 'Enter your password' : 'At least 8 characters'}
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      style={{ paddingRight: '2.5rem', width: '100%' }}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((v) => !v)}
                      style={{ position: 'absolute', right: '0.5rem', background: 'none', border: 'none', color: 'var(--color-text-muted, #888)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </label>
                {mode === 'signup' ? (
                  <label className="aqua-account-field">
                    <span>Confirm password</span>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Repeat your password"
                        autoComplete="new-password"
                        style={{ paddingRight: '2.5rem', width: '100%' }}
                      />
                      <button
                        type="button"
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        style={{ position: 'absolute', right: '0.5rem', background: 'none', border: 'none', color: 'var(--color-text-muted, #888)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
                      >
                        {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </label>
                ) : null}
                {formError || aqua.error ? <p className="aqua-account-error" role="alert">{formError || aqua.error}</p> : null}
                {aqua.emailConfirmationRequired ? <p className="aqua-account-confirmation" role="status">Check your email to confirm your account</p> : null}
                {!aqua.error && !aqua.emailConfirmationRequired ? <p className="aqua-account-window__hint">Aqua Account is separate from Microsoft and Offline profiles.</p> : null}
                <Button variant="aqua" block disabled={busy || aqua.loading} onClick={() => void submit()}>{busy ? <LoaderCircle size={14} className="spin" /> : null}{mode === 'signin' ? 'Sign in' : 'Create Aqua Account'}</Button>
              </section>
            )}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
