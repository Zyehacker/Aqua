import type { Session, User } from '@supabase/supabase-js'
import { getAquaAuthRedirectUrl, SUPABASE_UNAVAILABLE_MESSAGE, supabase } from './supabaseClient'
import { checkUsernameAvailable, ensureAccountData, normalizeAquaUsername, updateProfile, validateAquaUsername, type AquaProfile } from './aquaSocialService'

export type { AquaProfile } from './aquaSocialService'

export type AquaAuthResult = {
  session: Session | null
  user: User | null
  profile: AquaProfile | null
  emailConfirmationRequired: boolean
}

const AUTH_TIMEOUT_MS = 30_000
const PENDING_CONFIRMATION_EMAIL_KEY = 'aqua.pendingConfirmationEmail'

const EMPTY_AUTH_RESULT: AquaAuthResult = {
  session: null,
  user: null,
  profile: null,
  emailConfirmationRequired: false,
}

function withAuthTimeout<T>(promise: Promise<T>, message: string) {
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  })
}

export async function clearLocalAquaSession() {
  if (!supabase) return
  await supabase.auth.signOut({ scope: 'local' })
}

export async function acceptAquaTerms(version: string) {
  if (!supabase) return
  const { error } = await withAuthTimeout(
    supabase.auth.updateUser({ data: { aqua_terms_version: version } }),
    'Aqua Terms acceptance could not be synced.',
  )
  if (error) throw error
}

export async function restoreAquaAuth(): Promise<AquaAuthResult> {
  if (!supabase) throw new Error(SUPABASE_UNAVAILABLE_MESSAGE)
  const { data, error } = await withAuthTimeout(supabase.auth.getSession(), 'Aqua Account session restore timed out. Check your connection and retry.')
  if (error) throw error
  const user = data.session?.user ?? null
  const accountData = user ? await withAuthTimeout(ensureAccountData(user.id), 'Aqua Account data loading timed out. Check your connection and retry.') : { profile: null, settings: null }
  if (user && !accountData.profile) {
    await clearLocalAquaSession()
    return EMPTY_AUTH_RESULT
  }
  return {
    session: data.session,
    user,
    profile: accountData.profile,
    emailConfirmationRequired: false,
  }
}

export async function signInAqua(email: string, password: string): Promise<AquaAuthResult> {
  if (!supabase) throw new Error(SUPABASE_UNAVAILABLE_MESSAGE)
  const { data, error } = await withAuthTimeout(supabase.auth.signInWithPassword({ email, password }), 'Aqua Account sign-in timed out. Check your connection and retry.')
  if (error) throw error
  const accountData = data.user ? await withAuthTimeout(ensureAccountData(data.user.id), 'Aqua Account data loading timed out. Check your connection and retry.') : { profile: null, settings: null }
  if (data.user && !accountData.profile) {
    await clearLocalAquaSession()
    throw new Error('Your Aqua profile could not be loaded. Your stale session was cleared; please sign in again.')
  }
  return {
    session: data.session,
    user: data.user,
    profile: accountData.profile,
    emailConfirmationRequired: false,
  }
}

export async function signUpAqua(
  email: string,
  password: string,
  username: string,
  displayName: string,
): Promise<AquaAuthResult> {
  if (!supabase) throw new Error(SUPABASE_UNAVAILABLE_MESSAGE)
  const normalizedUsername = normalizeAquaUsername(username)
  const validationError = validateAquaUsername(normalizedUsername)
  if (validationError) throw new Error(validationError)
  const available = await withAuthTimeout(checkUsernameAvailable(normalizedUsername), 'Aqua username availability check timed out. Check your connection and retry.')
  if (!available) throw new Error('That username was just taken.')

  const { data, error } = await withAuthTimeout(supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAquaAuthRedirectUrl(),
      data: { username: normalizedUsername, display_name: displayName },
    },
  }), 'Aqua Account sign-up timed out. Check your connection and retry.')

  if (error) {
    throw error
  }

  window.localStorage.setItem(PENDING_CONFIRMATION_EMAIL_KEY, email)

  if (!data.user) {
    return { session: null, user: null, profile: null, emailConfirmationRequired: true }
  }

  const emailConfirmationRequired = !data.session
  if (emailConfirmationRequired) {
    return {
      session: null,
      user: null,
      profile: null,
      emailConfirmationRequired: true,
    }
  }

  const accountData = await withAuthTimeout(ensureAccountData(data.user.id), 'Aqua account settings creation timed out. Check your connection and retry.')
  return {
    session: data.session,
    user: data.user,
    profile: accountData.profile,
    emailConfirmationRequired: false,
  }
}

export function getPendingConfirmationEmail() {
  return window.localStorage.getItem(PENDING_CONFIRMATION_EMAIL_KEY) ?? ''
}

export function clearPendingConfirmationEmail() {
  window.localStorage.removeItem(PENDING_CONFIRMATION_EMAIL_KEY)
}

export async function resendAquaConfirmation(email: string) {
  if (!supabase) throw new Error(SUPABASE_UNAVAILABLE_MESSAGE)
  const normalizedEmail = email.trim()
  if (!normalizedEmail) throw new Error('Enter the email address used to create your Aqua Account.')
  const { error } = await withAuthTimeout(supabase.auth.resend({
    type: 'signup',
    email: normalizedEmail,
    options: { emailRedirectTo: getAquaAuthRedirectUrl() },
  }), 'Aqua confirmation email request timed out. Check your connection and retry.')
  if (error) throw error
  window.localStorage.setItem(PENDING_CONFIRMATION_EMAIL_KEY, normalizedEmail)
}

type AuthCallbackParams = {
  accessToken: string | null
  refreshToken: string | null
  code: string | null
  error: string | null
  errorCode: string | null
  errorDescription: string | null
}

function readAuthCallbackParams(): AuthCallbackParams | null {
  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const callbackKeys = ['access_token', 'refresh_token', 'type', 'code', 'error', 'error_code', 'error_description']
  if (![query, hash].some((params) => [...params.keys()].some((key) => callbackKeys.includes(key)))) return null
  const read = (key: string) => hash.get(key) ?? query.get(key)
  return {
    accessToken: read('access_token'),
    refreshToken: read('refresh_token'),
    code: read('code'),
    error: read('error'),
    errorCode: read('error_code'),
    errorDescription: read('error_description'),
  }
}

export function hasAquaAuthCallback() {
  return readAuthCallbackParams() !== null
}

export function clearAuthCallbackUrl() {
  const url = new URL(window.location.href)
  const pathname = url.pathname === '/auth/callback' ? '/' : url.pathname
  for (const key of ['access_token', 'refresh_token', 'type', 'code', 'error', 'error_code', 'error_description', 'sb']) {
    url.searchParams.delete(key)
  }
  window.history.replaceState({}, document.title, `${pathname}${url.search ? `?${url.searchParams.toString()}` : ''}`)
}

export function processAquaAuthCallback() {
  const params = readAuthCallbackParams()
  if (!params) return null
  clearAuthCallbackUrl()
  if (params.error || params.errorCode || params.errorDescription) {
    return Promise.resolve({ status: 'error' as const, errorCode: params.errorCode, error: params.error, description: params.errorDescription })
  }
  return (async () => {
    if (!supabase) throw new Error(SUPABASE_UNAVAILABLE_MESSAGE)
    if (params.code) {
      const { error } = await withAuthTimeout(supabase.auth.exchangeCodeForSession(params.code), 'Aqua email confirmation could not be completed. Request a new confirmation email and try again.')
      if (error) throw error
    } else if (params.accessToken && params.refreshToken) {
      const { error } = await withAuthTimeout(supabase.auth.setSession({ access_token: params.accessToken, refresh_token: params.refreshToken }), 'Aqua email confirmation could not be completed. Request a new confirmation email and try again.')
      if (error) throw error
    }
    const { data, error } = await withAuthTimeout(supabase.auth.getUser(), 'Aqua email confirmation could not be verified. Request a new confirmation email and try again.')
    if (error || !data.user) throw error ?? new Error('Aqua email confirmation did not create a valid session.')
    clearPendingConfirmationEmail()
    return { status: 'success' as const }
  })()
}

export async function signOutAqua() {
  if (!supabase) throw new Error(SUPABASE_UNAVAILABLE_MESSAGE)
  const { error } = await withAuthTimeout(supabase.auth.signOut({ scope: 'local' }), 'Aqua Account sign-out timed out. Check your connection and retry.')
  if (error) throw error
}

export async function updateAquaProfile(userId: string, values: Partial<Pick<AquaProfile, 'username' | 'display_name' | 'avatar_url'>>) {
  return withAuthTimeout(updateProfile(userId, values), 'Aqua profile update timed out. Check your connection and retry.')
}

export function subscribeToAquaAuth(onChange: (result: AquaAuthResult) => void) {
  if (!supabase) {
    return { data: { subscription: { unsubscribe: () => undefined } } }
  }
  return supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null
    void (user ? ensureAccountData(user.id).then((result) => result.profile) : Promise.resolve(null))
      .then(async (profile) => {
        if (user && !profile) {
          await clearLocalAquaSession()
          onChange(EMPTY_AUTH_RESULT)
          return
        }
        onChange({ session, user, profile, emailConfirmationRequired: false })
      })
  })
}
