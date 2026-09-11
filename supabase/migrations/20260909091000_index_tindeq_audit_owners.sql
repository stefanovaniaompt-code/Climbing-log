create index if not exists test_attempts_created_by_idx on public.test_attempts (created_by);
create index if not exists test_result_corrections_corrected_by_idx on public.test_result_corrections (corrected_by);
create index if not exists exercise_test_targets_created_by_idx on public.exercise_test_targets (created_by);
