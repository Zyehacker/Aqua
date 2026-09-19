import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ImagePlus, LoaderCircle, Search, UserPlus, UserRound, UserX, X } from 'lucide-react'
import { motion } from 'framer-motion'
import Button from '../../components/ui/Button'
import { useAquaAuth } from '../../hooks/useAquaAuthHook'
import { appActions } from '../../stores/appStore'
import { getFriendRequests, getFriendships, logSocialError, removeFriend, searchProfiles, sendFriendRequest, updateFriendRequest, uploadAquaAvatar, type AccountSettings, type AquaProfile, type FriendRequest, type Friendship } from '../../services/aquaSocialService'
import { useMaintenance } from '../../hooks/useMaintenanceHook'
import { formatProfileError } from '../../utils/profileError'

function ProfileAvatar({ profile, size = 'normal' }: { profile: AquaProfile; size?: 'normal' | 'large' }) {
  const fallback = (profile.display_name || profile.username || 'A').slice(0, 1).toUpperCase()
  const [broken, setBroken] = useState(false)
  return profile.avatar_url && !broken ? <img className={`socials-avatar socials-avatar--${size}`} src={profile.avatar_url} alt="" width={size === 'large' ? 44 : 30} height={size === 'large' ? 44 : 30} onError={() => setBroken(true)} /> : <span className={`socials-avatar socials-avatar--${size}`}>{fallback}</span>
}

function profileName(profile: AquaProfile | null | undefined) {
  return profile?.display_name || profile?.username || 'Aqua profile'
}

export default function SocialsPage() {
  const aqua = useAquaAuth()
  const maintenance = useMaintenance()
  const refreshAqua = aqua.refresh
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AquaProfile[]>([])
  const [friends, setFriends] = useState<Friendship[]>([])
  const [incoming, setIncoming] = useState<FriendRequest[]>([])
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [friendsError, setFriendsError] = useState<string | null>(null)
  const [requestsError, setRequestsError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarProgress, setAvatarProgress] = useState(0)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const loadSocialData = useCallback(async (userId: string) => {
    setLoading(true)
    const [friendsResult, requestsResult] = await Promise.allSettled([getFriendships(userId), getFriendRequests(userId)])
    if (friendsResult.status === 'fulfilled') { setFriends(friendsResult.value); setFriendsError(null) }
    else { const reason = friendsResult.reason; logSocialError('friends', reason); setFriendsError(reason instanceof Error ? reason.message : 'Unable to load friends.') }
    if (requestsResult.status === 'fulfilled') { setIncoming(requestsResult.value.incoming); setOutgoing(requestsResult.value.outgoing); setRequestsError(null) }
    else { const reason = requestsResult.reason; logSocialError('requests', reason); setRequestsError(reason instanceof Error ? reason.message : 'Unable to load requests.') }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(''); setResults([]); setFriends([]); setIncoming([]); setOutgoing([]); setAccountError(null); setFriendsError(null); setRequestsError(null); setSearchError(null); setActionError(null)
      void refreshAqua()
        .then((result) => {
          if (result.user?.id && result.profile) void loadSocialData(result.user.id)
        })
        .catch((reason) => { logSocialError('account restore', reason); setAccountError(reason instanceof Error ? reason.message : 'Unable to restore Aqua Account.') })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadSocialData, refreshAqua])

  useEffect(() => {
    const userId = aqua.user?.id
    if (!userId || !query.trim()) {
      const clearTimer = window.setTimeout(() => { setResults([]); setSearching(false) }, 0)
      return () => window.clearTimeout(clearTimer)
    }
    let cancelled = false
    const searchingTimer = window.setTimeout(() => setSearching(true), 0)
    const timer = window.setTimeout(() => {
      void searchProfiles(userId, query).then((next) => { if (!cancelled) { setResults(next); setSearchError(null) } }).catch((reason) => { logSocialError('profile search', reason); if (!cancelled) setSearchError(reason instanceof Error ? reason.message : 'Unable to search profiles.') }).finally(() => { if (!cancelled) setSearching(false) })
    }, 300)
    return () => { cancelled = true; window.clearTimeout(timer); window.clearTimeout(searchingTimer) }
  }, [aqua.user?.id, query])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEditName(aqua.profile?.username ?? '')
      setEditDisplayName(aqua.profile?.display_name ?? '')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [aqua.profile?.username, aqua.profile?.display_name])

  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.friend_id === aqua.user?.id ? friend.user_id : friend.friend_id)), [aqua.user?.id, friends])
  const outgoingIds = useMemo(() => new Set(outgoing.map((request) => request.receiver_id)), [outgoing])

  async function refreshSocial() {
    if (aqua.user) await loadSocialData(aqua.user.id)
  }

  async function runAction(key: string, action: () => Promise<void>) {
    if (maintenance.restricted) {
      setActionError(maintenance.status?.maintenance_message || 'Aqua online services are temporarily unavailable.')
      return
    }
    setBusy(key); setActionError(null)
    try { await action(); await refreshSocial() }
    catch (reason) { logSocialError(`action:${key}`, reason); setActionError(formatProfileError(reason)) }
    finally { setBusy(null) }
  }

  async function uploadAvatar(file: File) {
    if (!aqua.user) return
    setAvatarBusy(true); setAvatarProgress(0); setAvatarError(null)
    try {
      const profile = await uploadAquaAvatar(aqua.user.id, file, setAvatarProgress, setAvatarPreview)
      await aqua.refresh()
      setEditName(profile.username ?? '')
      setEditDisplayName(profile.display_name ?? '')
    } catch (reason) {
      logSocialError('avatar upload', reason)
      setAvatarPreview(null)
      setAvatarError(reason instanceof Error ? reason.message : 'Avatar upload failed.')
    } finally { setAvatarBusy(false) }
  }

  async function saveProfile() {
    if (!aqua.user) return
    await runAction('profile', async () => {
      const values: { display_name?: string } = {}
      if (editDisplayName.trim() !== (aqua.profile?.display_name ?? '')) values.display_name = editDisplayName.trim()
      if (Object.keys(values).length) await aqua.updateProfile(values)
    })
  }

  async function saveSetting(key: keyof Omit<AccountSettings, 'user_id'> | 'playing_status', value: boolean) {
    const serviceKey = key === 'playing_status' ? 'show_playing_status' : key
    await runAction(key, async () => { await aqua.updateAccountSettings({ [serviceKey]: value }) })
  }

  if (maintenance.restricted) return <div className="page socials-page"><section className="socials-shell socials-shell--state"><strong>Socials temporarily unavailable</strong><span>{maintenance.status?.maintenance_message || 'Aqua online services are temporarily unavailable.'}</span><span>Offline Minecraft profiles remain available.</span></section></div>
  if (aqua.loading) return <div className="page socials-page"><section className="socials-shell socials-shell--state"><LoaderCircle className="spin" size={20} /><strong>Loading Aqua Account</strong><span>Restoring your account and social settings.</span></section></div>
  if (!aqua.configured) return <div className="page socials-page"><section className="socials-shell socials-shell--state"><strong>Aqua Account unavailable</strong><span>Supabase is not configured for this build. The launcher remains available.</span></section></div>
  if (!aqua.isSignedIn) return (
    <motion.div className="page socials-page" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <section className="socials-shell socials-shell--state">
        <strong>Aqua Account required</strong>
        <span>Sign in to search profiles and manage friends.</span>
        <Button variant="aqua" onClick={() => appActions.toggleAccount()}>Open Aqua Account</Button>
      </section>
    </motion.div>
  )

  return (
    <div className="page socials-page">
      <div className="page-header">
        <div><p className="eyebrow">Community</p><h1 className="page-title">Socials</h1><p className="page-subtitle">Find friends and manage your Aqua profile.</p></div>
      </div>
      <section className="socials-shell socials-shell--real socials-page__workspace">
        {accountError || actionError ? <div className="state-banner state-banner--error" role="alert"><span>{accountError || actionError}</span><Button variant="ghost" size="sm" onClick={() => void refreshSocial()}>Retry</Button></div> : null}
        <label className="socials-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username or display name" aria-label="Search profiles" /></label>
        {query.trim() ? <div className="socials-search-results">{searching ? <p className="socials-muted"><LoaderCircle className="spin" size={14} /> Searching profiles</p> : searchError ? <p className="socials-muted socials-muted--error">{searchError}</p> : results.length ? results.map((profile) => <div className="socials-profile-row" key={profile.id}><ProfileAvatar profile={profile} /><div><strong>{profileName(profile)}</strong><span>@{profile.username || 'username unavailable'}</span></div>{friendIds.has(profile.id) ? <span className="chip chip-success"><Check size={12} /> Friends</span> : outgoingIds.has(profile.id) ? <span className="chip chip-muted">Request sent</span> : <Button variant="ghost" size="sm" disabled={busy === `request-${profile.id}`} onClick={() => void runAction(`request-${profile.id}`, async () => { await sendFriendRequest(aqua.user!.id, profile.id) })}>{busy === `request-${profile.id}` ? <LoaderCircle className="spin" size={13} /> : <UserPlus size={13} />}Add</Button>}</div>) : <p className="socials-muted">No profiles found.</p>}</div> : null}
        <div className="socials-columns">
          <div className="socials-column"><div className="socials-section-heading"><h2>Friends</h2><span>{friends.length}</span></div>{loading ? <p className="socials-muted"><LoaderCircle className="spin" size={14} /> Loading friends</p> : friendsError ? <p className="socials-muted socials-muted--error">{friendsError}</p> : friends.length ? friends.map((friend) => friend.friend ? <div className="socials-profile-row" key={friend.id}><ProfileAvatar profile={friend.friend} /><div><strong>{profileName(friend.friend)}</strong><span>@{friend.friend.username || 'username unavailable'}</span></div><Button variant="ghost" size="icon" aria-label={`Remove ${profileName(friend.friend)}`} disabled={busy === `remove-${friend.friend.id}`} onClick={() => void runAction(`remove-${friend.friend!.id}`, async () => { await removeFriend(aqua.user!.id, friend.friend!.id) })}>{busy === `remove-${friend.friend.id}` ? <LoaderCircle className="spin" size={13} /> : <UserX size={13} />}</Button></div> : null) : <p className="socials-muted">No friends yet. Search for an Aqua username to connect.</p>}</div>
          <div className="socials-column"><div className="socials-section-heading"><h2>Requests</h2><span>{incoming.length + outgoing.length}</span></div>{requestsError ? <p className="socials-muted socials-muted--error">{requestsError}</p> : <><h3>Incoming</h3>{incoming.length ? incoming.map((request) => <div className="socials-profile-row" key={request.id}><ProfileAvatar profile={request.sender!} /><div><strong>{profileName(request.sender)}</strong><span>@{request.sender?.username || 'username unavailable'}</span></div><Button variant="aqua" size="sm" disabled={busy === request.id} onClick={() => void runAction(request.id, async () => { await updateFriendRequest(request.id, 'accepted') })}>{busy === request.id ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}Accept</Button><Button variant="ghost" size="icon" aria-label="Decline request" disabled={busy === request.id} onClick={() => void runAction(request.id, async () => { await updateFriendRequest(request.id, 'declined') })}><X size={13} /></Button></div>) : <p className="socials-muted">No incoming requests.</p>}<h3>Outgoing</h3>{outgoing.length ? outgoing.map((request) => <div className="socials-profile-row" key={request.id}><ProfileAvatar profile={request.receiver!} /><div><strong>{profileName(request.receiver)}</strong><span>@{request.receiver?.username || 'username unavailable'}</span></div><Button variant="ghost" size="sm" disabled={busy === request.id} onClick={() => void runAction(request.id, async () => { await updateFriendRequest(request.id, 'cancelled') })}>{busy === request.id ? <LoaderCircle className="spin" size={13} /> : <X size={13} />}Cancel</Button></div>) : <p className="socials-muted">No outgoing requests.</p>}</>}</div>
        </div>
        <div className="socials-column socials-column--profile"><div className="socials-section-heading"><h2>Profile</h2><UserRound size={15} /></div><div className="socials-profile-summary">{avatarPreview ? <img className="socials-avatar socials-avatar--large" src={avatarPreview} alt="" width={44} height={44} /> : <ProfileAvatar profile={aqua.profile ?? { id: aqua.user!.id, username: null, display_name: null, avatar_url: null }} size="large" />}<div><strong>{profileName(aqua.profile)}</strong><span>@{aqua.profile?.username || 'username unavailable'}</span></div></div><div className="socials-profile-form"><label><span>Username</span><input value={editName} readOnly aria-readonly="true" /></label><label><span>Display name</span><input value={editDisplayName} onChange={(event) => setEditDisplayName(event.target.value)} /></label><div className="socials-avatar-upload"><label className="socials-upload-label"><ImagePlus size={14} /><span>{avatarBusy ? `Checking ${avatarProgress}%` : 'Avatar'}</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={avatarBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.currentTarget.value = '' }} /></label>{avatarBusy ? <progress value={avatarProgress} max="100" aria-label="Avatar upload progress" /> : null}{avatarError ? <p className="socials-muted socials-muted--error">{avatarError}</p> : null}</div><Button variant="ghost" size="sm" disabled={busy === 'profile'} onClick={() => void saveProfile()}>{busy === 'profile' ? <LoaderCircle className="spin" size={13} /> : null}Save profile</Button></div><div className="socials-settings"><div><strong>Privacy</strong><span>Control what friends can see.</span></div><label><span>Online status</span><input type="checkbox" checked={aqua.accountSettings?.show_online_status ?? true} onChange={(event) => void saveSetting('show_online_status', event.target.checked)} /></label><label><span>Playing status</span><input type="checkbox" checked={aqua.accountSettings?.show_playing_status ?? true} onChange={(event) => void saveSetting('playing_status', event.target.checked)} /></label><label><span>Allow friend requests</span><input type="checkbox" checked={aqua.accountSettings?.allow_friend_requests ?? true} onChange={(event) => void saveSetting('allow_friend_requests', event.target.checked)} /></label></div></div>
      </section>
    </div>
  )
}
