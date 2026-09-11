create or replace function private.current_athlete_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select a.id from public.athletes a where a.user_id = (select auth.uid()) limit 1;
$$;

create or replace function private.is_athlete(target_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.athletes a where a.id = target_id);
$$;

create or replace function private.is_athlete_of(target_coach uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coach_athletes ca where ca.athlete_id=private.current_athlete_id() and ca.coach_id=target_coach and ca.status='active');
$$;

create or replace function private.can_access_profile(target_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid())=target_id or exists (
    select 1 from public.coach_athletes ca join public.athletes a on a.id=ca.athlete_id
    where ca.status='active' and ((ca.coach_id=(select auth.uid()) and a.user_id=target_id) or (a.user_id=(select auth.uid()) and ca.coach_id=target_id))
  );
$$;

create or replace function private.can_access_program(target_program uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.programs p where p.id=target_program and ((p.athlete_id=private.current_athlete_id() and p.status<>'draft') or (p.coach_id=(select auth.uid()) and private.is_coach_of(p.athlete_id))));
$$;

create or replace function private.can_access_test_session(target_test_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.test_sessions ts where ts.id=target_test_session and (ts.athlete_id=private.current_athlete_id() or (ts.coach_id=(select auth.uid()) and private.is_coach_of(ts.athlete_id))));
$$;

create or replace function private.can_edit_test_session(target_test_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select private.can_access_test_session(target_test_session); $$;

drop policy athletes_select_related on public.athletes;
create policy athletes_select_related on public.athletes for select using (user_id=(select auth.uid()) or private.is_coach_of(id));
drop policy athletes_update_self on public.athletes;
create policy athletes_update_related on public.athletes for update using (user_id=(select auth.uid()) or private.is_coach_of(id)) with check (user_id=(select auth.uid()) or private.is_coach_of(id));

drop policy coach_athletes_select_related on public.coach_athletes;
create policy coach_athletes_select_related on public.coach_athletes for select using (coach_id=(select auth.uid()) or athlete_id=private.current_athlete_id());
drop policy programs_select_assigned on public.programs;
create policy programs_select_assigned on public.programs for select using ((athlete_id=private.current_athlete_id() and status<>'draft') or (coach_id=(select auth.uid()) and private.is_coach_of(athlete_id)));

drop policy session_logs_select on public.session_logs;
create policy session_logs_select on public.session_logs for select using (athlete_id=private.current_athlete_id() or private.is_coach_of(athlete_id));
drop policy session_logs_insert_athlete on public.session_logs;
create policy session_logs_insert_athlete on public.session_logs for insert with check (athlete_id=private.current_athlete_id() and private.can_access_session(session_id));
drop policy session_logs_update_athlete on public.session_logs;
create policy session_logs_update_athlete on public.session_logs for update using (athlete_id=private.current_athlete_id() and private.can_access_session(session_id)) with check (athlete_id=private.current_athlete_id() and private.can_access_session(session_id));
drop policy session_logs_delete_athlete on public.session_logs;
create policy session_logs_delete_athlete on public.session_logs for delete using (athlete_id=private.current_athlete_id() and private.can_access_session(session_id));

drop policy exercise_logs_select on public.exercise_logs;
create policy exercise_logs_select on public.exercise_logs for select using (athlete_id=private.current_athlete_id() or private.is_coach_of(athlete_id));
drop policy exercise_logs_insert_athlete on public.exercise_logs;
create policy exercise_logs_insert_athlete on public.exercise_logs for insert with check (
  athlete_id=private.current_athlete_id() and private.can_access_session_exercise(session_exercise_id)
  and exists(select 1 from public.session_logs sl join public.session_exercises se on se.id=session_exercise_id where sl.id=session_log_id and sl.athlete_id=private.current_athlete_id() and se.session_id=sl.session_id)
);
drop policy exercise_logs_update_athlete on public.exercise_logs;
create policy exercise_logs_update_athlete on public.exercise_logs for update using (athlete_id=private.current_athlete_id() and private.can_access_session_exercise(session_exercise_id)) with check (athlete_id=private.current_athlete_id() and private.can_access_session_exercise(session_exercise_id));
drop policy exercise_logs_delete_athlete on public.exercise_logs;
create policy exercise_logs_delete_athlete on public.exercise_logs for delete using (athlete_id=private.current_athlete_id() and private.can_access_session_exercise(session_exercise_id));

drop policy test_sessions_select on public.test_sessions;
create policy test_sessions_select on public.test_sessions for select using (athlete_id=private.current_athlete_id() or (coach_id=(select auth.uid()) and private.is_coach_of(athlete_id)));
drop policy test_sessions_insert on public.test_sessions;
create policy test_sessions_insert on public.test_sessions for insert with check ((athlete_id=private.current_athlete_id() and (coach_id is null or private.is_athlete_of(coach_id))) or (coach_id=(select auth.uid()) and private.current_user_is_coach() and private.is_coach_of(athlete_id)));
drop policy test_sessions_update on public.test_sessions;
create policy test_sessions_update on public.test_sessions for update using (athlete_id=private.current_athlete_id() or (coach_id=(select auth.uid()) and private.is_coach_of(athlete_id))) with check (athlete_id=private.current_athlete_id() or (coach_id=(select auth.uid()) and private.is_coach_of(athlete_id)));
drop policy test_sessions_delete on public.test_sessions;
create policy test_sessions_delete on public.test_sessions for delete using (athlete_id=private.current_athlete_id() or (coach_id=(select auth.uid()) and private.is_coach_of(athlete_id)));

drop policy test_plans_select on public.test_plans;
create policy test_plans_select on public.test_plans for select using ((coach_id=(select auth.uid()) and private.is_coach_of(athlete_id)) or (athlete_id=private.current_athlete_id() and status in ('published','completed')));
grant execute on function private.current_athlete_id() to authenticated;
