-- Final hardening for the social graph and private avatar storage.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/webp']::text[])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar objects are publicly readable" on storage.objects;
drop policy if exists "Avatar objects readable by public" on storage.objects;
drop policy if exists "Authenticated users can read avatars" on storage.objects;
create policy "Authenticated users can read avatars"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = split_part(name, '/', 1)
    and name ~ '^[0-9a-fA-F-]{36}/avatar\\.webp$'
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = split_part(name, '/', 1))
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = split_part(name, '/', 1)
    and name ~ '^[0-9a-fA-F-]{36}/avatar\\.webp$'
  );

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = split_part(name, '/', 1));

-- Keep RPCs callable only by signed-in users. SECURITY DEFINER is required
-- for the atomic writes because the base tables intentionally deny direct
-- client inserts/updates, so each function has an explicit safe search_path.
revoke execute on function public.send_friend_request(uuid) from public, anon;
revoke execute on function public.accept_friend_request(uuid) from public, anon;
revoke execute on function public.respond_friend_request(uuid, text) from public, anon;
revoke execute on function public.remove_friend(uuid) from public, anon;
revoke execute on function public.get_or_create_direct_conversation(uuid) from public, anon;
revoke execute on function public.send_direct_message(uuid, text) from public, anon;
revoke execute on function public.mark_direct_messages_read(uuid) from public, anon;
revoke execute on function public.get_direct_unread_count(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, text) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
grant execute on function public.send_direct_message(uuid, text) to authenticated;
grant execute on function public.mark_direct_messages_read(uuid) to authenticated;
grant execute on function public.get_direct_unread_count(uuid) to authenticated;

create or replace function public.send_friend_request(p_receiver_id uuid)
returns public.friend_requests
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare result public.friend_requests;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_receiver_id is null or p_receiver_id = auth.uid() then raise exception 'Invalid friend request recipient'; end if;
  if not exists (select 1 from public.profiles where id = p_receiver_id) then raise exception 'Profile not found'; end if;
  if exists (select 1 from public.friendships where least(user_id, friend_id) = least(auth.uid(), p_receiver_id) and greatest(user_id, friend_id) = greatest(auth.uid(), p_receiver_id)) then raise exception 'You are already friends'; end if;
  if exists (select 1 from public.friend_requests where status = 'pending' and least(sender_id, receiver_id) = least(auth.uid(), p_receiver_id) and greatest(sender_id, receiver_id) = greatest(auth.uid(), p_receiver_id)) then raise exception 'A pending request already exists'; end if;
  if exists (select 1 from public.account_settings where user_id = p_receiver_id and allow_friend_requests = false) then raise exception 'This user is not accepting friend requests'; end if;
  insert into public.friend_requests(sender_id, receiver_id, status) values (auth.uid(), p_receiver_id, 'pending') returning * into result;
  return result;
end;
$$;
