-- Close the access-control gaps found during the 2026-09-13 audit.
-- This migration is forward-only and does not modify application data.

-- Athlete accounts and athlete records use different UUIDs. Read access must
-- therefore resolve the signed-in user's athlete identity explicitly.
drop policy if exists test_library_select
  on public.test_library;

create policy test_library_select
on public.test_library
for select
to authenticated
using (
  coach_id = (select auth.uid())
  or exists (
    select 1
    from public.test_plan_items tpi
    join public.test_plans tp
      on tp.id = tpi.test_plan_id
    where tpi.test_library_id = test_library.id
      and tp.athlete_id = private.current_athlete_id()
      and tp.status in ('published', 'completed')
  )
);

drop policy if exists test_plan_items_select
  on public.test_plan_items;

create policy test_plan_items_select
on public.test_plan_items
for select
to authenticated
using (
  exists (
    select 1
    from public.test_plans tp
    where tp.id = test_plan_items.test_plan_id
      and (
        (
          tp.coach_id = (select auth.uid())
          and private.is_coach_of(tp.athlete_id)
        )
        or (
          tp.athlete_id = private.current_athlete_id()
          and tp.status in ('published', 'completed')
        )
      )
  )
);

-- SECURITY DEFINER entry points must never inherit anonymous execution.
revoke all
on function public.start_remote_test_session(uuid, timestamptz)
from public, anon;

revoke all
on function public.save_remote_test_item(
  uuid,
  jsonb,
  text,
  text,
  timestamptz
)
from public, anon;

revoke all
on function public.complete_remote_test_session(uuid, timestamptz)
from public, anon;

grant execute
on function public.start_remote_test_session(uuid, timestamptz)
to authenticated, service_role;

grant execute
on function public.save_remote_test_item(
  uuid,
  jsonb,
  text,
  text,
  timestamptz
)
to authenticated, service_role;

grant execute
on function public.complete_remote_test_session(uuid, timestamptz)
to authenticated, service_role;

-- These tables are all private application state. RLS remains enabled, but
-- anonymous clients no longer receive a table-level capability at all.
revoke all privileges on table public.athletes from anon;
revoke all privileges on table public.coach_link_requests from anon;
revoke all privileges on table public.exercise_test_targets from anon;
revoke all privileges on table public.test_attempts from anon;
revoke all privileges on table public.test_result_corrections from anon;
revoke all privileges on table public.test_session_items from anon;
