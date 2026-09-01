-- Climbing Coach V2.6 - libreria test e prescrizioni individuali.
-- Da applicare dopo lo schema Supabase V2.4/V2.5.

create table if not exists public.test_library (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text,
  objective text,
  material text,
  instructions jsonb not null default '[]'::jsonb,
  metric_definitions jsonb not null default '[]'::jsonb,
  video_url text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.test_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  scheduled_date date,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'completed', 'archived')),
  coach_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.test_plan_items (
  id uuid primary key default gen_random_uuid(),
  test_plan_id uuid not null references public.test_plans(id) on delete cascade,
  test_library_id uuid not null references public.test_library(id),
  item_order integer not null,
  instructions_override jsonb,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (test_plan_id, item_order),
  unique (test_plan_id, test_library_id)
);

alter table public.test_sessions
  add column if not exists test_plan_id uuid references public.test_plans(id);

create unique index if not exists test_sessions_test_plan_unique
  on public.test_sessions(test_plan_id) where test_plan_id is not null;
create unique index if not exists test_library_active_name_unique
  on public.test_library(coach_id, lower(name)) where archived = false;
create index if not exists test_plan_items_test_library_idx
  on public.test_plan_items(test_library_id);
create index if not exists test_plans_athlete_idx on public.test_plans(athlete_id);
create index if not exists test_plans_coach_idx on public.test_plans(coach_id);

alter table public.test_library enable row level security;
alter table public.test_plans enable row level security;
alter table public.test_plan_items enable row level security;

revoke all on public.test_library, public.test_plans, public.test_plan_items from anon;
grant select, insert, update, delete
  on public.test_library, public.test_plans, public.test_plan_items to authenticated;

create policy test_library_select on public.test_library for select to authenticated
using (
  coach_id = (select auth.uid())
  or exists (
    select 1 from public.test_plan_items tpi
    join public.test_plans tp on tp.id = tpi.test_plan_id
    where tpi.test_library_id = test_library.id
      and tp.athlete_id = (select auth.uid())
      and tp.status in ('published', 'completed')
  )
);
create policy test_library_insert on public.test_library for insert to authenticated
with check (coach_id = (select auth.uid()) and private.current_user_is_coach());
create policy test_library_update on public.test_library for update to authenticated
using (coach_id = (select auth.uid()) and private.current_user_is_coach())
with check (coach_id = (select auth.uid()) and private.current_user_is_coach());
create policy test_library_delete on public.test_library for delete to authenticated
using (coach_id = (select auth.uid()) and private.current_user_is_coach());

create policy test_plans_select on public.test_plans for select to authenticated
using (
  (coach_id = (select auth.uid()) and private.is_coach_of(athlete_id))
  or (athlete_id = (select auth.uid()) and status in ('published', 'completed'))
);
create policy test_plans_insert on public.test_plans for insert to authenticated
with check (
  coach_id = (select auth.uid())
  and private.current_user_is_coach()
  and private.is_coach_of(athlete_id)
);
create policy test_plans_update on public.test_plans for update to authenticated
using (coach_id = (select auth.uid()) and private.is_coach_of(athlete_id))
with check (coach_id = (select auth.uid()) and private.is_coach_of(athlete_id));
create policy test_plans_delete on public.test_plans for delete to authenticated
using (coach_id = (select auth.uid()) and private.is_coach_of(athlete_id));

create policy test_plan_items_select on public.test_plan_items for select to authenticated
using (exists (
  select 1 from public.test_plans tp
  where tp.id = test_plan_items.test_plan_id
    and (
      (tp.coach_id = (select auth.uid()) and private.is_coach_of(tp.athlete_id))
      or (tp.athlete_id = (select auth.uid()) and tp.status in ('published', 'completed'))
    )
));
create policy test_plan_items_insert on public.test_plan_items for insert to authenticated
with check (exists (
  select 1 from public.test_plans tp
  where tp.id = test_plan_items.test_plan_id
    and tp.coach_id = (select auth.uid())
    and private.is_coach_of(tp.athlete_id)
));
create policy test_plan_items_update on public.test_plan_items for update to authenticated
using (exists (
  select 1 from public.test_plans tp
  where tp.id = test_plan_items.test_plan_id
    and tp.coach_id = (select auth.uid())
    and private.is_coach_of(tp.athlete_id)
))
with check (exists (
  select 1 from public.test_plans tp
  where tp.id = test_plan_items.test_plan_id
    and tp.coach_id = (select auth.uid())
    and private.is_coach_of(tp.athlete_id)
));
create policy test_plan_items_delete on public.test_plan_items for delete to authenticated
using (exists (
  select 1 from public.test_plans tp
  where tp.id = test_plan_items.test_plan_id
    and tp.coach_id = (select auth.uid())
    and private.is_coach_of(tp.athlete_id)
));

-- Video dimostrativi privati per la libreria test.
alter table public.test_library add column if not exists video_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'test-videos', 'test-videos', false, 209715200,
  array['video/mp4','video/webm','video/quicktime']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy test_videos_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'test-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.current_user_is_coach()
);

create policy test_videos_select on storage.objects for select to authenticated
using (
  bucket_id = 'test-videos'
  and (
    ((storage.foldername(name))[1] = (select auth.uid())::text and private.current_user_is_coach())
    or exists (
      select 1
      from public.test_library tl
      join public.test_plan_items tpi on tpi.test_library_id = tl.id
      join public.test_plans tp on tp.id = tpi.test_plan_id
      where tl.video_path = storage.objects.name
        and tp.athlete_id = (select auth.uid())
        and tp.status in ('published', 'completed')
    )
  )
);

create policy test_videos_update on storage.objects for update to authenticated
using (
  bucket_id = 'test-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.current_user_is_coach()
)
with check (
  bucket_id = 'test-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.current_user_is_coach()
);

create policy test_videos_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'test-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.current_user_is_coach()
);

-- V2.10 - inviti coach -> atleta con accettazione automatica al primo accesso.
create table if not exists public.athlete_invitations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  email text not null check (length(btrim(email)) between 3 and 320),
  email_normalized text generated always as (lower(btrim(email))) stored,
  athlete_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (coach_id, email_normalized)
);

create index if not exists athlete_invitations_email_idx
  on public.athlete_invitations(email_normalized, status);
create index if not exists athlete_invitations_athlete_idx
  on public.athlete_invitations(athlete_id) where athlete_id is not null;

alter table public.athlete_invitations enable row level security;
revoke all on public.athlete_invitations from anon, authenticated;
grant select, insert, delete on public.athlete_invitations to authenticated;
grant update (status, athlete_id, accepted_at) on public.athlete_invitations to authenticated;

drop policy if exists athlete_invitations_select_related on public.athlete_invitations;
create policy athlete_invitations_select_related
on public.athlete_invitations for select to authenticated
using (
  coach_id = (select auth.uid())
  or email_normalized = lower(coalesce((select auth.jwt())->>'email', ''))
);

drop policy if exists athlete_invitations_insert_coach on public.athlete_invitations;
create policy athlete_invitations_insert_coach
on public.athlete_invitations for insert to authenticated
with check (coach_id = (select auth.uid()) and private.current_user_is_coach());

drop policy if exists athlete_invitations_update_related on public.athlete_invitations;
create policy athlete_invitations_update_related
on public.athlete_invitations for update to authenticated
using (
  (coach_id = (select auth.uid()) and private.current_user_is_coach())
  or (
    status = 'pending'
    and email_normalized = lower(coalesce((select auth.jwt())->>'email', ''))
  )
)
with check (
  (coach_id = (select auth.uid()) and private.current_user_is_coach())
  or (
    status = 'accepted'
    and athlete_id = (select auth.uid())
    and email_normalized = lower(coalesce((select auth.jwt())->>'email', ''))
  )
);

drop policy if exists athlete_invitations_delete_coach on public.athlete_invitations;
create policy athlete_invitations_delete_coach
on public.athlete_invitations for delete to authenticated
using (coach_id = (select auth.uid()) and private.current_user_is_coach());

create or replace function private.activate_athlete_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status = 'pending' and new.athlete_id is not null then
    if not exists (select 1 from public.profiles p where p.id = new.coach_id and p.role = 'coach') then
      raise exception 'Coach non valido';
    end if;
    if not exists (select 1 from public.profiles p where p.id = new.athlete_id and p.role = 'athlete') then
      raise exception 'Atleta non valido';
    end if;
    insert into public.coach_athletes (coach_id, athlete_id, status)
    values (new.coach_id, new.athlete_id, 'active')
    on conflict (coach_id, athlete_id) do update set status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists athlete_invitation_activate on public.athlete_invitations;
create trigger athlete_invitation_activate
after update of status on public.athlete_invitations
for each row execute function private.activate_athlete_invitation();
