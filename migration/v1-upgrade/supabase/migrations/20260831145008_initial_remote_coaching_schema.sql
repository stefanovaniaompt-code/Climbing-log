create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  role text not null default 'athlete' check (role in ('athlete','coach')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_athletes (
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('pending','active','inactive')),
  created_at timestamptz not null default now(),
  primary key (coach_id, athlete_id),
  check (coach_id <> athlete_id)
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  goal text,
  status text not null default 'draft' check (status in ('draft','active','completed','archived')),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_weeks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  week_number integer not null check (week_number > 0),
  block_name text,
  phase text,
  start_date date,
  status text not null default 'planned' check (status in ('planned','current','completed','skipped')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, week_number)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  training_week_id uuid not null references public.training_weeks(id) on delete cascade,
  session_order integer not null check (session_order > 0),
  title text not null,
  objective text,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  coach_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (training_week_id, session_order)
);

create table public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text,
  modality text,
  description text,
  default_instructions text,
  default_prescription jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  exercise_id uuid references public.exercise_library(id) on delete set null,
  exercise_order integer not null check (exercise_order > 0),
  exercise_name text not null,
  prescription jsonb not null default '{}'::jsonb,
  calculation_context jsonb not null default '{}'::jsonb,
  target_rpe_min numeric(3,1) check (target_rpe_min is null or (target_rpe_min >= 0 and target_rpe_min <= 10)),
  target_rpe_max numeric(3,1) check (target_rpe_max is null or (target_rpe_max >= 0 and target_rpe_max <= 10)),
  rest_seconds integer check (rest_seconds is null or rest_seconds >= 0),
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, exercise_order),
  check (target_rpe_min is null or target_rpe_max is null or target_rpe_min <= target_rpe_max)
);

create table public.session_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'planned' check (status in ('planned','in_progress','completed','skipped')),
  started_at timestamptz,
  completed_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  session_rpe numeric(3,1) check (session_rpe is null or (session_rpe >= 0 and session_rpe <= 10)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, athlete_id)
);

create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  session_log_id uuid not null references public.session_logs(id) on delete cascade,
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  completed boolean not null default false,
  actual jsonb not null default '{}'::jsonb,
  rpe numeric(3,1) check (rpe is null or (rpe >= 0 and rpe <= 10)),
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_log_id, session_exercise_id)
);

create table public.test_sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  tested_at date not null default current_date,
  body_weight_kg numeric(6,2) check (body_weight_kg is null or body_weight_kg > 0),
  protocol_version text,
  context jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.test_results (
  id uuid primary key default gen_random_uuid(),
  test_session_id uuid not null references public.test_sessions(id) on delete cascade,
  metric_key text not null,
  metric_label text not null,
  value numeric not null,
  unit text not null,
  side text check (side is null or side in ('left','right','bilateral')),
  grip text,
  normalize_to_body_weight boolean not null default false,
  setup jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index coach_athletes_coach_idx on public.coach_athletes(coach_id, status);
create index coach_athletes_athlete_idx on public.coach_athletes(athlete_id, status);
create index programs_athlete_idx on public.programs(athlete_id, status);
create index programs_coach_idx on public.programs(coach_id, status);
create index training_weeks_program_idx on public.training_weeks(program_id, week_number);
create index sessions_week_idx on public.sessions(training_week_id, session_order);
create index exercise_library_coach_idx on public.exercise_library(coach_id, archived);
create index session_exercises_session_idx on public.session_exercises(session_id, exercise_order);
create index session_logs_athlete_idx on public.session_logs(athlete_id, status);
create index session_logs_session_idx on public.session_logs(session_id);
create index exercise_logs_athlete_idx on public.exercise_logs(athlete_id);
create index exercise_logs_session_exercise_idx on public.exercise_logs(session_exercise_id);
create index test_sessions_athlete_date_idx on public.test_sessions(athlete_id, tested_at desc);
create index test_sessions_coach_idx on public.test_sessions(coach_id, tested_at desc);
create index test_results_session_idx on public.test_results(test_session_id);
create index test_results_metric_idx on public.test_results(metric_key, side, grip);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create or replace function private.current_user_is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'coach'
  );
$$;

create or replace function private.is_athlete(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target_id and p.role = 'athlete'
  );
$$;

create or replace function private.is_coach_of(target_athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coach_athletes ca
    where ca.coach_id = (select auth.uid())
      and ca.athlete_id = target_athlete
      and ca.status = 'active'
  );
$$;

create or replace function private.is_athlete_of(target_coach uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coach_athletes ca
    where ca.athlete_id = (select auth.uid())
      and ca.coach_id = target_coach
      and ca.status = 'active'
  );
$$;

create or replace function private.can_access_profile(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) = target_id
    or exists (
      select 1 from public.coach_athletes ca
      where ca.status = 'active'
        and (
          (ca.coach_id = (select auth.uid()) and ca.athlete_id = target_id)
          or
          (ca.athlete_id = (select auth.uid()) and ca.coach_id = target_id)
        )
    );
$$;

create or replace function private.can_access_program(target_program uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.programs p
    where p.id = target_program
      and (
        p.athlete_id = (select auth.uid())
        or (p.coach_id = (select auth.uid()) and private.is_coach_of(p.athlete_id))
      )
  );
$$;

create or replace function private.can_manage_program(target_program uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.programs p
    where p.id = target_program
      and p.coach_id = (select auth.uid())
      and private.is_coach_of(p.athlete_id)
  );
$$;

create or replace function private.can_access_week(target_week uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.training_weeks w
    where w.id = target_week and private.can_access_program(w.program_id)
  );
$$;

create or replace function private.can_manage_week(target_week uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.training_weeks w
    where w.id = target_week and private.can_manage_program(w.program_id)
  );
$$;

create or replace function private.can_access_session(target_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = target_session and private.can_access_week(s.training_week_id)
  );
$$;

create or replace function private.can_manage_session(target_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = target_session and private.can_manage_week(s.training_week_id)
  );
$$;

create or replace function private.can_access_session_exercise(target_session_exercise uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.session_exercises se
    where se.id = target_session_exercise and private.can_access_session(se.session_id)
  );
$$;

create or replace function private.can_manage_session_exercise(target_session_exercise uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.session_exercises se
    where se.id = target_session_exercise and private.can_manage_session(se.session_id)
  );
$$;

create or replace function private.can_access_test_session(target_test_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.test_sessions ts
    where ts.id = target_test_session
      and (
        ts.athlete_id = (select auth.uid())
        or (ts.coach_id = (select auth.uid()) and private.is_coach_of(ts.athlete_id))
      )
  );
$$;

create or replace function private.can_edit_test_session(target_test_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.test_sessions ts
    where ts.id = target_test_session
      and (
        ts.athlete_id = (select auth.uid())
        or (ts.coach_id = (select auth.uid()) and private.is_coach_of(ts.athlete_id))
      )
  );
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger programs_set_updated_at before update on public.programs
for each row execute function private.set_updated_at();
create trigger training_weeks_set_updated_at before update on public.training_weeks
for each row execute function private.set_updated_at();
create trigger sessions_set_updated_at before update on public.sessions
for each row execute function private.set_updated_at();
create trigger exercise_library_set_updated_at before update on public.exercise_library
for each row execute function private.set_updated_at();
create trigger session_exercises_set_updated_at before update on public.session_exercises
for each row execute function private.set_updated_at();
create trigger session_logs_set_updated_at before update on public.session_logs
for each row execute function private.set_updated_at();
create trigger exercise_logs_set_updated_at before update on public.exercise_logs
for each row execute function private.set_updated_at();
create trigger test_sessions_set_updated_at before update on public.test_sessions
for each row execute function private.set_updated_at();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.coach_athletes enable row level security;
alter table public.programs enable row level security;
alter table public.training_weeks enable row level security;
alter table public.sessions enable row level security;
alter table public.exercise_library enable row level security;
alter table public.session_exercises enable row level security;
alter table public.session_logs enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.test_sessions enable row level security;
alter table public.test_results enable row level security;

create policy "profiles_select_related" on public.profiles
for select to authenticated
using ((select auth.uid()) is not null and private.can_access_profile(id));

create policy "profiles_update_self" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "coach_athletes_select_related" on public.coach_athletes
for select to authenticated
using ((select auth.uid()) = coach_id or (select auth.uid()) = athlete_id);

create policy "coach_athletes_insert_coach" on public.coach_athletes
for insert to authenticated
with check (
  (select auth.uid()) = coach_id
  and private.current_user_is_coach()
  and private.is_athlete(athlete_id)
);

create policy "coach_athletes_update_coach" on public.coach_athletes
for update to authenticated
using ((select auth.uid()) = coach_id and private.current_user_is_coach())
with check ((select auth.uid()) = coach_id and private.current_user_is_coach());

create policy "coach_athletes_delete_coach" on public.coach_athletes
for delete to authenticated
using ((select auth.uid()) = coach_id and private.current_user_is_coach());

create policy "programs_select_assigned" on public.programs
for select to authenticated
using (
  athlete_id = (select auth.uid())
  or (coach_id = (select auth.uid()) and private.is_coach_of(athlete_id))
);

create policy "programs_insert_coach" on public.programs
for insert to authenticated
with check (
  coach_id = (select auth.uid())
  and private.current_user_is_coach()
  and private.is_coach_of(athlete_id)
);

create policy "programs_update_coach" on public.programs
for update to authenticated
using (coach_id = (select auth.uid()) and private.is_coach_of(athlete_id))
with check (coach_id = (select auth.uid()) and private.is_coach_of(athlete_id));

create policy "programs_delete_coach" on public.programs
for delete to authenticated
using (coach_id = (select auth.uid()) and private.is_coach_of(athlete_id));

create policy "training_weeks_select" on public.training_weeks
for select to authenticated
using (private.can_access_program(program_id));

create policy "training_weeks_insert" on public.training_weeks
for insert to authenticated
with check (private.can_manage_program(program_id));

create policy "training_weeks_update" on public.training_weeks
for update to authenticated
using (private.can_manage_program(program_id))
with check (private.can_manage_program(program_id));

create policy "training_weeks_delete" on public.training_weeks
for delete to authenticated
using (private.can_manage_program(program_id));

create policy "sessions_select" on public.sessions
for select to authenticated
using (private.can_access_week(training_week_id));

create policy "sessions_insert" on public.sessions
for insert to authenticated
with check (private.can_manage_week(training_week_id));

create policy "sessions_update" on public.sessions
for update to authenticated
using (private.can_manage_week(training_week_id))
with check (private.can_manage_week(training_week_id));

create policy "sessions_delete" on public.sessions
for delete to authenticated
using (private.can_manage_week(training_week_id));

create policy "exercise_library_select" on public.exercise_library
for select to authenticated
using (
  coach_id = (select auth.uid())
  or private.is_athlete_of(coach_id)
);

create policy "exercise_library_insert" on public.exercise_library
for insert to authenticated
with check (coach_id = (select auth.uid()) and private.current_user_is_coach());

create policy "exercise_library_update" on public.exercise_library
for update to authenticated
using (coach_id = (select auth.uid()) and private.current_user_is_coach())
with check (coach_id = (select auth.uid()) and private.current_user_is_coach());

create policy "exercise_library_delete" on public.exercise_library
for delete to authenticated
using (coach_id = (select auth.uid()) and private.current_user_is_coach());

create policy "session_exercises_select" on public.session_exercises
for select to authenticated
using (private.can_access_session(session_id));

create policy "session_exercises_insert" on public.session_exercises
for insert to authenticated
with check (private.can_manage_session(session_id));

create policy "session_exercises_update" on public.session_exercises
for update to authenticated
using (private.can_manage_session(session_id))
with check (private.can_manage_session(session_id));

create policy "session_exercises_delete" on public.session_exercises
for delete to authenticated
using (private.can_manage_session(session_id));

create policy "session_logs_select" on public.session_logs
for select to authenticated
using (
  athlete_id = (select auth.uid())
  or private.is_coach_of(athlete_id)
);

create policy "session_logs_insert_athlete" on public.session_logs
for insert to authenticated
with check (
  athlete_id = (select auth.uid())
  and private.can_access_session(session_id)
);

create policy "session_logs_update_athlete" on public.session_logs
for update to authenticated
using (athlete_id = (select auth.uid()) and private.can_access_session(session_id))
with check (athlete_id = (select auth.uid()) and private.can_access_session(session_id));

create policy "session_logs_delete_athlete" on public.session_logs
for delete to authenticated
using (athlete_id = (select auth.uid()) and private.can_access_session(session_id));

create policy "exercise_logs_select" on public.exercise_logs
for select to authenticated
using (
  athlete_id = (select auth.uid())
  or private.is_coach_of(athlete_id)
);

create policy "exercise_logs_insert_athlete" on public.exercise_logs
for insert to authenticated
with check (
  athlete_id = (select auth.uid())
  and private.can_access_session_exercise(session_exercise_id)
  and exists (
    select 1 from public.session_logs sl
    where sl.id = session_log_id and sl.athlete_id = (select auth.uid())
  )
);

create policy "exercise_logs_update_athlete" on public.exercise_logs
for update to authenticated
using (athlete_id = (select auth.uid()) and private.can_access_session_exercise(session_exercise_id))
with check (athlete_id = (select auth.uid()) and private.can_access_session_exercise(session_exercise_id));

create policy "exercise_logs_delete_athlete" on public.exercise_logs
for delete to authenticated
using (athlete_id = (select auth.uid()) and private.can_access_session_exercise(session_exercise_id));

create policy "test_sessions_select" on public.test_sessions
for select to authenticated
using (
  athlete_id = (select auth.uid())
  or (coach_id = (select auth.uid()) and private.is_coach_of(athlete_id))
);

create policy "test_sessions_insert" on public.test_sessions
for insert to authenticated
with check (
  (athlete_id = (select auth.uid()) and (coach_id is null or private.is_athlete_of(coach_id)))
  or
  (coach_id = (select auth.uid()) and private.current_user_is_coach() and private.is_coach_of(athlete_id))
);

create policy "test_sessions_update" on public.test_sessions
for update to authenticated
using (
  athlete_id = (select auth.uid())
  or (coach_id = (select auth.uid()) and private.is_coach_of(athlete_id))
)
with check (
  athlete_id = (select auth.uid())
  or (coach_id = (select auth.uid()) and private.is_coach_of(athlete_id))
);

create policy "test_sessions_delete" on public.test_sessions
for delete to authenticated
using (
  athlete_id = (select auth.uid())
  or (coach_id = (select auth.uid()) and private.is_coach_of(athlete_id))
);

create policy "test_results_select" on public.test_results
for select to authenticated
using (private.can_access_test_session(test_session_id));

create policy "test_results_insert" on public.test_results
for insert to authenticated
with check (private.can_edit_test_session(test_session_id));

create policy "test_results_update" on public.test_results
for update to authenticated
using (private.can_edit_test_session(test_session_id))
with check (private.can_edit_test_session(test_session_id));

create policy "test_results_delete" on public.test_results
for delete to authenticated
using (private.can_edit_test_session(test_session_id));

create view public.test_history
with (security_invoker = true)
as
select
  ts.athlete_id,
  ts.coach_id,
  ts.id as test_session_id,
  ts.tested_at,
  ts.body_weight_kg,
  tr.id as test_result_id,
  tr.metric_key,
  tr.metric_label,
  tr.value,
  tr.unit,
  tr.side,
  tr.grip,
  tr.normalize_to_body_weight,
  case
    when tr.normalize_to_body_weight and ts.body_weight_kg is not null and ts.body_weight_kg > 0
      then tr.value / ts.body_weight_kg
    else null
  end as value_bodyweight_ratio,
  tr.setup,
  tr.notes
from public.test_sessions ts
join public.test_results tr on tr.test_session_id = ts.id;

revoke all on public.profiles, public.coach_athletes, public.programs, public.training_weeks, public.sessions, public.exercise_library, public.session_exercises, public.session_logs, public.exercise_logs, public.test_sessions, public.test_results from anon;
revoke all on public.test_history from anon;

revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

grant select, insert, update, delete on public.coach_athletes, public.programs, public.training_weeks, public.sessions, public.exercise_library, public.session_exercises, public.session_logs, public.exercise_logs, public.test_sessions, public.test_results to authenticated;
grant select on public.test_history to authenticated;

grant select, insert, update, delete on public.profiles, public.coach_athletes, public.programs, public.training_weeks, public.sessions, public.exercise_library, public.session_exercises, public.session_logs, public.exercise_logs, public.test_sessions, public.test_results to service_role;
grant select on public.test_history to service_role;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_user_is_coach() to authenticated;
grant execute on function private.is_athlete(uuid) to authenticated;
grant execute on function private.is_coach_of(uuid) to authenticated;
grant execute on function private.is_athlete_of(uuid) to authenticated;
grant execute on function private.can_access_profile(uuid) to authenticated;
grant execute on function private.can_access_program(uuid) to authenticated;
grant execute on function private.can_manage_program(uuid) to authenticated;
grant execute on function private.can_access_week(uuid) to authenticated;
grant execute on function private.can_manage_week(uuid) to authenticated;
grant execute on function private.can_access_session(uuid) to authenticated;
grant execute on function private.can_manage_session(uuid) to authenticated;
grant execute on function private.can_access_session_exercise(uuid) to authenticated;
grant execute on function private.can_manage_session_exercise(uuid) to authenticated;
grant execute on function private.can_access_test_session(uuid) to authenticated;
grant execute on function private.can_edit_test_session(uuid) to authenticated;
;
