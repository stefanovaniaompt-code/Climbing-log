-- Additive Test + Tindeq evolution. Existing V1 test rows are preserved.

alter table public.test_library
  add column if not exists protocol_key text,
  add column if not exists protocol_version text not null default '1.0',
  add column if not exists primary_metric_key text,
  add column if not exists measurement_sources text[] not null default array['manual']::text[],
  add column if not exists side_applicable boolean not null default false,
  add column if not exists grip_applicable boolean not null default false,
  add column if not exists protocol_config jsonb not null default '{}'::jsonb;

alter table public.test_sessions
  add column if not exists mode text not null default 'manual',
  add column if not exists status text not null default 'completed',
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists summary jsonb not null default '{}'::jsonb;

alter table public.test_sessions drop constraint if exists test_sessions_mode_check;
alter table public.test_sessions add constraint test_sessions_mode_check check (mode in ('manual', 'remote', 'live')) not valid;
alter table public.test_sessions validate constraint test_sessions_mode_check;
alter table public.test_sessions drop constraint if exists test_sessions_status_check;
alter table public.test_sessions add constraint test_sessions_status_check check (status in ('assigned', 'in_progress', 'completed', 'cancelled')) not valid;
alter table public.test_sessions validate constraint test_sessions_status_check;

alter table public.test_results
  add column if not exists test_library_id uuid references public.test_library(id) on delete set null,
  add column if not exists attempt_id uuid,
  add column if not exists measurement_source text not null default 'manual',
  add column if not exists quality_status text not null default 'VALID',
  add column if not exists is_primary boolean not null default false,
  add column if not exists protocol_key text,
  add column if not exists protocol_version text,
  add column if not exists secondary_metrics jsonb not null default '{}'::jsonb,
  add column if not exists raw_curve_path text,
  add column if not exists body_weight_kg_at_test numeric(6,2);

alter table public.test_results drop constraint if exists test_results_measurement_source_check;
alter table public.test_results add constraint test_results_measurement_source_check check (measurement_source in ('manual', 'tindeq')) not valid;
alter table public.test_results validate constraint test_results_measurement_source_check;
alter table public.test_results drop constraint if exists test_results_quality_status_check;
alter table public.test_results add constraint test_results_quality_status_check check (quality_status in ('VALID', 'REVIEW', 'INVALID')) not valid;
alter table public.test_results validate constraint test_results_quality_status_check;

create table if not exists public.test_session_items (
  id uuid primary key default gen_random_uuid(),
  test_session_id uuid not null references public.test_sessions(id) on delete cascade,
  test_library_id uuid references public.test_library(id) on delete set null,
  item_order integer not null check (item_order > 0),
  protocol_key text not null,
  protocol_version text not null default '1.0',
  side text check (side in ('left', 'right', 'bilateral')),
  grip text,
  source text not null default 'manual' check (source in ('manual', 'tindeq')),
  config jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  created_at timestamptz not null default now(),
  unique (test_session_id, item_order)
);

create table if not exists public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  acquisition_id uuid not null default gen_random_uuid() unique,
  test_session_id uuid not null references public.test_sessions(id) on delete cascade,
  test_session_item_id uuid references public.test_session_items(id) on delete cascade,
  test_library_id uuid references public.test_library(id) on delete set null,
  attempt_number integer not null check (attempt_number > 0),
  measurement_source text not null check (measurement_source in ('manual', 'tindeq')),
  device_type text,
  device_info jsonb not null default '{}'::jsonb,
  side text check (side in ('left', 'right', 'bilateral')),
  grip text,
  protocol_key text not null,
  protocol_version text not null,
  quality_status text not null default 'REVIEW' check (quality_status in ('VALID', 'REVIEW', 'INVALID')),
  quality_flags jsonb not null default '[]'::jsonb,
  invalid_reason text,
  primary_metric_key text,
  primary_value double precision,
  primary_unit text,
  secondary_metrics jsonb not null default '{}'::jsonb,
  raw_curve_path text,
  sampling_metadata jsonb not null default '{}'::jsonb,
  body_weight_kg_at_test numeric(6,2),
  started_at timestamptz not null,
  ended_at timestamptz,
  is_selected boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (test_session_item_id, attempt_number)
);

do $$ begin
  alter table public.test_results add constraint test_results_attempt_id_fkey foreign key (attempt_id) references public.test_attempts(id) on delete set null;
exception when duplicate_object then null;
end $$;

create table if not exists public.test_result_corrections (
  id uuid primary key default gen_random_uuid(),
  test_result_id uuid not null references public.test_results(id) on delete cascade,
  original_value double precision not null,
  corrected_value double precision not null,
  reason text not null check (length(trim(reason)) > 0),
  corrected_by uuid not null default auth.uid() references auth.users(id),
  corrected_at timestamptz not null default now()
);

create table if not exists public.exercise_test_targets (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null unique references public.session_exercises(id) on delete cascade,
  reference_type text not null check (reference_type in ('latest_valid', 'personal_best', 'specific_result')),
  test_result_id uuid references public.test_results(id) on delete set null,
  test_attempt_id uuid references public.test_attempts(id) on delete set null,
  metric_key text not null,
  source_value double precision not null,
  source_unit text not null,
  source_tested_at date not null,
  source_side text,
  source_grip text,
  source_body_weight_kg numeric(6,2),
  percentage numeric(7,3) not null check (percentage > 0),
  calculated_target double precision not null,
  target_unit text not null,
  locked_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now()
);

create index if not exists test_session_items_session_idx on public.test_session_items (test_session_id, item_order);
create index if not exists test_session_items_library_idx on public.test_session_items (test_library_id);
create index if not exists test_attempts_session_idx on public.test_attempts (test_session_id, test_session_item_id, attempt_number);
create index if not exists test_attempts_library_idx on public.test_attempts (test_library_id);
create index if not exists test_attempts_valid_trend_idx on public.test_attempts (test_library_id, protocol_key, protocol_version, side, grip, ended_at) where quality_status = 'VALID';
create index if not exists test_results_attempt_idx on public.test_results (attempt_id);
create index if not exists test_results_library_idx on public.test_results (test_library_id);
create index if not exists test_result_corrections_result_idx on public.test_result_corrections (test_result_id, corrected_at);
create index if not exists exercise_test_targets_result_idx on public.exercise_test_targets (test_result_id);
create index if not exists exercise_test_targets_attempt_idx on public.exercise_test_targets (test_attempt_id);

alter table public.test_session_items enable row level security;
alter table public.test_attempts enable row level security;
alter table public.test_result_corrections enable row level security;
alter table public.exercise_test_targets enable row level security;

create policy test_session_items_select on public.test_session_items for select using (private.can_access_test_session(test_session_id));
create policy test_session_items_insert on public.test_session_items for insert with check (private.can_edit_test_session(test_session_id));
create policy test_session_items_update on public.test_session_items for update using (private.can_edit_test_session(test_session_id)) with check (private.can_edit_test_session(test_session_id));
create policy test_session_items_delete on public.test_session_items for delete using (private.can_edit_test_session(test_session_id));

create policy test_attempts_select on public.test_attempts for select using (private.can_access_test_session(test_session_id));
create policy test_attempts_insert on public.test_attempts for insert with check (private.can_edit_test_session(test_session_id) and created_by = (select auth.uid()));
create policy test_attempts_update on public.test_attempts for update using (private.can_edit_test_session(test_session_id)) with check (private.can_edit_test_session(test_session_id));
create policy test_attempts_delete on public.test_attempts for delete using (private.can_edit_test_session(test_session_id));

create policy test_result_corrections_select on public.test_result_corrections for select using (
  exists (select 1 from public.test_results tr where tr.id = test_result_id and private.can_access_test_session(tr.test_session_id))
);
create policy test_result_corrections_insert on public.test_result_corrections for insert with check (
  corrected_by = (select auth.uid()) and exists (select 1 from public.test_results tr where tr.id = test_result_id and private.can_edit_test_session(tr.test_session_id))
);

create policy exercise_test_targets_select on public.exercise_test_targets for select using (
  exists (select 1 from public.session_exercises se where se.id = session_exercise_id and private.can_access_session(se.session_id))
);
create policy exercise_test_targets_insert on public.exercise_test_targets for insert with check (
  created_by = (select auth.uid()) and exists (select 1 from public.session_exercises se where se.id = session_exercise_id and private.can_manage_session(se.session_id))
);
create policy exercise_test_targets_update on public.exercise_test_targets for update using (
  exists (select 1 from public.session_exercises se where se.id = session_exercise_id and private.can_manage_session(se.session_id))
) with check (
  exists (select 1 from public.session_exercises se where se.id = session_exercise_id and private.can_manage_session(se.session_id))
);
create policy exercise_test_targets_delete on public.exercise_test_targets for delete using (
  exists (select 1 from public.session_exercises se where se.id = session_exercise_id and private.can_manage_session(se.session_id))
);

grant select, insert, update, delete on public.test_session_items to authenticated;
grant select, insert, update, delete on public.test_attempts to authenticated;
grant select, insert on public.test_result_corrections to authenticated;
grant select, insert, update, delete on public.exercise_test_targets to authenticated;
grant select, insert, update, delete on public.test_library to authenticated;
grant select, insert, update, delete on public.test_sessions to authenticated;
grant select, insert, update, delete on public.test_results to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('test-acquisitions', 'test-acquisitions', false, 20971520, array['application/json', 'application/gzip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_access_test_acquisition(target_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.test_attempts ta
    where ta.raw_curve_path = target_name and private.can_access_test_session(ta.test_session_id)
  );
$$;

create or replace function private.can_create_test_acquisition(target_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when split_part(target_name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
    then private.can_edit_test_session(split_part(target_name, '/', 1)::uuid)
    else false
  end;
$$;

create policy test_acquisitions_select on storage.objects for select using (
  bucket_id = 'test-acquisitions' and private.can_access_test_acquisition(name)
);
create policy test_acquisitions_insert on storage.objects for insert with check (
  bucket_id = 'test-acquisitions' and private.can_create_test_acquisition(name)
);
create policy test_acquisitions_update on storage.objects for update using (
  bucket_id = 'test-acquisitions' and private.can_access_test_acquisition(name)
) with check (
  bucket_id = 'test-acquisitions' and private.can_access_test_acquisition(name)
);
create policy test_acquisitions_delete on storage.objects for delete using (
  bucket_id = 'test-acquisitions' and private.can_access_test_acquisition(name)
);

-- Existing manual records remain valid and retain their original test-time BW.
update public.test_results tr
set body_weight_kg_at_test = ts.body_weight_kg,
    protocol_version = coalesce(tr.protocol_version, ts.protocol_version),
    measurement_source = coalesce(tr.measurement_source, 'manual'),
    quality_status = coalesce(tr.quality_status, 'VALID')
from public.test_sessions ts
where ts.id = tr.test_session_id
  and (tr.body_weight_kg_at_test is null or tr.protocol_version is null);
