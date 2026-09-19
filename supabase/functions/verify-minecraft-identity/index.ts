import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors })
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return Response.json({ error: 'Authentication required' }, { status: 401, headers: cors })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return Response.json({ error: 'Authentication required' }, { status: 401, headers: cors })

  const body = await request.json().catch(() => ({})) as { minecraft_access_token?: unknown }
  const token = typeof body.minecraft_access_token === 'string' ? body.minecraft_access_token : ''
  if (!token || token.length > 4096) return Response.json({ error: 'Minecraft credential required' }, { status: 400, headers: cors })

  const profileResponse = await fetch('https://api.minecraftservices.com/minecraft/profile', { headers: { Authorization: `Bearer ${token}` } })
  if (!profileResponse.ok) return Response.json({ error: 'Minecraft credential is invalid or expired' }, { status: 401, headers: cors })
  const profile = await profileResponse.json() as { id?: string; name?: string }
  const rawId = profile.id ?? ''
  if (!/^[0-9a-f]{32}$/i.test(rawId)) return Response.json({ error: 'Minecraft profile response was invalid' }, { status: 502, headers: cors })
  const minecraftUuid = `${rawId.slice(0, 8)}-${rawId.slice(8, 12)}-${rawId.slice(12, 16)}-${rawId.slice(16, 20)}-${rawId.slice(20)}`

  const { data, error } = await supabase.rpc('bind_verified_minecraft_identity', { p_minecraft_uuid: minecraftUuid })
  if (error) {
    const duplicate = error.message.toLowerCase().includes('duplicate') || error.code === '23505'
    return Response.json({ error: duplicate ? 'Minecraft identity is already linked to another account' : 'Unable to link Minecraft identity' }, { status: duplicate ? 409 : 400, headers: cors })
  }
  return Response.json({ linked: true, minecraft_uuid: data?.minecraft_uuid ?? minecraftUuid, minecraft_name: profile.name ?? null }, { headers: cors })
})
