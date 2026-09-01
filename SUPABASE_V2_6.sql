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
