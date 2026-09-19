alter table public.admin_users
  add column if not exists enabled boolean not null default true,
  add column if not exists minecraft_uuid uuid;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.admin_users admin
    where admin.user_id = auth.uid()
      and admin.enabled
      and (
        admin.minecraft_uuid is null
        or exists (
          select 1
          from public.verified_minecraft_identities identity_link
          where identity_link.user_id = auth.uid()
            and identity_link.minecraft_uuid = admin.minecraft_uuid
        )
      )
  )
$$;

revoke all on function private.is_admin() from public, anon, authenticated;
