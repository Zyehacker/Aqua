import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { AquaAuthResult, AquaProfile } from '../services/aquaAuthService'
import type { AccountSettings } from '../services/aquaSocialService'

export type AquaAuthContextValue = {
  configured: boolean
  isSignedIn: boolean
  session: Session | null
  user: User | null
  profile: AquaProfile | null
  accountSettings: AccountSettings | null
  loading: boolean
  error: string | null
  emailConfirmationRequired: boolean
  clearError: () => void
  acceptTerms: (version: string) => Promise<void>
  refresh: () => Promise<AquaAuthResult>
  signIn: (email: string, password: string) => Promise<AquaAuthResult>
  signUp: (email: string, password: string, username: string, displayName: string) => Promise<AquaAuthResult>
  resendConfirmation: (email: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (values: Partial<Pick<AquaProfile, 'username' | 'display_name' | 'avatar_url'>>) => Promise<AquaProfile>
  updateAccountSettings: (values: Partial<Omit<AccountSettings, 'user_id'>>) => Promise<AccountSettings>
}

export const AquaAuthContext = createContext<AquaAuthContextValue | null>(null)
