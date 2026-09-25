-- Keep social operations compatible with deployments that created friendships
-- before the id column was introduced. The user pair is the stable identity.
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
begin
  select sender_id, receiver_id, status into v_sender_id, v_receiver_id, v_request_status
  from public.friend_requests where id = request_id for update;
  if v_sender_id is null then raise exception 'Friend request not found'; end if;
  if v_receiver_id != auth.uid() then raise exception 'Only the receiver can accept a friend request'; end if;
  if v_request_status != 'pending' then raise exception 'Can only accept pending friend requests'; end if;

  insert into public.friendships (user_id, friend_id)
  values (v_sender_id, v_receiver_id)
  on conflict do nothing;
  update public.friend_requests set status = 'accepted', updated_at = timezone('utc', now()) where id = request_id;
  return json_build_object('success', true, 'user_id', v_sender_id, 'friend_id', v_receiver_id);
end;
$$;
