create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 80),
  locale text not null default 'it-IT',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  slug text not null unique check (char_length(slug) between 3 and 100),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('athlete', 'coach')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  role text not null check (role in ('athlete', 'coach')),
  token_hash bytea not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((accepted_at is null and accepted_by is null) or (accepted_at is not null and accepted_by is not null))
);

create index workspaces_owner_user_id_idx on public.workspaces (owner_user_id);
create index workspace_members_user_status_idx on public.workspace_members (user_id, status);
create index workspace_invitations_workspace_id_idx on public.workspace_invitations (workspace_id);
create index workspace_invitations_open_email_idx on public.workspace_invitations (workspace_id, email, expires_at) where accepted_at is null;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function private.set_updated_at();

create trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row execute function private.set_updated_at();

create or replace function public.complete_onboarding(
  p_display_name text,
  p_role text,
  p_workspace_name text default null,
  p_invitation_token text default null
)
returns table (
  workspace_id uuid,
  workspace_name text,
  member_role text,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_email text;
  v_workspace_id uuid;
  v_workspace_name text;
  v_member_role text;
  v_completed_at timestamptz;
  v_invitation public.workspace_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_display_name, ''))) not between 2 and 80 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  select wm.workspace_id, w.name, wm.role, p.onboarding_completed_at
    into v_workspace_id, v_workspace_name, v_member_role, v_completed_at
  from public.profiles p
  join public.workspace_members wm on wm.user_id = p.user_id and wm.status = 'active'
  join public.workspaces w on w.id = wm.workspace_id
  where p.user_id = v_user_id and p.onboarding_completed_at is not null
  order by wm.created_at
  limit 1;

  if found then
    return query select v_workspace_id, v_workspace_name, v_member_role, v_completed_at;
    return;
  end if;

  insert into public.profiles (user_id, display_name)
  values (v_user_id, trim(p_display_name))
  on conflict (user_id) do update set display_name = excluded.display_name;

  if p_invitation_token is not null then
    select lower(email) into v_user_email from auth.users where id = v_user_id;

    select invitation.* into v_invitation
    from public.workspace_invitations invitation
    where invitation.token_hash = extensions.digest(convert_to(trim(p_invitation_token), 'UTF8'), 'sha256')
      and invitation.accepted_at is null
      and invitation.expires_at > now()
      and invitation.email = v_user_email
    for update;

    if not found then
      raise exception 'invalid_or_expired_invitation' using errcode = '22023';
    end if;

    v_workspace_id := v_invitation.workspace_id;
    v_member_role := v_invitation.role;

    insert into public.workspace_members (workspace_id, user_id, role, status)
    values (v_workspace_id, v_user_id, v_member_role, 'active')
    on conflict (workspace_id, user_id) do update
      set role = excluded.role, status = 'active';

    update public.workspace_invitations
      set accepted_at = now(), accepted_by = v_user_id
      where id = v_invitation.id;
  else
    if p_role not in ('athlete', 'coach') then
      raise exception 'invalid_role' using errcode = '22023';
    end if;
    if char_length(trim(coalesce(p_workspace_name, ''))) not between 2 and 80 then
      raise exception 'invalid_workspace_name' using errcode = '22023';
    end if;

    v_workspace_id := gen_random_uuid();
    v_member_role := p_role;
    insert into public.workspaces (id, name, slug, owner_user_id)
    values (
      v_workspace_id,
      trim(p_workspace_name),
      trim(both '-' from lower(regexp_replace(trim(p_workspace_name), '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || substring(replace(v_workspace_id::text, '-', '') from 1 for 8),
      v_user_id
    );
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, v_user_id, v_member_role);
  end if;

  update public.profiles
    set onboarding_completed_at = now()
    where user_id = v_user_id
    returning onboarding_completed_at into v_completed_at;

  select name into v_workspace_name from public.workspaces where id = v_workspace_id;
  return query select v_workspace_id, v_workspace_name, v_member_role, v_completed_at;
end;
$$;

revoke all on table public.profiles, public.workspaces, public.workspace_members, public.workspace_invitations from anon, authenticated;
grant select, update on table public.profiles to authenticated;
grant select on table public.workspaces, public.workspace_members to authenticated;

revoke all on function public.complete_onboarding(text, text, text, text) from public, anon;
grant execute on function public.complete_onboarding(text, text, text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;

create policy profiles_select_self
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy profiles_update_self
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy workspace_members_select_self
on public.workspace_members for select
to authenticated
using ((select auth.uid()) = user_id);

create policy workspaces_select_member
on public.workspaces for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

comment on function public.complete_onboarding(text, text, text, text) is
'Atomic and idempotent onboarding entry point. Authorization always derives from auth.uid(); invitation role derives from the stored invitation.';
