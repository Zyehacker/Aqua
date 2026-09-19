import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const SUPABASE_UNAVAILABLE_MESSAGE = 'Aqua Account is unavailable because Supabase is not configured.'

export function getSupabaseUrl() {
  return typeof supabaseUrl === 'string' ? supabaseUrl.replace(/\/$/, '') : ''
}

export function getAquaAuthRedirectUrl() {
  const configuredRedirect = import.meta.env.VITE_AQUA_AUTH_REDIRECT_URL
  if (configuredRedirect) {
    try {
      const parsed = new URL(configuredRedirect)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString()
    } catch {
      // Use the current site when the optional deployment override is invalid.
    }
  }
  return `${window.location.origin}/auth/callback`
}

export function getSupabaseErrorMessage(context: string, error: unknown): string {
  const base = `Couldn't ${context}`

  if (!error) return base

  if (error instanceof Error) {
    const name = error.name || 'UnknownError'
    const detail = error.message || 'Unknown Supabase error'
    const cause = error.cause ? ` (${String(error.cause)})` : ''
    return `${base}: ${name}${cause} - ${detail}`
  }

  if (typeof error === 'object') {
    const candidate = error as Record<string, unknown>
    const status = typeof candidate.status === 'number' ? ` (status ${candidate.status})` : ''
    const name = typeof candidate.name === 'string' ? candidate.name : 'UnknownError'
    const message = typeof candidate.message === 'string' ? candidate.message : JSON.stringify(error)
    return `${base}: ${name}${status} - ${message}`
  }

  return `${base}: ${String(error)}`
}

function createConfiguredClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabasePublishableKey) return null
  try {
    const parsed = new URL(supabaseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  } catch {
    return null
  }
}

export const supabase = createConfiguredClient()
export const isSupabaseConfigured = supabase !== null
