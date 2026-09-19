import { supabase } from './supabaseClient'

export type SystemStatus = { maintenance: boolean; maintenance_enabled?: boolean; maintenance_message: string; updated_at: string; updated_by: string | null }

function client() {
  if (!supabase) throw new Error('Aqua Account is unavailable because Supabase is not configured.')
  return supabase
}

export async function getSystemStatus() {
  const { data, error } = await client().rpc('get_system_status')
  if (error) throw error
  const raw = data as SystemStatus
  return { ...raw, maintenance: raw.maintenance_enabled ?? raw.maintenance ?? false }
}

export async function isCurrentUserAdmin() {
  const { data, error } = await client().rpc('is_current_user_admin')
  if (error) throw error
  return data === true
}

export async function setMaintenance(enabled: boolean, message = '') {
  const { data, error } = await client().rpc('set_maintenance', { p_enabled: enabled, p_message: message })
  if (error) throw error
  return data as SystemStatus
}
