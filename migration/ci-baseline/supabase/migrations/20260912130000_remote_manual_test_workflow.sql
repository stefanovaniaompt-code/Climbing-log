-- Remote manual testing workflow.
-- Additive migration: no production data is deleted.

alter table public.test_session_items
  add column if not exists draft_values jsonb not null default '[]'::jsonb,
  add column if not exists athlete_notes text not null default '',
  add column if not exists completed_at timestamptz;

alter table public.test_results
  add column if not exists test_session_item_id uuid
    references public.test_session_items(id)
    on delete cascade;

create index if not exists test_results_session_item_idx
  on public.test_results (test_session_item_id);

create unique index if not exists test_results_manual_item_metric_idx
  on public.test_results (test_session_item_id, metric_key)
  where test_session_item_id is not null
    and measurement_source = 'manual';

-- ----------------------------------------------------------
-- Editing a test definition belongs to the coach.
-- Athletes keep read access but use narrow RPCs to execute
-- their own remote assignment.
-- ----------------------------------------------------------

create or replace function private.can_edit_test_session(
  target_test_session uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.test_sessions ts
    where ts.id = target_test_session
      and ts.coach_id = (select auth.uid())
      and private.is_coach_of(ts.athlete_id)
  );
$$;

-- Direct updates/deletes of sessions are coach-side only.
drop policy if exists test_sessions_update
  on public.test_sessions;

create policy test_sessions_update
on public.test_sessions
for update
using (
  coach_id = (select auth.uid())
  and private.is_coach_of(athlete_id)
)
with check (
  coach_id = (select auth.uid())
  and private.is_coach_of(athlete_id)
);

drop policy if exists test_sessions_delete
  on public.test_sessions;

create policy test_sessions_delete
on public.test_sessions
for delete
using (
  coach_id = (select auth.uid())
  and private.is_coach_of(athlete_id)
);

-- test_session_items policies already rely on
-- private.can_edit_test_session(), which is now coach-only.

-- ----------------------------------------------------------
-- Athlete starts/resumes own remote assignment.
-- Idempotent when already in progress.
-- ----------------------------------------------------------

create or replace function public.start_remote_test_session(
  p_session_id uuid,
  p_started_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.test_sessions%rowtype;
  v_athlete_id uuid;
begin
  select *
  into v_session
  from public.test_sessions
  where id = p_session_id
  for update;

  if v_session.id is null
     or v_session.mode <> 'remote' then
    raise exception 'Remote test session not found';
  end if;

  select id
  into v_athlete_id
  from public.athletes
  where user_id = (select auth.uid())
  limit 1;

  if v_athlete_id is null
     or v_athlete_id <> v_session.athlete_id then
    raise exception 'Remote test session belongs to another athlete';
  end if;

  if v_session.status = 'assigned' then
    update public.test_sessions
    set status = 'in_progress',
        started_at = coalesce(started_at, p_started_at),
        tested_at = (p_started_at at time zone 'UTC')::date
    where id = p_session_id;

  elsif v_session.status = 'in_progress' then
    null;

  else
    raise exception 'Remote test session is already closed';
  end if;

  return jsonb_build_object(
    'id', p_session_id,
    'status', 'in_progress'
  );
end;
$$;

revoke all
on function public.start_remote_test_session(uuid, timestamptz)
from public;

grant execute
on function public.start_remote_test_session(uuid, timestamptz)
to authenticated;

-- ----------------------------------------------------------
-- Athlete saves one remote item.
--
-- p_status:
-- pending      = not started
-- in_progress  = draft / partial input
-- completed    = actually performed + >= 1 value
-- skipped      = explicitly not performed
--
-- Official test_results are created ONLY when completed.
-- Draft values live in test_session_items.draft_values.
-- ----------------------------------------------------------

create or replace function public.save_remote_test_item(
  p_item_id uuid,
  p_values jsonb,
  p_notes text,
  p_status text,
  p_completed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.test_session_items%rowtype;
  v_session public.test_sessions%rowtype;
  v_athlete_id uuid;
  v_value jsonb;
begin
  select *
  into v_item
  from public.test_session_items
  where id = p_item_id
  for update;

  if v_item.id is null then
    raise exception 'Remote test item not found';
  end if;

  select *
  into v_session
  from public.test_sessions
  where id = v_item.test_session_id
  for update;

  if v_session.id is null
     or v_session.mode <> 'remote'
     or v_session.status <> 'in_progress' then
    raise exception 'Remote test session is not in progress';
  end if;

  select id
  into v_athlete_id
  from public.athletes
  where user_id = (select auth.uid())
  limit 1;

  if v_athlete_id is null
     or v_athlete_id <> v_session.athlete_id then
    raise exception 'Remote test item belongs to another athlete';
  end if;

  if v_item.source <> 'manual' then
    raise exception 'Remote tests must use manual measurement';
  end if;

  if p_status not in (
    'pending',
    'in_progress',
    'completed',
    'skipped'
  ) then
    raise exception 'Invalid remote test item status';
  end if;

  if jsonb_typeof(coalesce(p_values, '[]'::jsonb)) <> 'array' then
    raise exception 'Remote values must be an array';
  end if;

  -- Closed items are immutable. Repeated saves are harmless.
  if v_item.status in ('completed', 'skipped') then
    return jsonb_build_object(
      'id', v_item.id,
      'status', v_item.status,
      'unchanged', true
    );
  end if;

  if p_status = 'completed'
     and jsonb_array_length(coalesce(p_values, '[]'::jsonb)) = 0 then
    raise exception 'A completed remote test requires at least one value';
  end if;

  for v_value in
    select value
    from jsonb_array_elements(
      coalesce(p_values, '[]'::jsonb)
    )
  loop
    if jsonb_typeof(v_value) <> 'object'
       or coalesce(btrim(v_value->>'metricKey'), '') = ''
       or coalesce(btrim(v_value->>'metricLabel'), '') = ''
       or coalesce(btrim(v_value->>'unit'), '') = ''
       or jsonb_typeof(v_value->'value') <> 'number' then
      raise exception 'Invalid remote test metric';
    end if;
  end loop;

  update public.test_session_items
  set draft_values =
        case
          when p_status = 'skipped'
            then '[]'::jsonb
          else coalesce(p_values, '[]'::jsonb)
        end,
      athlete_notes = coalesce(p_notes, ''),
      status = p_status,
      completed_at =
        case
          when p_status = 'completed'
            then coalesce(p_completed_at, now())
          else null
        end
  where id = p_item_id;

  -- There should be no official results before completion.
  -- Delete defensively for skipped/non-completed states.
  if p_status <> 'completed' then
    delete from public.test_results
    where test_session_item_id = p_item_id
      and measurement_source = 'manual';

    return jsonb_build_object(
      'id', p_item_id,
      'status', p_status
    );
  end if;

  delete from public.test_results
  where test_session_item_id = p_item_id
    and measurement_source = 'manual';

  insert into public.test_results (
    test_session_id,
    test_session_item_id,
    metric_key,
    metric_label,
    value,
    unit,
    side,
    grip,
    normalize_to_body_weight,
    setup,
    notes,
    measurement_source,
    quality_status,
    is_primary,
    protocol_key,
    protocol_version,
    body_weight_kg_at_test
  )
  select
    v_session.id,
    v_item.id,
    btrim(metric->>'metricKey'),
    btrim(metric->>'metricLabel'),
    (metric->>'value')::double precision,
    btrim(metric->>'unit'),
    v_item.side,
    v_item.grip,
    false,
    v_item.config,
    nullif(btrim(coalesce(p_notes, '')), ''),
    'manual',
    'VALID',
    (
      btrim(metric->>'metricKey') =
      nullif(
        btrim(
          coalesce(
            v_item.config->>'primaryMetricKey',
            ''
          )
        ),
        ''
      )
    ),
    v_item.protocol_key,
    v_item.protocol_version,
    v_session.body_weight_kg
  from jsonb_array_elements(
    coalesce(p_values, '[]'::jsonb)
  ) metric;

  return jsonb_build_object(
    'id', p_item_id,
    'status', 'completed'
  );
end;
$$;

revoke all
on function public.save_remote_test_item(
  uuid,
  jsonb,
  text,
  text,
  timestamptz
)
from public;

grant execute
on function public.save_remote_test_item(
  uuid,
  jsonb,
  text,
  text,
  timestamptz
)
to authenticated;

-- ----------------------------------------------------------
-- Final submission.
-- Pending/in-progress items block submission.
-- completed OR explicitly skipped are accepted.
-- ----------------------------------------------------------

create or replace function public.complete_remote_test_session(
  p_session_id uuid,
  p_ended_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.test_sessions%rowtype;
  v_athlete_id uuid;
begin
  select *
  into v_session
  from public.test_sessions
  where id = p_session_id
  for update;

  if v_session.id is null
     or v_session.mode <> 'remote' then
    raise exception 'Remote test session not found';
  end if;

  select id
  into v_athlete_id
  from public.athletes
  where user_id = (select auth.uid())
  limit 1;

  if v_athlete_id is null
     or v_athlete_id <> v_session.athlete_id then
    raise exception 'Remote test session belongs to another athlete';
  end if;

  if v_session.status <> 'in_progress' then
    raise exception 'Remote test session is not in progress';
  end if;

  if exists(
    select 1
    from public.test_session_items item
    where item.test_session_id = p_session_id
      and item.status not in ('completed', 'skipped')
  ) then
    raise exception 'All remote tests must be completed or skipped';
  end if;

  update public.test_sessions
  set status = 'completed',
      ended_at = p_ended_at
  where id = p_session_id;

  return jsonb_build_object(
    'id', p_session_id,
    'status', 'completed'
  );
end;
$$;

revoke all
on function public.complete_remote_test_session(uuid, timestamptz)
from public;

grant execute
on function public.complete_remote_test_session(uuid, timestamptz)
to authenticated;
