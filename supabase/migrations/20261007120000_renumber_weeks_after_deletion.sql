-- Delete one week and keep the remaining numbered weeks contiguous.
-- The advisory lock serializes this operation with clone_training_week.
create or replace function public.delete_training_week_and_renumber(target_week_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_week public.training_weeks%rowtype;
  max_week_number integer;
  deleted_count integer;
  renumbered_count integer;
begin
  select tw.*
  into target_week
  from public.training_weeks tw
  where tw.id = target_week_id
    and private.can_manage_week(tw.id);

  if not found then
    raise exception 'Settimana non trovata o non modificabile.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_week.program_id::text, 0)
  );

  select tw.*
  into target_week
  from public.training_weeks tw
  where tw.id = target_week_id
    and private.can_manage_week(tw.id)
  for update;

  if not found then
    raise exception 'Settimana non trovata o non modificabile.' using errcode = '42501';
  end if;

  delete from public.training_weeks tw
  where tw.id = target_week.id;
  get diagnostics deleted_count = row_count;

  if deleted_count = 0 then
    raise exception 'Settimana non eliminabile.' using errcode = '42501';
  end if;

  select coalesce(max(tw.week_number), 0)
  into max_week_number
  from public.training_weeks tw
  where tw.program_id = target_week.program_id;

  if max_week_number = 0 then
    return 0;
  end if;

  -- Move all survivors above the old range first to avoid collisions with
  -- the unique (program_id, week_number) constraint during the renumbering.
  update public.training_weeks tw
  set week_number = tw.week_number + max_week_number
  where tw.program_id = target_week.program_id;

  with ordered_weeks as (
    select
      tw.id,
      row_number() over (order by tw.week_number - max_week_number) as new_week_number
    from public.training_weeks tw
    where tw.program_id = target_week.program_id
  )
  update public.training_weeks tw
  set week_number = ordered_weeks.new_week_number::integer
  from ordered_weeks
  where tw.id = ordered_weeks.id;

  get diagnostics renumbered_count = row_count;
  return renumbered_count;
end;
$$;

revoke all on function public.delete_training_week_and_renumber(uuid) from public, anon;
grant execute on function public.delete_training_week_and_renumber(uuid) to authenticated;
