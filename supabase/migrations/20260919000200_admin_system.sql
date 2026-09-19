create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.system_status (
  id boolean primary key default true check (id),
  maintenance boolean not null default false,
  maintenance_message text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id)
);
insert into public.system_status (id) values (true) on conflict (id) do nothing;

alter table public.admin_users enable row level security;
alter table public.system_status enable row level security;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = pg_catalog, public, private
as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()) $$;

create or replace function public.get_system_status()
returns public.system_status language sql stable security definer set search_path = pg_catalog, public, private
as $$ select * from public.system_status where id = true $$;

create or replace function public.set_maintenance(p_enabled boolean, p_message text default '')
returns public.system_status language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare result public.system_status;
begin
  if not private.is_admin() then raise exception 'Admin authorization required'; end if;
  update public.system_status set maintenance = p_enabled,
    maintenance_message = case when p_enabled then left(coalesce(p_message, ''), 500) else '' end,
    updated_at = timezone('utc', now()), updated_by = auth.uid()
    where id = true returning * into result;
  return result;
end;
$$;

grant execute on function public.get_system_status() to anon, authenticated;
grant execute on function public.set_maintenance(boolean, text) to authenticated;
revoke all on table public.admin_users, public.system_status from anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;

grant execute on function private.bind_verified_minecraft_identity(uuid) to authenticated;

create or replace function public.bind_verified_minecraft_identity(p_minecraft_uuid uuid)
returns public.verified_minecraft_identities
language sql security definer set search_path = pg_catalog, public, private
as $$ select private.bind_verified_minecraft_identity(p_minecraft_uuid) $$;
grant execute on function public.bind_verified_minecraft_identity(uuid) to authenticated;

create or replace function public.is_current_user_admin()
returns boolean language sql stable security definer set search_path = pg_catalog, public, private
as $$ select private.is_admin() $$;
grant execute on function public.is_current_user_admin() to authenticated;
