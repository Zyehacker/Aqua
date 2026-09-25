-- Repair for installations where friend_requests predates updated_at.
-- Safe to run after 20260922000200 as well as independently.
alter table public.friend_requests
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.friend_requests
set updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
where updated_at is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists friend_requests_updated_at on public.friend_requests;
create trigger friend_requests_updated_at
  before update on public.friend_requests
  for each row execute function public.set_updated_at();

-- Make the deployed table enforce one pending request for an unordered pair.
delete from public.friend_requests a
using public.friend_requests b
where a.ctid > b.ctid
  and a.status = 'pending' and b.status = 'pending'
  and least(a.sender_id, a.receiver_id) = least(b.sender_id, b.receiver_id)
  and greatest(a.sender_id, a.receiver_id) = greatest(b.sender_id, b.receiver_id);
create unique index if not exists friend_requests_pending_pair_idx
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';

-- Keep any existing acceptance trigger compatible with the canonical one-row
-- friendship model. The RPC and this trigger are both idempotent.
create or replace function public.create_friendship_on_accept()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status is distinct from 'accepted')) then
    insert into public.friendships(user_id, friend_id)
    values (least(new.sender_id, new.receiver_id), greatest(new.sender_id, new.receiver_id))
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists friend_request_create_friendship_on_accept on public.friend_requests;
create trigger friend_request_create_friendship_on_accept
  after insert or update of status on public.friend_requests
  for each row execute function public.create_friendship_on_accept();
