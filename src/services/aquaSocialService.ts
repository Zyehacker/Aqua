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

export type DirectMessage = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  pending?: boolean
  failed?: boolean
}

export type DirectConversation = { id: string; created_at: string }

const SAFE_SOCIAL_ERROR = 'Aqua social services are temporarily unavailable. Please try again.'

export function safeSocialError(reason: unknown, fallback = SAFE_SOCIAL_ERROR) {
  if (import.meta.env.DEV) console.error('[aquaSocialService]', reason)
  return fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function requireId(value: unknown, label: string) {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) throw new Error(`Invalid ${label} response.`)
  return value
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const AVATAR_VERIFY_TIMEOUT_MS = 15_000

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
  if (!Number.isFinite(image.naturalWidth) || !Number.isFinite(image.naturalHeight) || image.naturalWidth < 64 || image.naturalHeight < 64 || image.naturalWidth > 4096 || image.naturalHeight > 4096) {
    throw new Error('Avatar images must be between 64 and 4096 pixels wide and high.')
  }
  const aspectRatio = image.naturalWidth / image.naturalHeight
  if (aspectRatio < 0.5 || aspectRatio > 2) throw new Error('Avatar images must use a reasonable portrait or landscape ratio.')
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
    let response: Response | null = null
    let lastError: unknown = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), AVATAR_VERIFY_TIMEOUT_MS)
      try {
        response = await fetch(moderationUrl, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), signal: controller.signal })
        if (response.ok || response.status < 500) break
      } catch (reason) { lastError = reason }
      finally { window.clearTimeout(timer) }
      await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)))
    }
    if (!response) throw lastError instanceof Error ? lastError : new Error('Avatar verification timed out')
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
  // Keep only the object path in the profile. Avatars are private objects;
  // the shared Avatar component resolves a short-lived signed URL on demand.
  const profile = await updateProfile(userId, { avatar_url: path })
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
  const pattern = `%${normalized.replace(/[\\%_,]/g, '')}%`
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

export function subscribeToSocialUpdates(userId: string, onChange: () => void) {
  const client = requireClient()
  // A fresh topic is intentional. Supabase does not allow adding `.on()`
  // handlers after a channel has entered subscribe/joined state, and a fast
  // route remount can otherwise race the previous removeChannel call.
  const channel = client.channel(`social:${userId}:${crypto.randomUUID()}`)
  try {
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, (payload) => {
        const row = (payload.new ?? payload.old) as Partial<FriendRequest>
        if (row.sender_id === userId || row.receiver_id === userId) onChange()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, (payload) => {
        const row = (payload.new ?? payload.old) as Partial<Friendship>
        if (row.user_id === userId || row.friend_id === userId) onChange()
      })
    channel.subscribe()
  } catch (error) {
    logSocialError('social realtime setup', error)
  }
  return () => { void client.removeChannel(channel).catch((error) => logSocialError('social realtime cleanup', error)) }
}

export async function sendFriendRequest(receiverId: string, legacyReceiverId?: string) {
  // The first argument is retained temporarily for callers from older UI
  // bundles; it is never sent to Supabase or used for authorization.
  const recipientId = legacyReceiverId ?? receiverId
  const client = requireClient()
  const { data, error } = await client.rpc('send_friend_request', { p_receiver_id: recipientId })
  if (error) { console.error('[aquaSocialService] friend request failed:', error); throw new Error(error.message || SAFE_SOCIAL_ERROR) }
  const { data: session } = await client.auth.getSession()
  if (session.session?.user.id) invalidateSocialData(session.session.user.id)
  invalidateSocialData(recipientId)
  return requireId(data, 'friend request') as unknown as FriendRequest
}

export async function updateFriendRequest(requestId: string, status: 'accepted' | 'declined' | 'cancelled') {
  const client = requireClient()
  if (status === 'accepted') {
    const { data, error } = await client.rpc('accept_friend_request', { request_id: requestId })
    if (error) { console.error('[aquaSocialService] accept friend request failed:', error); throw new Error(error.message || SAFE_SOCIAL_ERROR) }
    socialCache.clear()
    return data
  }
  const { data, error } = await client.rpc('respond_friend_request', { request_id: requestId, next_status: status })
  if (error) { console.error('[aquaSocialService] update friend request failed:', error); throw new Error(error.message || SAFE_SOCIAL_ERROR) }
  socialCache.clear()
  return requireId(data, 'friend request') as unknown as FriendRequest
}

export async function removeFriend(userId: string, friendId: string) {
  const client = requireClient()
  const { error } = await client.rpc('remove_friend', { p_friend_id: friendId })
  if (error) throw new Error(error.message || SAFE_SOCIAL_ERROR)
  invalidateSocialData(userId)
  invalidateSocialData(friendId)
}

export async function getOrCreateDirectConversation(friendId: string) {
  const client = requireClient()
  const { data, error } = await client.rpc('get_or_create_direct_conversation', { p_friend_id: friendId })
  if (error) throw new Error(error.message || SAFE_SOCIAL_ERROR)
  return data as DirectConversation
}

export async function getDirectMessages(conversationId: string, limit = 100) {
  const client = requireClient()
  const { data, error } = await client.from('direct_messages').select('id, conversation_id, sender_id, body, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit)
  if (error) throw new Error(error.message || SAFE_SOCIAL_ERROR)
  return ((data ?? []) as DirectMessage[]).reverse()
}

export async function sendDirectMessage(conversationId: string, body: string) {
  const client = requireClient()
  const { data, error } = await client.rpc('send_direct_message', { p_conversation_id: conversationId, p_body: body.trim() })
  if (error) throw new Error(error.message || SAFE_SOCIAL_ERROR)
  return data as DirectMessage
}

export function directMessageTopic(userId: string, friendId: string) {
  return `dm:${[userId, friendId].sort().join(':')}`
}

export async function broadcastDirectMessage(userId: string, friendId: string, message: DirectMessage) {
  const client = requireClient()
  const channel = client.channel(`${directMessageTopic(userId, friendId)}:${crypto.randomUUID()}`, { config: { private: true } })
  try {
    await channel.subscribe()
    await channel.send({ type: 'broadcast', event: 'message', payload: message })
  } finally {
    await client.removeChannel(channel)
  }
}

export async function markDirectMessagesRead(conversationId: string) {
  const client = requireClient()
  const { error } = await client.rpc('mark_direct_messages_read', { p_conversation_id: conversationId })
  if (error) throw new Error(error.message || SAFE_SOCIAL_ERROR)
}

export async function getDirectUnreadCount(conversationId: string) {
  const client = requireClient()
  const { data, error } = await client.rpc('get_direct_unread_count', { p_conversation_id: conversationId })
  if (error) throw new Error(error.message || SAFE_SOCIAL_ERROR)
  return Number(data ?? 0)
}

export function subscribeToDirectConversation(userId: string, friendId: string, onMessage: (message: DirectMessage) => void, onStatus?: (status: string) => void) {
  const client = requireClient()
  const channel = client.channel(`${directMessageTopic(userId, friendId)}:${crypto.randomUUID()}`, { config: { private: true, presence: { key: userId } } })
  try {
    channel.on('broadcast', { event: 'message' }, ({ payload }) => onMessage(payload as DirectMessage))
    channel.subscribe((status) => {
      onStatus?.(status)
      if (status === 'SUBSCRIBED') void channel.track({ online_at: new Date().toISOString() })
    })
  } catch (error) {
    logSocialError('direct realtime setup', error)
    onStatus?.('CHANNEL_ERROR')
  }
  return () => { void client.removeChannel(channel).catch((error) => logSocialError('direct realtime cleanup', error)) }
}
