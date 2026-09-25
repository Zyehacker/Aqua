-- Harden the social graph and add private 1-to-1 conversations.
-- This migration is intentionally pair-based: one friendship row represents
-- both directions, so callers never need to know whether user_id is first.

create extension if not exists pgcrypto;

-- Some live installations were created before friend_requests.updated_at was
-- added. This must run before any RPC below references the column.
alter table public.friend_requests
  add column if not exists updated_at timestamptz not null default timezone('utc', now());
update public.friend_requests set updated_at = created_at where updated_at is null;
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;
drop trigger if exists friend_requests_updated_at on public.friend_requests;
create trigger friend_requests_updated_at
  before update on public.friend_requests
  for each row execute function public.set_updated_at();

-- There must be one pending request per unordered pair, regardless of which
-- user initiated it. Remove legacy duplicates before enforcing that contract.
delete from public.friend_requests a
using public.friend_requests b
where a.ctid > b.ctid
  and a.status = 'pending' and b.status = 'pending'
  and least(a.sender_id, a.receiver_id) = least(b.sender_id, b.receiver_id)
  and greatest(a.sender_id, a.receiver_id) = greatest(b.sender_id, b.receiver_id);
create unique index if not exists friend_requests_pending_pair_idx
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';

alter table public.friendships add column if not exists id uuid default gen_random_uuid();
update public.friendships set id = gen_random_uuid() where id is null;
alter table public.friendships alter column id set not null;

-- Older deployments sometimes contain both directions. Keep one canonical row.
delete from public.friendships a
using public.friendships b
where a.ctid > b.ctid
  and least(a.user_id, a.friend_id) = least(b.user_id, b.friend_id)
  and greatest(a.user_id, a.friend_id) = greatest(b.user_id, b.friend_id);
create unique index if not exists friendships_canonical_pair_idx
  on public.friendships (least(user_id, friend_id), greatest(user_id, friend_id));

create table if not exists public.social_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (blocker_id, blocked_id),
  constraint social_blocks_no_self check (blocker_id <> blocked_id)
);
alter table public.social_blocks enable row level security;
alter table public.social_blocks force row level security;
create policy social_blocks_owner_select on public.social_blocks for select using (auth.uid() = blocker_id);
create policy social_blocks_owner_insert on public.social_blocks for insert with check (auth.uid() = blocker_id);
create policy social_blocks_owner_delete on public.social_blocks for delete using (auth.uid() = blocker_id);

create or replace function public.social_pair_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.social_blocks where blocker_id = a and blocked_id = b)
      or exists (select 1 from public.social_blocks where blocker_id = b and blocked_id = a)
$$;

create or replace function public.send_friend_request(p_receiver_id uuid)
returns public.friend_requests language plpgsql security definer set search_path = pg_catalog, public as $$
declare result public.friend_requests;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_receiver_id is null or p_receiver_id = auth.uid() then raise exception 'Invalid friend request recipient'; end if;
  if not exists (select 1 from public.profiles where id = p_receiver_id) then raise exception 'Profile not found'; end if;
  if public.social_pair_blocked(auth.uid(), p_receiver_id) then raise exception 'Friend requests are unavailable for this user'; end if;
  if exists (select 1 from public.friendships where least(user_id, friend_id) = least(auth.uid(), p_receiver_id) and greatest(user_id, friend_id) = greatest(auth.uid(), p_receiver_id)) then raise exception 'You are already friends'; end if;
  if exists (select 1 from public.friend_requests where status = 'pending' and ((sender_id = auth.uid() and receiver_id = p_receiver_id) or (sender_id = p_receiver_id and receiver_id = auth.uid()))) then raise exception 'A pending request already exists'; end if;
  if exists (select 1 from public.account_settings where user_id = p_receiver_id and not allow_friend_requests) then raise exception 'This user is not accepting friend requests'; end if;
  insert into public.friend_requests(sender_id, receiver_id, status)
    values (auth.uid(), p_receiver_id, 'pending') returning * into result;
  return result;
end;
$$;
grant execute on function public.send_friend_request(uuid) to authenticated;

-- The first social migration shipped this signature with a json return type.
-- PostgreSQL cannot change a function return type via CREATE OR REPLACE, so
-- remove the legacy overload before installing the canonical composite result.
drop function if exists public.accept_friend_request(uuid);
create function public.accept_friend_request(request_id uuid)
returns public.friendships language plpgsql security definer set search_path = pg_catalog, public as $$
declare request public.friend_requests; result public.friendships;
begin
  select * into request from public.friend_requests where id = request_id for update;
  if request.id is null or request.receiver_id <> auth.uid() then raise exception 'Friend request not found'; end if;
  if request.status <> 'pending' then raise exception 'This request is no longer pending'; end if;
  if public.social_pair_blocked(request.sender_id, request.receiver_id) then raise exception 'This friendship is unavailable'; end if;
  insert into public.friendships(user_id, friend_id)
    values (least(request.sender_id, request.receiver_id), greatest(request.sender_id, request.receiver_id))
    on conflict do nothing
    returning * into result;
  if result.id is null then
    select * into result
    from public.friendships
    where least(user_id, friend_id) = least(request.sender_id, request.receiver_id)
      and greatest(user_id, friend_id) = greatest(request.sender_id, request.receiver_id)
    limit 1;
  end if;
  update public.friend_requests set status = 'accepted', updated_at = timezone('utc', now()) where id = request.id;
  return result;
end;
$$;
grant execute on function public.accept_friend_request(uuid) to authenticated;

create or replace function public.respond_friend_request(request_id uuid, next_status text)
returns public.friend_requests language plpgsql security definer set search_path = pg_catalog, public as $$
declare result public.friend_requests;
begin
  if next_status not in ('declined', 'cancelled') then raise exception 'Invalid request status'; end if;
  update public.friend_requests set status = next_status, updated_at = timezone('utc', now())
    where id = request_id and status = 'pending'
      and ((next_status = 'declined' and receiver_id = auth.uid()) or (next_status = 'cancelled' and sender_id = auth.uid()))
    returning * into result;
  if result.id is null then raise exception 'Friend request is stale or unauthorized'; end if;
  return result;
end;
$$;
grant execute on function public.respond_friend_request(uuid, text) to authenticated;

create or replace function public.remove_friend(p_friend_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  delete from public.friendships where least(user_id, friend_id) = least(auth.uid(), p_friend_id) and greatest(user_id, friend_id) = greatest(auth.uid(), p_friend_id);
  return found;
end;
$$;
grant execute on function public.remove_friend(uuid) to authenticated;

-- Direct client writes would allow trusting forged sender/conversation ids.
drop policy if exists "Users can create friend requests (authenticated only)" on public.friend_requests;
create policy friend_requests_insert_via_rpc on public.friend_requests for insert with check (false);
drop policy if exists "Senders can cancel requests" on public.friend_requests;
drop policy if exists "Receivers can decline requests" on public.friend_requests;
create policy friend_requests_update_via_rpc on public.friend_requests for update using (false) with check (false);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  unique (id)
);
create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default timezone('utc', now()),
  primary key (conversation_id, user_id)
);
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists direct_messages_conversation_created_idx on public.direct_messages(conversation_id, created_at desc);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.direct_messages enable row level security;
alter table public.conversations force row level security;
alter table public.conversation_participants force row level security;
alter table public.direct_messages force row level security;

create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.conversation_participants cp
    join public.conversation_participants other on other.conversation_id = cp.conversation_id and other.user_id <> cp.user_id
    join public.friendships f on least(f.user_id, f.friend_id) = least(cp.user_id, other.user_id) and greatest(f.user_id, f.friend_id) = greatest(cp.user_id, other.user_id)
    where cp.conversation_id = p_conversation_id and cp.user_id = auth.uid()
      and not public.social_pair_blocked(cp.user_id, other.user_id)
  )
$$;

create policy conversations_participant_select on public.conversations for select using (public.can_access_conversation(id));
create policy participants_self_select on public.conversation_participants for select using (user_id = auth.uid() and public.can_access_conversation(conversation_id));
create policy messages_participant_select on public.direct_messages for select using (public.can_access_conversation(conversation_id));
create policy messages_no_direct_insert on public.direct_messages for insert with check (false);

create or replace function public.get_or_create_direct_conversation(p_friend_id uuid)
returns public.conversations language plpgsql security definer set search_path = pg_catalog, public as $$
declare existing public.conversations; result public.conversations;
begin
  if auth.uid() is null or p_friend_id is null or p_friend_id = auth.uid() then raise exception 'Invalid conversation participant'; end if;
  if not exists (select 1 from public.friendships where least(user_id, friend_id) = least(auth.uid(), p_friend_id) and greatest(user_id, friend_id) = greatest(auth.uid(), p_friend_id)) then raise exception 'Only friends can use direct messages'; end if;
  if public.social_pair_blocked(auth.uid(), p_friend_id) then raise exception 'This conversation is unavailable'; end if;
  select c.* into existing from public.conversations c join public.conversation_participants a on a.conversation_id = c.id join public.conversation_participants b on b.conversation_id = c.id where a.user_id = auth.uid() and b.user_id = p_friend_id limit 1;
  if existing.id is not null then return existing; end if;
  insert into public.conversations default values returning * into result;
  insert into public.conversation_participants values (result.id, auth.uid()), (result.id, p_friend_id);
  return result;
end;
$$;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

create or replace function public.send_direct_message(p_conversation_id uuid, p_body text)
returns public.direct_messages language plpgsql security definer set search_path = pg_catalog, public as $$
declare result public.direct_messages;
begin
  if not public.can_access_conversation(p_conversation_id) then raise exception 'Conversation access revoked'; end if;
  insert into public.direct_messages(conversation_id, sender_id, body) values (p_conversation_id, auth.uid(), trim(p_body)) returning * into result;
  return result;
end;
$$;
grant execute on function public.send_direct_message(uuid, text) to authenticated;

create or replace function public.mark_direct_messages_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not public.can_access_conversation(p_conversation_id) then raise exception 'Conversation access revoked'; end if;
  update public.conversation_participants set last_read_at = timezone('utc', now()) where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;
grant execute on function public.mark_direct_messages_read(uuid) to authenticated;

create or replace function public.get_direct_unread_count(p_conversation_id uuid)
returns bigint language sql stable security definer set search_path = pg_catalog, public as $$
  select count(*) from public.direct_messages m
  join public.conversation_participants cp on cp.conversation_id = m.conversation_id and cp.user_id = auth.uid()
  where m.conversation_id = p_conversation_id
    and m.sender_id <> auth.uid()
    and (cp.last_read_at is null or m.created_at > cp.last_read_at)
    and public.can_access_conversation(p_conversation_id)
$$;
grant execute on function public.get_direct_unread_count(uuid) to authenticated;

-- Realtime private-channel authorization. Clients use only the deterministic
-- pair topic dm:<least-user-id>:<greatest-user-id>; the topic is never trusted
-- without checking the authenticated user and the current friendship.
create or replace function public.can_access_dm_topic(p_topic text)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select p_topic ~ '^dm:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}$'
    and auth.uid() in (split_part(p_topic, ':', 2)::uuid, split_part(p_topic, ':', 3)::uuid)
    and split_part(p_topic, ':', 2)::uuid < split_part(p_topic, ':', 3)::uuid
    and exists (
      select 1 from public.friendships f
      where least(f.user_id, f.friend_id) = split_part(p_topic, ':', 2)::uuid
        and greatest(f.user_id, f.friend_id) = split_part(p_topic, ':', 3)::uuid
    )
$$;

drop policy if exists conversation_broadcast_read on realtime.messages;
drop policy if exists conversation_broadcast_send on realtime.messages;
create policy direct_message_broadcast_read on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'broadcast' and public.can_access_dm_topic(realtime.topic())
);
create policy direct_message_broadcast_send on realtime.messages for insert to authenticated with check (
  realtime.messages.extension = 'broadcast' and public.can_access_dm_topic(realtime.topic())
);

-- New auth users need a valid searchable profile even when metadata is absent.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare generated_username text := 'user_' || replace(new.id::text, '-', '');
begin
  insert into public.profiles(id, username, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'username', generated_username), 24), nullif(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  insert into public.account_settings(user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
