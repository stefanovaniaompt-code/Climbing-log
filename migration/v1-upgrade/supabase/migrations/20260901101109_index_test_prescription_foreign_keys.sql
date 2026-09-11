
create index if not exists test_plan_items_test_library_idx
  on public.test_plan_items(test_library_id);
create index if not exists test_plans_athlete_idx
  on public.test_plans(athlete_id);
create index if not exists test_plans_coach_idx
  on public.test_plans(coach_id);
;
