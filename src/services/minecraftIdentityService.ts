import { supabase } from './supabaseClient'

export async function verifyMinecraftIdentity(minecraftAccessToken: string) {
  if (!supabase) throw new Error('Aqua Account is unavailable because Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('verify-minecraft-identity', { body: { minecraft_access_token: minecraftAccessToken } })
  if (error) throw error
  return data as { linked: boolean; minecraft_uuid: string; minecraft_name: string | null }
}
