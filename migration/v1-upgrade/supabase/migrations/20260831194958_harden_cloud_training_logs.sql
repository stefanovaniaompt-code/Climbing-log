create or replace function private.prevent_session_log_identity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.session_id is distinct from old.session_id
     or new.athlete_id is distinct from old.athlete_id then
    raise exception 'session log identity fields are immutable';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_exercise_log_identity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.session_log_id is distinct from old.session_log_id
     or new.session_exercise_id is distinct from old.session_exercise_id
     or new.athlete_id is distinct from old.athlete_id then
    raise exception 'exercise log identity fields are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_session_logs_immutable_identity on public.session_logs;
create trigger trg_session_logs_immutable_identity
before update on public.session_logs
for each row execute function private.prevent_session_log_identity_change();

drop trigger if exists trg_exercise_logs_immutable_identity on public.exercise_logs;
create trigger trg_exercise_logs_immutable_identity
before update on public.exercise_logs
for each row execute function private.prevent_exercise_log_identity_change();

drop policy if exists exercise_logs_insert_athlete on public.exercise_logs;
create policy exercise_logs_insert_athlete on public.exercise_logs
for insert to authenticated
with check (
  athlete_id = (select auth.uid())
  and private.can_access_session_exercise(session_exercise_id)
  and exists (
    select 1
    from public.session_logs sl
    join public.session_exercises se on se.id = session_exercise_id
    where sl.id = session_log_id
      and sl.athlete_id = (select auth.uid())
      and se.session_id = sl.session_id
  )
);

drop policy if exists exercise_logs_update_athlete on public.exercise_logs;
create policy exercise_logs_update_athlete on public.exercise_logs
for update to authenticated
using (
  athlete_id = (select auth.uid())
  and private.can_access_session_exercise(session_exercise_id)
)
with check (
  athlete_id = (select auth.uid())
  and private.can_access_session_exercise(session_exercise_id)
  and exists (
    select 1
    from public.session_logs sl
    join public.session_exercises se on se.id = session_exercise_id
    where sl.id = session_log_id
      and sl.athlete_id = (select auth.uid())
      and se.session_id = sl.session_id
  )
);;
