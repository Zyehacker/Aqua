import { getSupabaseErrorMessage, getSupabaseUrl, SUPABASE_UNAVAILABLE_MESSAGE, supabase } from './supabaseClient'

export const AQUA_USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,24}$/

export function normalizeAquaUsername(value: string) {
  return value.trim().replace(/\s+/g, '').toLowerCase()
}

export function validateAquaUsername(value: string) {
  const username = normalizeAquaUsername(value)
  if (!username) return 'Username is required.'
  if (username.length < 3 || username.length > 24) return 'Username must be 3-24 characters.'
  if (!AQUA_USERNAME_PATTERN.test(username)) return 'Use only letters, numbers, underscores, and hyphens.'
  if (username.includes('@')) return 'Username cannot be an email address.'
  return null
}

export type AquaProfile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  created_at?: string
  updated_at?: string
}

export type AccountSettings = {
  user_id: string
  show_online_status: boolean
  show_playing_status: boolean
  allow_friend_requests: boolean
}

export type FriendRequest = {
  id: string
  sender_id: string
  receiver_id: string
  status: string
  created_at: string
  updated_at?: string
  sender?: AquaProfile | null
  receiver?: AquaProfile | null
}

export type Friendship = {
  id: string
  user_id: string
  friend_id: string
  created_at: string
  friend?: AquaProfile | null
}

export type AquaSocialData = {
  friends: Friendship[]
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('The selected avatar could not be read.')) }
    image.src = objectUrl
  })
}

async function prepareAvatar(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Avatar must be a PNG, JPEG, or WebP image.')
  if (file.size > MAX_AVATAR_BYTES) throw new Error('Avatar files must be 5 MB or smaller.')
  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Avatar compression is unavailable in this browser.')
  const scale = Math.min(512 / image.naturalWidth, 512 / image.naturalHeight)
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  context.fillStyle = '#101820'
  context.fillRect(0, 0, 512, 512)
  context.drawImage(image, Math.round((512 - width) / 2), Math.round((512 - height) / 2), width, height)
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8))
  if (blob && blob.size > 220_000) blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.65))
  if (!blob) throw new Error('Avatar compression failed.')
  if (blob.size > MAX_AVATAR_BYTES) throw new Error('Compressed avatar is still larger than 5 MB.')
  return blob
}

export async function uploadAquaAvatar(userId: string, file: File, onProgress?: (value: number) => void, onPreview?: (url: string) => void) {
  const client = requireClient()
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken || sessionData.session?.user.id !== userId) throw new Error('Your Aqua session expired. Sign in again and retry.')
  onProgress?.(10)
  const blob = await prepareAvatar(file)
  onPreview?.(URL.createObjectURL(blob))
  onProgress?.(45)
  const path = `${userId}/avatar.webp`
  const { error: uploadError } = await client.storage.from('avatars').upload(path, blob, { contentType: 'image/webp', upsert: true, cacheControl: '3600' })
  if (uploadError) throw uploadError
  onProgress?.(65)
  const moderationUrl = `${getSupabaseUrl()}/functions/v1/moderate-avatar`
  console.info('[aquaSocialService] Calling avatar moderation function:', moderationUrl, { path, hasAccessToken: Boolean(accessToken) })
  let moderation: { allowed?: boolean; [key: string]: unknown }
  try {
    const response = await fetch(moderationUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    const responseText = await response.text()
    let responseData: unknown = null
    try { responseData = responseText ? JSON.parse(responseText) : null } catch { responseData = null }
    if (!response.ok) {
      console.error('[aquaSocialService] Avatar moderation returned an error:', response.status, responseData)
      throw new Error(`moderate-avatar returned HTTP ${response.status}`)
    }
    moderation = responseData as { allowed?: boolean; [key: string]: unknown }
    console.info('[aquaSocialService] Avatar moderation response received:', { allowed: moderation?.allowed })
  } catch (reason) {
    console.error('[aquaSocialService] Avatar moderation request failed:', reason)
    throw new Error("Couldn't verify image, try again", { cause: reason })
  }
  if (!moderation || moderation.allowed !== true) {
    console.warn('[aquaSocialService] Avatar rejected by moderation:', moderation)
    throw new Error("This image couldn't be approved, try another")
  }
  onProgress?.(85)
  const { data } = client.storage.from('avatars').getPublicUrl(path)
  const profile = await updateProfile(userId, { avatar_url: `${data.publicUrl}?v=${Date.now()}` })
  onProgress?.(100)
  return profile
}

const SOCIAL_CACHE_TTL_MS = 30_000
const socialCache = new Map<string, { expiresAt: number; value: AquaSocialData }>()
const socialRequests = new Map<string, Promise<AquaSocialData>>()

function requireClient() {
  if (!supabase) throw new Error(SUPABASE_UNAVAILABLE_MESSAGE)
  return supabase
}

export async function getProfile(userId: string) {
  const client = requireClient()
  const { data, error } = await client
    .from('profiles')
    .select('id, username, display_name, avatar_url, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data as AquaProfile | null
}

export async function checkUsernameAvailable(username: string) {
  const client = requireClient()
  const normalized = normalizeAquaUsername(username)
  if (!normalized) return false

  try {
    const { data, error } = await client.rpc('is_username_available', {
      check_username: normalized,
    })

    if (error) {
      const message = getSupabaseErrorMessage('check username availability', error)
      console.error('[aquaSocialService] Username availability check failed:', error)
      throw new Error(message)
    }

    return data === true
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Couldn't check username availability")) {
      throw error
    }

    const message = getSupabaseErrorMessage('check username availability', error)
    console.error('[aquaSocialService] Username availability check failed:', error)
    throw new Error(message, { cause: error })
  }
}

export async function createProfile(userId: string, username: string, displayName: string) {
  const client = requireClient()
  const normalized = normalizeAquaUsername(username)
  const validationError = validateAquaUsername(normalized)
  if (validationError) throw new Error(validationError)
  const available = await checkUsernameAvailable(normalized)
  if (!available) throw new Error('That username was just taken.')

  const { data, error } = await client
    .from('profiles')
    .upsert({ id: userId, username: normalized, display_name: displayName }, { onConflict: 'id' })
    .select('id, username, display_name, avatar_url, created_at, updated_at')
    .single()
  if (error) {
    if (error.code === '23505' || error.message.toLowerCase().includes('duplicate key')) {
      throw new Error('That username was just taken.')
    }
    throw error
  }
  return data as AquaProfile
}

export async function updateProfile(userId: string, values: Partial<Pick<AquaProfile, 'username' | 'display_name' | 'avatar_url'>>) {
  const client = requireClient()
  const username = values.username ? normalizeAquaUsername(values.username) : null
  if (username) {
    const validationError = validateAquaUsername(username)
    if (validationError) throw new Error(validationError)
    const { data: conflict, error: conflictError } = await client
      .from('profiles')
      .select('id')
      .ilike('username', username.replace(/[\\%_]/g, (character) => `\\${character}`))
      .neq('id', userId)
      .maybeSingle()
    if (conflictError) throw conflictError
    if (conflict) throw new Error('That username was just taken.')
  }
  const { data, error } = await client
    .from('profiles')
    .update(values)
    .eq('id', userId)
    .select('id, username, display_name, avatar_url, created_at, updated_at')
    .single()
  if (error) throw error
  return data as AquaProfile
}

export async function getAccountSettings(userId: string) {
  const client = requireClient()
  const { data, error } = await client
    .from('account_settings')
    .select('user_id, show_online_status, show_playing_status, allow_friend_requests')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (data) return data as AccountSettings

  const defaults = {
    user_id: userId,
    show_online_status: true,
    show_playing_status: true,
    allow_friend_requests: true,
  }
  const { data: created, error: createError } = await client
    .from('account_settings')
    .upsert(defaults, { onConflict: 'user_id' })
    .select('user_id, show_online_status, show_playing_status, allow_friend_requests')
    .single()
  if (createError) throw createError
  return created as AccountSettings
}

export async function updateAccountSettings(userId: string, values: Partial<Omit<AccountSettings, 'user_id'>>) {
  const client = requireClient()
  const { data, error } = await client
    .from('account_settings')
    .update(values)
    .eq('user_id', userId)
    .select('user_id, show_online_status, show_playing_status, allow_friend_requests')
    .single()
  if (error) throw error
  return data as AccountSettings
}

export async function ensureAccountData(userId: string, username?: string | null, displayName?: string | null) {
  const profile = await getProfile(userId)
  const resolvedProfile = profile ?? (username && displayName ? await createProfile(userId, username, displayName) : null)
  if (!resolvedProfile) return { profile: null, settings: null }
  const settings = await getAccountSettings(userId)
  return { profile: resolvedProfile, settings }
}

export async function searchProfiles(userId: string, query: string) {
  const client = requireClient()
  const normalized = query.trim()
  if (!normalized) return []
  const pattern = `%${normalized.replace(/[%_,]/g, '')}%`
  const { data, error } = await client
    .from('profiles')
    .select('id, username, display_name, avatar_url, created_at, updated_at')
    .neq('id', userId)
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .limit(20)
  if (error) throw error
  return (data ?? []) as AquaProfile[]
}

async function loadProfiles(ids: string[]) {
  const client = requireClient()
  if (!ids.length) return new Map<string, AquaProfile>()
  const { data, error } = await client
    .from('profiles')
    .select('id, username, display_name, avatar_url, created_at, updated_at')
    .in('id', ids)
  if (error) throw error
  return new Map((data ?? []).map((profile) => [profile.id, profile as AquaProfile]))
}

export async function getFriendRequests(userId: string) {
  const client = requireClient()
  const [{ data: incoming, error: incomingError }, { data: outgoing, error: outgoingError }] = await Promise.all([
    client.from('friend_requests').select('id, sender_id, receiver_id, status, created_at, updated_at').eq('receiver_id', userId).eq('status', 'pending').order('created_at', { ascending: false }),
    client.from('friend_requests').select('id, sender_id, receiver_id, status, created_at, updated_at').eq('sender_id', userId).eq('status', 'pending').order('created_at', { ascending: false }),
  ])
  if (incomingError) throw incomingError
  if (outgoingError) throw outgoingError
  const rows = [...(incoming ?? []), ...(outgoing ?? [])] as FriendRequest[]
  const profiles = await loadProfiles(rows.flatMap((request) => [request.sender_id, request.receiver_id]).filter((id) => id !== userId))
  return {
    incoming: (incoming ?? []).map((request) => ({ ...request, sender: profiles.get(request.sender_id) ?? null })) as FriendRequest[],
    outgoing: (outgoing ?? []).map((request) => ({ ...request, receiver: profiles.get(request.receiver_id) ?? null })) as FriendRequest[],
  }
}

export async function getFriendships(userId: string) {
  const client = requireClient()
  const { data, error } = await client
    .from('friendships')
    .select('id, user_id, friend_id, created_at')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as Friendship[]
  const friendIds = rows.map((row) => row.user_id === userId ? row.friend_id : row.user_id)
  const profiles = await loadProfiles(friendIds)
  return rows.map((row) => ({ ...row, friend: profiles.get(row.user_id === userId ? row.friend_id : row.user_id) ?? null }))
}

export async function getSocialData(userId: string, force = false): Promise<AquaSocialData> {
  const cached = socialCache.get(userId)
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value
  const pending = socialRequests.get(userId)
  if (!force && pending) return pending

  const request = Promise.all([getFriendships(userId), getFriendRequests(userId)])
    .then(([friends, requests]) => {
      const value = { friends, incoming: requests.incoming, outgoing: requests.outgoing }
      socialCache.set(userId, { expiresAt: Date.now() + SOCIAL_CACHE_TTL_MS, value })
      return value
    })
    .finally(() => socialRequests.delete(userId))
  socialRequests.set(userId, request)
  return request
}

export function logSocialError(section: string, reason: unknown) {
  console.error(`[aquaSocialService] ${section} failed:`, reason)
}

export function invalidateSocialData(userId: string) {
  socialCache.delete(userId)
}

export async function sendFriendRequest(senderId: string, receiverId: string) {
  if (senderId === receiverId) throw new Error('You cannot send a friend request to yourself.')
  const client = requireClient()
  const { data: existingFriendship, error: friendshipError } = await client
    .from('friendships')
    .select('id')
    .or(`and(user_id.eq.${senderId},friend_id.eq.${receiverId}),and(user_id.eq.${receiverId},friend_id.eq.${senderId})`)
    .maybeSingle()
  if (friendshipError) throw friendshipError
  if (existingFriendship) throw new Error('You are already friends.')

  const { data, error } = await client
    .from('friend_requests')
    .insert({ sender_id: senderId, receiver_id: receiverId, status: 'pending' })
    .select('id, sender_id, receiver_id, status, created_at, updated_at')
    .single()
  if (error) throw error
  invalidateSocialData(senderId)
  invalidateSocialData(receiverId)
  return data as FriendRequest
}

export async function updateFriendRequest(requestId: string, status: 'accepted' | 'declined' | 'cancelled') {
  const client = requireClient()
  if (status === 'accepted') {
    const { data, error } = await client.rpc('accept_friend_request', { request_id: requestId })
    if (error) throw error
    socialCache.clear()
    return data
  }
  const { data, error } = await client
    .from('friend_requests')
    .update({ status })
    .eq('id', requestId)
    .select('id, sender_id, receiver_id, status, created_at, updated_at')
    .single()
  if (error) throw error
  socialCache.clear()
  return data as FriendRequest
}

export async function removeFriend(userId: string, friendId: string) {
  const client = requireClient()
  const { error } = await client
    .from('friendships')
    .delete()
    .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`)
  if (error) throw error
  invalidateSocialData(userId)
  invalidateSocialData(friendId)
}
