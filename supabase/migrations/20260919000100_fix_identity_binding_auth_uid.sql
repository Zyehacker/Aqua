-- Correct an earlier contract that accepted user_id and relied on service_role.
drop function if exists private.bind_verified_minecraft_identity(uuid, uuid);

create or replace function private.bind_verified_minecraft_identity(
  p_minecraft_uuid uuid
)
returns public.verified_minecraft_identities
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  authenticated_user_id uuid := auth.uid();
begin
  if authenticated_user_id is null or p_minecraft_uuid is null then
    raise exception 'Verified identity requires an authenticated user and Minecraft UUID';
  end if;

  insert into public.verified_minecraft_identities (user_id, minecraft_uuid)
  values (authenticated_user_id, p_minecraft_uuid)
  on conflict (user_id) do update
    set minecraft_uuid = excluded.minecraft_uuid,
        verified_at = timezone('utc', now()),
        verification_method = 'trusted_server',
        updated_at = timezone('utc', now());

  return (select link from public.verified_minecraft_identities link where link.user_id = authenticated_user_id);
end;
$$;

revoke all on function private.bind_verified_minecraft_identity(uuid)
  from public, anon, authenticated, service_role;