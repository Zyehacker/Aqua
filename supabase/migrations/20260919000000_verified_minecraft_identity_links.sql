-- Secure identity-link contract for the future trusted Minecraft verifier.
-- The verifier must authenticate the request, verify the Minecraft identity with
-- Minecraft Services, and derive the Supabase user ID from that request.

create table if not exists public.verified_minecraft_identities (
  user_id uuid primary key references auth.users (id) on delete cascade,
  minecraft_uuid uuid not null unique,
  verified_at timestamptz not null default timezone('utc', now()),
  verification_method text not null default 'trusted_server'
    check (verification_method = 'trusted_server'),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.verified_minecraft_identities is
  'Server-written link between an authenticated Supabase user and a Minecraft UUID verified by a trusted backend.';
comment on column public.verified_minecraft_identities.user_id is
  'The authenticated Supabase auth.users ID determined by the trusted verifier.';
comment on column public.verified_minecraft_identities.minecraft_uuid is
  'The Minecraft UUID returned by a trusted Minecraft authentication/profile verification flow.';

alter table public.verified_minecraft_identities enable row level security;
alter table public.verified_minecraft_identities force row level security;

-- No client role can read or write identity links. Admin authorization remains
-- the separate admin_users/private.is_admin decision, not UUID possession alone.
revoke all on table public.verified_minecraft_identities from public, anon, authenticated;

-- Contract for a future trusted server/Edge Function. It is intentionally not
-- executable by client roles. The authenticated request supplies auth.uid();
-- only the independently verified Minecraft UUID is an argument.
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
  from public, anon, authenticated;
-- Execution remains ungranted until the trusted verifier is deployed with a
-- request context that preserves the authenticated user's JWT claims.
