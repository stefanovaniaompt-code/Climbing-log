create or replace function private.can_access_program(target_program uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.programs p
    where p.id = target_program
      and (
        (p.athlete_id = (select auth.uid()) and p.status <> 'draft')
        or (p.coach_id = (select auth.uid()) and private.is_coach_of(p.athlete_id))
      )
  );
$$;

drop policy if exists programs_select_assigned on public.programs;
create policy programs_select_assigned on public.programs
for select to authenticated
using (
  (athlete_id = (select auth.uid()) and status <> 'draft')
  or ((coach_id = (select auth.uid())) and private.is_coach_of(athlete_id))
);;
