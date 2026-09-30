-- Duplica atomicamente l'ultima settimana di lavoro per consentire al coach
-- di modificarne carichi, ripetizioni e dettagli senza alterare l'originale.

create or replace function public.clone_training_week(source_week_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_week public.training_weeks%rowtype;
  source_session public.sessions%rowtype;
  cloned_week_id uuid;
  cloned_session_id uuid;
  cloned_week_number integer;
begin
  select tw.*
  into source_week
  from public.training_weeks as tw
  where tw.id = source_week_id
    and private.can_manage_week(tw.id);

  if not found then
    raise exception 'Settimana non trovata o non modificabile.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(source_week.program_id::text, 0));

  select coalesce(max(tw.week_number), 0) + 1
  into cloned_week_number
  from public.training_weeks as tw
  where tw.program_id = source_week.program_id;

  insert into public.training_weeks (
    program_id,
    week_number,
    block_name,
    phase,
    start_date,
    status,
    notes
  ) values (
    source_week.program_id,
    cloned_week_number,
    source_week.block_name,
    source_week.phase,
    case
      when source_week.start_date is null then null
      else source_week.start_date + ((cloned_week_number - source_week.week_number) * 7)
    end,
    'planned',
    source_week.notes
  )
  returning id into cloned_week_id;

  for source_session in
    select s.*
    from public.sessions as s
    where s.training_week_id = source_week.id
    order by s.session_order
  loop
    insert into public.sessions (
      training_week_id,
      session_order,
      title,
      objective,
      duration_minutes,
      coach_notes,
      scheduled_day
    ) values (
      cloned_week_id,
      source_session.session_order,
      source_session.title,
      source_session.objective,
      source_session.duration_minutes,
      source_session.coach_notes,
      source_session.scheduled_day
    )
    returning id into cloned_session_id;

    insert into public.session_exercises (
      session_id,
      exercise_id,
      exercise_order,
      exercise_name,
      prescription,
      calculation_context,
      target_rpe_min,
      target_rpe_max,
      rest_seconds,
      instructions
    )
    select
      cloned_session_id,
      se.exercise_id,
      se.exercise_order,
      se.exercise_name,
      se.prescription,
      se.calculation_context,
      se.target_rpe_min,
      se.target_rpe_max,
      se.rest_seconds,
      se.instructions
    from public.session_exercises as se
    where se.session_id = source_session.id
    order by se.exercise_order;
  end loop;

  return cloned_week_id;
end;
$$;

revoke all on function public.clone_training_week(uuid) from public;
revoke all on function public.clone_training_week(uuid) from anon;
grant execute on function public.clone_training_week(uuid) to authenticated;

comment on function public.clone_training_week(uuid) is
  'Duplica una settimana, le sue sessioni e i suoi esercizi nello stesso programma.';
