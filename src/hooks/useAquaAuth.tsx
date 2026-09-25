import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  restoreAquaAuth,
  acceptAquaTerms,
  signInAqua,
  signOutAqua,
  signUpAqua,
  resendAquaConfirmation,
  subscribeToAquaAuth,
  updateAquaProfile,
  type AquaProfile,
} from '../services/aquaAuthService'
import { getAccountSettings, updateAccountSettings, type AccountSettings } from '../services/aquaSocialService'
import { isSupabaseConfigured } from '../services/supabaseClient'
import { AquaAuthContext, type AquaAuthContextValue } from './aquaAuthContext'
import { useMaintenance } from './useMaintenanceHook'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function AquaAuthProvider({ children }: { children: ReactNode }) {
  const maintenance = useMaintenance()
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AquaProfile | null>(null)
  const [accountSettings, setAccountSettings] = useState<AccountSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [emailConfirmationRequired, setEmailConfirmationRequired] = useState(false)
  const authGeneration = useRef(0)

  useEffect(() => {
    if (maintenance.restricted) return undefined
    let active = true
    const applyAuthResult = async (result: { session: Session | null; user: User | null; profile: AquaProfile | null; emailConfirmationRequired: boolean }) => {
      const generation = ++authGeneration.current
      setSession(result.session); setUser(result.user); setProfile(result.profile); setEmailConfirmationRequired(result.emailConfirmationRequired)
      const nextSettings = result.session ? await getAccountSettings(result.session.user.id) : null
      if (!active || generation !== authGeneration.current) return
      setAccountSettings(nextSettings)
    }
    const restore = () => restoreAquaAuth()
      .then((result) => {
        if (!active) return result
        void applyAuthResult(result)
        return result
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason))
        throw reason
      })
      .finally(() => active && setLoading(false))

    void restore()

    const { data } = subscribeToAquaAuth((result) => {
      if (!active) return
      void applyAuthResult(result).catch((reason) => active && setError(errorMessage(reason)))
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [maintenance.restricted])

  const refresh = useCallback(async () => {
    if (maintenance.restricted) {
      setSession(null); setUser(null); setProfile(null); setAccountSettings(null); setEmailConfirmationRequired(false); setError(null); setLoading(false)
      return { session: null, user: null, profile: null, emailConfirmationRequired: false }
    }
    setLoading(true); setError(null)
    try {
      const result = await restoreAquaAuth()
      setSession(result.session); setUser(result.user); setProfile(result.profile); setEmailConfirmationRequired(result.emailConfirmationRequired)
      setAccountSettings(result.session ? await getAccountSettings(result.session.user.id) : null)
      return result
    } catch (reason) {
      setError(errorMessage(reason))
      throw reason
    } finally {
      setLoading(false)
    }
  }, [maintenance.restricted])

  const value = useMemo<AquaAuthContextValue>(() => ({
    configured: isSupabaseConfigured,
    isSignedIn: !maintenance.restricted && Boolean(user && profile),
    session: maintenance.restricted ? null : session,
    user: maintenance.restricted ? null : user,
    profile: maintenance.restricted ? null : profile,
    accountSettings: maintenance.restricted ? null : accountSettings,
    loading: maintenance.restricted ? false : loading,
    error: maintenance.restricted ? null : error,
    emailConfirmationRequired: maintenance.restricted ? false : emailConfirmationRequired,
    clearError: () => setError(null),
    acceptTerms: async (version) => {
      if (!user) return
      await acceptAquaTerms(version)
    },
    refresh,
    signIn: async (email, password) => {
      if (maintenance.restricted) throw new Error('Aqua online account services are temporarily unavailable during maintenance.')
      setLoading(true); setError(null)
      try {
        const result = await signInAqua(email, password)
        setSession(result.session); setUser(result.user); setProfile(result.profile)
        setAccountSettings(result.session ? await getAccountSettings(result.session.user.id) : null)
        return result
      } catch (reason) { setError(errorMessage(reason)); throw reason }
      finally { setLoading(false) }
    },
    signUp: async (email, password, username, displayName) => {
      if (maintenance.restricted) throw new Error('Aqua online account services are temporarily unavailable during maintenance.')
      setLoading(true); setError(null); setEmailConfirmationRequired(false)
      try {
        const result = await signUpAqua(email, password, username, displayName)
        setSession(result.session); setUser(result.user); setProfile(result.profile); setEmailConfirmationRequired(result.emailConfirmationRequired)
        setAccountSettings(result.session ? await getAccountSettings(result.session.user.id) : null)
        return result
      } catch (reason) { setError(errorMessage(reason)); throw reason }
      finally { setLoading(false) }
    },
    resendConfirmation: async (email) => {
      if (maintenance.restricted) throw new Error('Aqua online account services are temporarily unavailable during maintenance.')
      setLoading(true); setError(null)
      try { await resendAquaConfirmation(email) }
      catch (reason) { setError(errorMessage(reason)); throw reason }
      finally { setLoading(false) }
    },
    signOut: async () => {
      setLoading(true); setError(null)
      try { await signOutAqua(); setSession(null); setUser(null); setProfile(null); setAccountSettings(null); setEmailConfirmationRequired(false) }
      catch (reason) { setError(errorMessage(reason)); throw reason }
      finally { setLoading(false) }
    },
    updateProfile: async (values) => {
      if (!user) throw new Error('Sign in to edit your Aqua profile.')
      setLoading(true); setError(null)
      try {
        const next = await updateAquaProfile(user.id, values)
        setProfile(next)
        return next
      } catch (reason) { setError(errorMessage(reason)); throw reason }
      finally { setLoading(false) }
    },
    updateAccountSettings: async (values) => {
      if (!user) throw new Error('Sign in to edit your Aqua account settings.')
      setLoading(true); setError(null)
      try {
        const next = await updateAccountSettings(user.id, values)
        setAccountSettings(next)
        return next
      } catch (reason) { setError(errorMessage(reason)); throw reason }
      finally { setLoading(false) }
    },
  }), [accountSettings, emailConfirmationRequired, error, loading, maintenance.restricted, profile, refresh, session, user])

  return <AquaAuthContext.Provider value={value}>{children}</AquaAuthContext.Provider>
}

