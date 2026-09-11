-- A coach may see identities already related to them (including suspended ones)
-- and identities asking to connect. No program/session access is broadened.
drop policy athletes_select_related on public.athletes;
create policy athletes_select_related on public.athletes for select using (
  user_id=(select auth.uid())
  or exists(select 1 from public.coach_athletes ca where ca.coach_id=(select auth.uid()) and ca.athlete_id=athletes.id)
  or exists(select 1 from public.coach_link_requests clr where clr.coach_id=(select auth.uid()) and clr.athlete_id=athletes.id and clr.status='pending')
);

drop policy athletes_update_related on public.athletes;
create policy athletes_update_related on public.athletes for update using (
  user_id=(select auth.uid())
  or exists(select 1 from public.coach_athletes ca where ca.coach_id=(select auth.uid()) and ca.athlete_id=athletes.id)
) with check (
  user_id=(select auth.uid())
  or exists(select 1 from public.coach_athletes ca where ca.coach_id=(select auth.uid()) and ca.athlete_id=athletes.id)
);

create index coach_link_requests_athlete_idx on public.coach_link_requests(athlete_id);
