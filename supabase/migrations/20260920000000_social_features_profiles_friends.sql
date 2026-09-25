-- Social features: profiles, friend requests, friendships, account settings
-- Comprehensive user identity and social networking system

-- ============================================================================
-- Table: profiles
-- ============================================================================
-- User-visible profile information linked to auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (length(username) >= 3 and length(username) <= 24 and username ~ '^[a-zA-Z0-9_-]+$'),
  display_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.profiles is
  'User profile information: username, display name, avatar. Linked to auth.users.';
comment on column public.profiles.username is
  'Unique username 3-24 chars: letters, numbers, underscores, hyphens only';
comment on column public.profiles.display_name is
  'Optional display name, can be any unicode string';
comment on column public.profiles.avatar_url is
  'URL to user avatar (512x512 WebP), stored in avatars bucket';

create index idx_profiles_username on public.profiles (username);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy "Profiles are publicly readable"
  on public.profiles
  for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================================
-- Table: account_settings
-- ============================================================================
-- User-level privacy and visibility settings
create table if not exists public.account_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  show_online_status boolean not null default true,
  show_playing_status boolean not null default true,
  allow_friend_requests boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.account_settings is
  'User privacy and visibility preferences for social features.';
comment on column public.account_settings.show_online_status is
  'Whether friends can see when user is online';
comment on column public.account_settings.show_playing_status is
  'Whether friends can see what game user is playing';
comment on column public.account_settings.allow_friend_requests is
  'Whether user can receive friend requests from other users';

alter table public.account_settings enable row level security;
alter table public.account_settings force row level security;

create policy "Users can read their own settings"
  on public.account_settings
  for select
  using (auth.uid() = user_id);

create policy "Users can update their own settings"
  on public.account_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- Table: friend_requests
-- ============================================================================
-- Pending friend requests between users
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint friend_request_no_self check (sender_id != receiver_id)
);

comment on table public.friend_requests is
  'Pending, declined, cancelled, and historical accepted friend requests between users.';
comment on column public.friend_requests.status is
  'Request status: pending, accepted (kept for history), declined, or cancelled';

create index idx_friend_requests_sender on public.friend_requests (sender_id);
create index idx_friend_requests_receiver on public.friend_requests (receiver_id);
create index idx_friend_requests_status on public.friend_requests (status);
create index idx_friend_requests_receiver_status on public.friend_requests (receiver_id, status);

alter table public.friend_requests enable row level security;
alter table public.friend_requests force row level security;

create policy "Outgoing requests visible to sender"
  on public.friend_requests
  for select
  using (auth.uid() = sender_id);

create policy "Incoming requests visible to receiver"
  on public.friend_requests
  for select
  using (auth.uid() = receiver_id);

create policy "Users can create friend requests (authenticated only)"
  on public.friend_requests
  for insert
  with check (auth.uid() = sender_id);

create policy "Senders can cancel requests"
  on public.friend_requests
  for update
  using (auth.uid() = sender_id and status = 'pending')
  with check (status = 'cancelled');

create policy "Receivers can decline requests"
  on public.friend_requests
  for update
  using (auth.uid() = receiver_id and status = 'pending')
  with check (status = 'declined');

-- ============================================================================
-- Table: friendships
-- ============================================================================
-- Established friendships between users (bidirectional, stored once)
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint friendship_no_self check (user_id != friend_id)
);

comment on table public.friendships is
  'Established friendships. Stored once per pair; order by (lesser_id, greater_id).';

create index idx_friendships_user on public.friendships (user_id);
create index idx_friendships_friend on public.friendships (friend_id);
create unique index if not exists friendships_canonical_pair_idx
  on public.friendships (least(user_id, friend_id), greatest(user_id, friend_id));

alter table public.friendships enable row level security;
alter table public.friendships force row level security;

create policy "Users can see their friendships"
  on public.friendships
  for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Only accept_friend_request RPC can insert"
  on public.friendships
  for insert
  with check (false);

-- Deletion allowed only through RPC or admin
create policy "Friended users can delete their friendship"
  on public.friendships
  for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- ============================================================================
-- RPC Function: is_username_available
-- ============================================================================
-- Check if username is available for registration or change
create or replace function public.is_username_available(check_username text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_username text;
  found_count int;
begin
  if not check_username ~ '^[a-zA-Z0-9_-]{3,24}$' then
    return false;
  end if;

  normalized_username := lower(trim(check_username));
  
  select count(*) into found_count
  from public.profiles
  where lower(username) = normalized_username;
  
  return found_count = 0;
end;
$$;

comment on function public.is_username_available(text) is
  'Check if a username is available for use. Returns true if available, false if taken or invalid.';

grant execute on function public.is_username_available(text) to anon, authenticated;

-- ============================================================================
-- RPC Function: accept_friend_request
-- ============================================================================
-- Atomically accept a friend request: create friendship, mark as accepted
create or replace function public.accept_friend_request(request_id uuid)
returns json
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sender_id uuid;
  v_receiver_id uuid;
  v_request_status text;
  v_result json;
begin
  -- Verify the request exists and user is the receiver
  select sender_id, receiver_id, status
  into v_sender_id, v_receiver_id, v_request_status
  from public.friend_requests
  where id = request_id
  for update;

  if v_sender_id is null then
    raise exception 'Friend request not found';
  end if;

  if v_receiver_id != auth.uid() then
    raise exception 'Only the receiver can accept a friend request';
  end if;

  if v_request_status != 'pending' then
    raise exception 'Can only accept pending friend requests (current status: %)', v_request_status;
  end if;

  -- Create friendship (both directions handled by unique constraint on sorted pair)
  insert into public.friendships (user_id, friend_id)
  values (least(v_sender_id, v_receiver_id), greatest(v_sender_id, v_receiver_id))
  on conflict do nothing;

  -- Mark request as accepted
  update public.friend_requests
  set status = 'accepted', updated_at = timezone('utc', now())
  where id = request_id;

  -- Return success response
  select json_build_object(
    'success', true,
    'friendship_id', (select id from public.friendships where user_id = v_sender_id and friend_id = v_receiver_id)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.accept_friend_request(uuid) is
  'Accept a friend request atomically: create friendship and mark request as accepted. Only receiver can accept.';

grant execute on function public.accept_friend_request(uuid) to authenticated;

-- ============================================================================
-- Trigger: Ensure profile exists when user signs up
-- ============================================================================
-- When a user registers with auth.users, ensure a profile row is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'username', 'user_' || replace(new.id::text, '-', '')), 24),
    nullif(new.raw_user_meta_data->>'display_name', '')
  )
  on conflict (id) do nothing;

  insert into public.account_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Automatically create profile and account_settings when a new user registers.';

-- Create trigger if it doesn't exist
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Trigger: Update updated_at timestamps
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger function to update updated_at column to current timestamp.';

-- Apply updated_at trigger to tables that need it
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists friend_requests_updated_at on public.friend_requests;
create trigger friend_requests_updated_at
  before update on public.friend_requests
  for each row execute function public.set_updated_at();

drop trigger if exists account_settings_updated_at on public.account_settings;
create trigger account_settings_updated_at
  before update on public.account_settings
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Verify tables were created
-- ============================================================================
-- The following should all exist and be empty now:
-- select count(*) from public.profiles;
-- select count(*) from public.friend_requests;
-- select count(*) from public.friendships;
-- select count(*) from public.account_settings;
