import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Check, LoaderCircle, MessageCircle, MoreHorizontal, Search, Send, UserPlus, X } from 'lucide-react'
import Button from '../../components/ui/Button'
import Avatar from '../../components/ui/Avatar'
import { useAquaAuth } from '../../hooks/useAquaAuthHook'
import { appActions } from '../../stores/appStore'
import { broadcastDirectMessage, getDirectMessages, getFriendRequests, getFriendships, getOrCreateDirectConversation, logSocialError, markDirectMessagesRead, removeFriend, searchProfiles, sendDirectMessage, sendFriendRequest, subscribeToDirectConversation, subscribeToSocialUpdates, updateFriendRequest, type AquaProfile, type DirectMessage, type FriendRequest, type Friendship } from '../../services/aquaSocialService'
import { useMaintenance } from '../../hooks/useMaintenanceHook'
import { formatProfileError } from '../../utils/profileError'
import { MOTION, socialsMotion, socialsWorkspaceMotion } from '../../lib/motion'
import { AnimatedDrawer, AnimatedList, AnimatedPresence, GlareHover, AnimatedTabs } from '../../components/motion'

function ProfileAvatar({ profile }: { profile: AquaProfile | null | undefined }) {
  return <Avatar src={profile?.avatar_url} label={profile?.display_name || profile?.username} className="socials-avatar" />
}

function profileName(profile: AquaProfile | null | undefined) {
  return profile?.display_name || profile?.username || 'Aqua profile'
}

function dedupeMessages(messages: DirectMessage[]) {
  return [...new Map(messages.map((message) => [message.id, message])).values()]
}

export default function SocialsPage() {
  const aqua = useAquaAuth()
  const maintenance = useMaintenance()
  const [tab, setTab] = useState<'friends' | 'requests'>('friends')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AquaProfile[]>([])
  const [friends, setFriends] = useState<Friendship[]>([])
  const [incoming, setIncoming] = useState<FriendRequest[]>([])
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [chatFriend, setChatFriend] = useState<Friendship | null>(null)
  const [chatId, setChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [draft, setDraft] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatStatus, setChatStatus] = useState<'offline' | 'reconnecting' | 'connected'>('offline')
  const [chatError, setChatError] = useState<string | null>(null)
  const [chatBusy, setChatBusy] = useState(false)
  const pendingSequence = useRef(0)
  const loadSequence = useRef(0)

  async function withTimeout<T>(promise: Promise<T>, label: string) {
    let timeoutId = 0
    const timeout = new Promise<T>((_, reject) => {
      // Socials must remain usable when Supabase or realtime is slow/unavailable.
      timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out. Please retry.`)), 4500)
    })
    try { return await Promise.race([promise, timeout]) }
    finally { window.clearTimeout(timeoutId) }
  }

  const loadSocialData = useCallback(async (userId: string) => {
    const sequence = ++loadSequence.current
    setLoading(true); setError(null)
    const [friendsResult, requestsResult] = await Promise.allSettled([
      withTimeout(getFriendships(userId), 'Friends request'),
      withTimeout(getFriendRequests(userId), 'Requests request'),
    ])
    if (sequence !== loadSequence.current) return
    const failures: unknown[] = []
    if (friendsResult.status === 'fulfilled') setFriends(friendsResult.value)
    else { logSocialError('friends', friendsResult.reason); failures.push(friendsResult.reason) }
    if (requestsResult.status === 'fulfilled') { setIncoming(requestsResult.value.incoming); setOutgoing(requestsResult.value.outgoing) }
    else { logSocialError('requests', requestsResult.reason); failures.push(requestsResult.reason) }
    setError(failures.length ? formatProfileError(failures[0]) : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!aqua.user?.id || !aqua.profile) return
    const userId = aqua.user.id
    const timer = window.setTimeout(() => void loadSocialData(userId), 0)
    const unsubscribe = subscribeToSocialUpdates(userId, () => void loadSocialData(userId))
    return () => { window.clearTimeout(timer); unsubscribe() }
  }, [aqua.profile, aqua.user, loadSocialData])

  useEffect(() => {
    if (!aqua.user?.id || !query.trim()) {
      const timer = window.setTimeout(() => { setResults([]); setSearching(false) }, 0)
      return () => window.clearTimeout(timer)
    }
    let cancelled = false
    const searchingTimer = window.setTimeout(() => setSearching(true), 0)
    const timer = window.setTimeout(() => {
      void searchProfiles(aqua.user!.id, query).then((value) => {
        if (!cancelled) { setResults(value); setSearchError(null) }
      }).catch((reason) => {
        if (!cancelled) setSearchError(reason instanceof Error ? reason.message : 'Unable to search profiles.')
      }).finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(searchingTimer); window.clearTimeout(timer) }
  }, [aqua.user, query])

  useEffect(() => {
    if (!chatFriend?.friend?.id || !aqua.user?.id) return
    let active = true
    let cleanup: (() => void) | undefined
    const resetTimer = window.setTimeout(() => { setChatLoading(true); setChatError(null); setChatStatus('reconnecting'); setChatId(null); setMessages([]) }, 0)
    void getOrCreateDirectConversation(chatFriend.friend.id).then(async (conversation) => {
      if (!active) return
      const history = await withTimeout(getDirectMessages(conversation.id), 'Conversation request')
      if (!active) return
      setChatId(conversation.id); setMessages(dedupeMessages(history)); await markDirectMessagesRead(conversation.id)
      cleanup = subscribeToDirectConversation(aqua.user!.id, chatFriend.friend!.id, (message) => {
        if (!active || message.sender_id === aqua.user!.id) return
        setMessages((current) => dedupeMessages([...current, message]))
        void markDirectMessagesRead(conversation.id)
      }, (status) => {
        if (active) setChatStatus(status === 'SUBSCRIBED' ? 'connected' : status === 'CHANNEL_ERROR' ? 'offline' : 'reconnecting')
      })
    }).catch((reason) => { if (active) { setChatError(formatProfileError(reason)); setChatStatus('offline') } })
      .finally(() => { if (active) setChatLoading(false) })
    return () => { active = false; window.clearTimeout(resetTimer); cleanup?.() }
  }, [aqua.user, chatFriend])

  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.user_id === aqua.user?.id ? friend.friend_id : friend.user_id)), [aqua.user?.id, friends])
  const outgoingIds = useMemo(() => new Set(outgoing.map((request) => request.receiver_id)), [outgoing])

  async function action(key: string, callback: () => Promise<void>) {
    if (maintenance.restricted) { setError(maintenance.status?.maintenance_message || 'Aqua online services are temporarily unavailable.'); return }
    setBusy(key); setActionError(null)
    try { await callback(); if (aqua.user?.id) await loadSocialData(aqua.user.id) }
    catch (reason) { logSocialError(key, reason); setActionError(formatProfileError(reason)) }
    finally { setBusy(null) }
  }

  async function sendMessage(retry?: DirectMessage) {
    if (!chatId || !aqua.user?.id || !chatFriend?.friend?.id || chatBusy) return
    const body = retry?.body || draft.trim()
    if (!body) return
    pendingSequence.current += 1
    const optimistic = retry || { id: `pending-${pendingSequence.current}`, conversation_id: chatId, sender_id: aqua.user.id, body, created_at: '', pending: true }
    setDraft(''); setChatBusy(true); setChatError(null)
    setMessages((current) => retry ? current.map((item) => item.id === retry.id ? { ...item, pending: true, failed: false } : item) : [...current, optimistic])
    try {
      const sent = await withTimeout(sendDirectMessage(chatId, body), 'Message request')
      setMessages((current) => dedupeMessages(current.map((item) => item.id === optimistic.id ? sent : item)))
      await broadcastDirectMessage(aqua.user.id, chatFriend.friend.id, sent)
    } catch (reason) {
      setMessages((current) => current.map((item) => item.id === optimistic.id ? { ...item, pending: false, failed: true } : item))
      setChatError(reason instanceof Error ? reason.message : 'Message failed. Retry from the bubble.')
    } finally { setChatBusy(false) }
  }

  if (maintenance.restricted || aqua.loading || !aqua.configured || !aqua.isSignedIn) {
    const title = maintenance.restricted ? 'Socials temporarily unavailable' : aqua.loading ? 'Loading Aqua Account' : !aqua.configured ? 'Aqua Account unavailable' : 'Aqua Account required'
    return <div className="page socials-page"><section className="socials-shell socials-shell--state"><strong>{title}</strong><span>{maintenance.status?.maintenance_message || (aqua.isSignedIn ? 'Restoring your social connection.' : 'Sign in to search profiles and manage friends.')}</span>{maintenance.restricted ? <span className="socials-muted">Minecraft, Microsoft accounts, offline profiles, and the rest of the launcher remain available.</span> : !aqua.isSignedIn ? <Button variant="aqua" onClick={() => appActions.toggleAccount()}>Open Aqua Account</Button> : null}</section></div>
  }

  const socialsConnected = aqua.isSignedIn && aqua.configured && !maintenance.restricted
  return <motion.div className="page socials-page" variants={socialsMotion} initial="initial" animate="enter" exit="exit">
    <div className="page-header"><div><p className="eyebrow">Community</p><h1 className="page-title">Socials</h1><p className="page-subtitle">Friends and private conversations.</p></div><div className="social-status-stack"><span className="social-account-state"><span />Aqua Account · {aqua.isSignedIn ? 'Connected' : 'Signed out'}</span><span className="social-service-state connected"><span />Aqua Network · {aqua.configured ? 'Connected' : 'Unavailable'}</span><span className={`social-service-state ${socialsConnected ? 'connected' : 'offline'}`}><span />Socials · {socialsConnected ? 'Connected' : 'Unavailable'}</span></div></div>
    <motion.section className="socials-shell socials-shell--real socials-page__workspace" variants={socialsWorkspaceMotion} initial="initial" animate="enter">
      <div className="socials-actions"><label className="socials-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search friends or username" aria-label="Search profiles" /></label><Button variant="aqua" size="sm" onClick={() => document.querySelector<HTMLInputElement>('.socials-search input')?.focus()}><UserPlus size={14} /> Add Friend</Button></div>
      <AnimatedPresence mode="sync">{query.trim() ? <motion.div className="socials-search-results" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={MOTION.micro}>{searching ? <p className="socials-muted"><LoaderCircle className="spin" size={14} /> Searching</p> : searchError ? <p className="socials-muted socials-muted--error">{searchError}</p> : results.length ? results.map((profile) => <div className="socials-profile-row" key={profile.id}><ProfileAvatar profile={profile} /><div><strong>{profileName(profile)}</strong><span>@{profile.username || 'username unavailable'}</span></div>{friendIds.has(profile.id) ? <span className="chip chip-success"><Check size={12} /> Friends</span> : outgoingIds.has(profile.id) ? <span className="chip chip-muted">Request sent</span> : <Button variant="ghost" size="sm" disabled={busy === `request-${profile.id}`} onClick={() => void action(`request-${profile.id}`, () => sendFriendRequest(aqua.user!.id, profile.id).then(() => undefined))}>{busy === `request-${profile.id}` ? <LoaderCircle className="spin" size={13} /> : <UserPlus size={13} />} Add</Button>}</div>) : <p className="socials-muted">No profiles found.</p>}</motion.div> : null}</AnimatedPresence>
      <AnimatedTabs activeKey={tab} className="socials-tabs"><button className={tab === 'friends' ? 'active' : ''} onClick={() => setTab('friends')} role="tab">Friends <span>{friends.length}</span></button><button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')} role="tab">Requests <span>{incoming.length + outgoing.length}</span></button></AnimatedTabs>
      {error && !query.trim() ? <div className="socials-inline-error"><span>{error}</span><Button variant="ghost" size="sm" onClick={() => aqua.user && void loadSocialData(aqua.user.id)}>Retry</Button></div> : null}
      {actionError ? <div className="socials-inline-error socials-inline-error--action" role="alert"><span>{actionError}</span><Button variant="ghost" size="sm" onClick={() => setActionError(null)}>Dismiss</Button></div> : null}
      {tab === 'friends' ? <AnimatedList className="socials-list">{loading ? <p className="socials-muted"><LoaderCircle className="spin" size={14} /> Loading friends</p> : friends.length ? friends.map((friend) => friend.friend ? <motion.div layout key={friend.id} className="socials-profile-row"><ProfileAvatar profile={friend.friend} /><div><strong>{profileName(friend.friend)}</strong><span>@{friend.friend.username || 'username unavailable'} · Offline</span></div><Button variant="ghost" size="sm" onClick={() => setChatFriend(friend)}><MessageCircle size={13} /> Message</Button><Button variant="ghost" size="icon" aria-label="Friend actions" disabled={busy === `remove-${friend.friend?.id}`} onClick={() => void action(`remove-${friend.friend?.id}`, () => removeFriend(aqua.user!.id, friend.friend!.id))}><MoreHorizontal size={15} /></Button></motion.div> : null) : <p className="socials-muted">No friends yet. Search for someone to connect.</p>}</AnimatedList> : <div className="socials-list"><h3>Incoming</h3><AnimatedList>{incoming.length ? incoming.map((request) => <motion.div layout key={request.id} className="socials-profile-row"><ProfileAvatar profile={request.sender} /><div><strong>{profileName(request.sender)}</strong><span>@{request.sender?.username || 'username unavailable'}</span></div><Button variant="aqua" size="sm" disabled={busy === request.id} onClick={() => void action(request.id, () => updateFriendRequest(request.id, 'accepted').then(() => undefined))}><Check size={13} /> Accept</Button><Button variant="ghost" size="icon" disabled={busy === request.id} onClick={() => void action(request.id, () => updateFriendRequest(request.id, 'declined').then(() => undefined))}><X size={14} /></Button></motion.div>) : <p className="socials-muted">No incoming requests.</p>}</AnimatedList><h3>Outgoing</h3><AnimatedList>{outgoing.length ? outgoing.map((request) => <motion.div layout key={request.id} className="socials-profile-row"><ProfileAvatar profile={request.receiver} /><div><strong>{profileName(request.receiver)}</strong><span>@{request.receiver?.username || 'username unavailable'}</span></div><Button variant="ghost" size="sm" disabled={busy === request.id} onClick={() => void action(request.id, () => updateFriendRequest(request.id, 'cancelled').then(() => undefined))}><X size={13} /> Cancel</Button></motion.div>) : <p className="socials-muted">No outgoing requests.</p>}</AnimatedList></div>}
    </motion.section>
    <AnimatedDrawer open={Boolean(chatFriend)} onClose={() => setChatFriend(null)} className="socials-chat-drawer">{chatFriend ? <><div className="socials-chat-head"><GlareHover className="socials-chat-avatar-glare"><ProfileAvatar profile={chatFriend.friend} /></GlareHover><div><strong>{profileName(chatFriend.friend)}</strong><span>{chatStatus === 'connected' ? 'Connected' : chatStatus}</span></div><Button variant="ghost" size="icon" aria-label="Close chat" onClick={() => setChatFriend(null)}><X size={16} /></Button></div><div className="socials-chat-messages">{chatLoading ? <p className="socials-muted"><LoaderCircle className="spin" size={14} /> Loading history</p> : messages.length ? messages.map((message) => <div key={message.id} className={`socials-chat-message${message.sender_id === aqua.user?.id ? ' is-self' : ''}${message.failed ? ' is-failed' : ''}`}><span>{message.body}</span><small>{message.failed ? <button type="button" onClick={() => void sendMessage(message)}>Failed · Retry</button> : message.pending ? 'Sending…' : new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>) : <p className="socials-muted">No messages yet. Say hello.</p>}</div>{chatError ? <p className="socials-muted socials-muted--error">{chatError}</p> : null}<form className="socials-chat-compose" onSubmit={(event) => { event.preventDefault(); void sendMessage() }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message your friend" maxLength={4000} disabled={!chatId || chatStatus === 'offline'} /><Button variant="aqua" size="icon" type="submit" disabled={!draft.trim() || chatBusy || !chatId}><Send size={14} /></Button></form></> : null}</AnimatedDrawer>
  </motion.div>
}


