-- Program Builder: load/deload metadata, atomic load adjustment and real calendar events.

alter table public.training_weeks
  add column if not exists load_type text not null default 'load'
  check (load_type in ('load', 'deload'));

create table if not exists public.program_calendar_events (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  event_type text not null check (event_type in ('travel', 'off', 'unavailable', 'note')),
  start_date date not null,
  end_date date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists program_calendar_events_program_date_idx
  on public.program_calendar_events(program_id, start_date);

alter table public.program_calendar_events enable row level security;
create policy program_calendar_events_select on public.program_calendar_events for select
  using (private.can_manage_program(program_id));
create policy program_calendar_events_insert on public.program_calendar_events for insert
  with check (private.can_manage_program(program_id));
create policy program_calendar_events_update on public.program_calendar_events for update
  using (private.can_manage_program(program_id)) with check (private.can_manage_program(program_id));
create policy program_calendar_events_delete on public.program_calendar_events for delete
  using (private.can_manage_program(program_id));
grant select, insert, update, delete on public.program_calendar_events to authenticated;

create or replace function private.scale_load_values(value jsonb, factor numeric)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  key text;
  item jsonb;
  result jsonb;
begin
  if jsonb_typeof(value) = 'array' then
    result := '[]'::jsonb;
    for item in select jsonb_array_elements(value) loop
      result := result || jsonb_build_array(private.scale_load_values(item, factor));
    end loop;
    return result;
  end if;
  if jsonb_typeof(value) <> 'object' then return value; end if;
  result := '{}'::jsonb;
  for key, item in select * from jsonb_each(value) loop
    if key in ('loadKg', 'load_kg', 'load_value') and jsonb_typeof(item) = 'number' then
      result := result || jsonb_build_object(key, to_jsonb(round((item #>> '{}')::numeric * factor * 2) / 2));
    else
      result := result || jsonb_build_object(key, private.scale_load_values(item, factor));
    end if;
  end loop;
  return result;
end;
$$;
revoke all on function private.scale_load_values(jsonb, numeric) from public, anon;
grant execute on function private.scale_load_values(jsonb, numeric) to authenticated;

create or replace function public.adjust_prescription_loads(target_scope text, target_id uuid, percentage numeric)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare changed integer;
begin
  if target_scope not in ('week', 'session') then raise exception 'Ambito carichi non valido.'; end if;
  if percentage < -100 or percentage > 500 then raise exception 'Percentuale non valida.'; end if;
  if target_scope = 'week' and not private.can_manage_week(target_id) then raise exception 'Settimana non modificabile.' using errcode = '42501'; end if;
  if target_scope = 'session' and not private.can_manage_session(target_id) then raise exception 'Sessione non modificabile.' using errcode = '42501'; end if;

  update public.session_exercises se
  set prescription = private.scale_load_values(se.prescription, 1 + percentage / 100), updated_at = now()
  from public.sessions s
  where se.session_id = s.id
    and ((target_scope = 'session' and s.id = target_id) or (target_scope = 'week' and s.training_week_id = target_id));
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.adjust_prescription_loads(text, uuid, numeric) from public, anon;
grant execute on function public.adjust_prescription_loads(text, uuid, numeric) to authenticated;

create or replace function public.clone_training_week(source_week_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare source_week public.training_weeks%rowtype; source_session public.sessions%rowtype; source_exercise public.session_exercises%rowtype; cloned_week_id uuid; cloned_session_id uuid; cloned_exercise_id uuid; cloned_week_number integer;
begin
  select tw.* into source_week from public.training_weeks tw where tw.id = source_week_id and private.can_manage_week(tw.id);
  if not found then raise exception 'Settimana non trovata o non modificabile.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(source_week.program_id::text, 0));
  select coalesce(max(week_number), 0) + 1 into cloned_week_number from public.training_weeks where program_id = source_week.program_id;
  insert into public.training_weeks(program_id, week_number, block_name, phase, start_date, status, notes, load_type)
  values(source_week.program_id, cloned_week_number, source_week.block_name, source_week.phase,
    case when source_week.start_date is null then null else source_week.start_date + ((cloned_week_number-source_week.week_number)*7) end,
    'planned', source_week.notes, source_week.load_type) returning id into cloned_week_id;
  for source_session in select * from public.sessions where training_week_id=source_week.id order by session_order loop
    insert into public.sessions(training_week_id,session_order,title,objective,duration_minutes,coach_notes,scheduled_day)
    values(cloned_week_id,source_session.session_order,source_session.title,source_session.objective,source_session.duration_minutes,source_session.coach_notes,source_session.scheduled_day)
    returning id into cloned_session_id;
    for source_exercise in select * from public.session_exercises where session_id=source_session.id order by exercise_order loop
      insert into public.session_exercises(session_id,exercise_id,exercise_order,exercise_name,prescription,calculation_context,target_rpe_min,target_rpe_max,rest_seconds,instructions)
      values(cloned_session_id,source_exercise.exercise_id,source_exercise.exercise_order,source_exercise.exercise_name,source_exercise.prescription,source_exercise.calculation_context,source_exercise.target_rpe_min,source_exercise.target_rpe_max,source_exercise.rest_seconds,source_exercise.instructions)
      returning id into cloned_exercise_id;
      insert into public.exercise_test_targets(session_exercise_id,reference_type,test_result_id,test_attempt_id,metric_key,source_value,source_unit,source_tested_at,source_side,source_grip,source_body_weight_kg,percentage,calculated_target,target_unit,locked_at,created_by,source_metric_label,source_protocol_key,source_protocol_version,source_setup,source_measurement_source,source_quality_status,source_measured_at,set_targets)
      select cloned_exercise_id,reference_type,test_result_id,test_attempt_id,metric_key,source_value,source_unit,source_tested_at,source_side,source_grip,source_body_weight_kg,percentage,calculated_target,target_unit,locked_at,created_by,source_metric_label,source_protocol_key,source_protocol_version,source_setup,source_measurement_source,source_quality_status,source_measured_at,set_targets
      from public.exercise_test_targets where session_exercise_id=source_exercise.id;
    end loop;
  end loop;
  return cloned_week_id;
end;
$$;
revoke all on function public.clone_training_week(uuid) from public, anon;
grant execute on function public.clone_training_week(uuid) to authenticated;
