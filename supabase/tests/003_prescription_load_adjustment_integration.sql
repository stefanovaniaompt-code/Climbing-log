begin;
select plan(13);

select is(
  private.prescription_load_adjustment_report(
    '{"loadKg":50,"unit":"kg"}'::jsonb,
    '{"percentage_source":"one_rm","one_rm_kg":100}'::jsonb,
    1.1
  ),
  '{"value":{"loadKg":50,"unit":"kg"},"updated":0,"unscalable":1,"excluded":true,"reason":"test_derived"}'::jsonb,
  'percentage_source and one_rm_kg exclude test-derived loads'
);

select is(
  private.prescription_load_adjustment_report(
    '{"load_value":"30","unit":"kg"}'::jsonb,
    '{"load_basis":{"kind":"test_result","value":60}}'::jsonb,
    1.1
  ) ->> 'reason',
  'test_derived',
  'nested load_basis excludes loads whose recalculation is uncertain'
);

select is(
  private.prescription_load_adjustment_report(
    '{"loadKg":25,"unit":"kg"}'::jsonb,
    '{"test_target":{"set_targets":[{"percentage":50,"calculatedTarget":25,"targetUnit":"kg"}]}}'::jsonb,
    1.1
  ) -> 'value',
  '{"loadKg":25,"unit":"kg"}'::jsonb,
  'test target snapshots remain unchanged'
);

select is(
  private.prescription_load_adjustment_report('{"load_type":"not_applicable","load_value":"0"}'::jsonb, '{}'::jsonb, 1.1) ->> 'unscalable',
  '1',
  'not_applicable prescriptions are reported as excluded'
);

select is(
  private.prescription_load_adjustment_report('{"load_type":"bodyweight","load_value":"70","unit":"kg"}'::jsonb, '{}'::jsonb, 1.1) ->> 'unscalable',
  '1',
  'bodyweight prescriptions are reported as excluded'
);

select is(
  private.prescription_load_adjustment_report('{"load_type":"climbing_grade","load_value":"7a","unit":"french"}'::jsonb, '{}'::jsonb, 1.1) ->> 'unscalable',
  '1',
  'climbing grades are reported as excluded'
);

select is(
  private.prescription_load_adjustment_report('{"load_type":"test_percentage","load_value":"85","unit":"%"}'::jsonb, '{}'::jsonb, 1.1) ->> 'unscalable',
  '1',
  'percentages are reported as excluded'
);

select is(
  private.prescription_load_adjustment_report('{"loadKg":20,"unit":"kg"}'::jsonb, '{}'::jsonb, 1.1),
  '{"value":{"loadKg":22,"unit":"kg"},"updated":1,"unscalable":0}'::jsonb,
  'plain kilogram loads remain scalable'
);

select is(
  private.prescription_load_adjustment_report(
    '{"loadKg":20,"unit":"kg"}'::jsonb,
    '{"metadata":{"source_result_id":"11111111-1111-1111-1111-111111111111"}}'::jsonb,
    1.1
  ) ->> 'reason',
  'test_derived',
  'other nested source references are detected conservatively'
);

-- Exercise the real RPC against session_exercises. Authorization is replaced
-- only inside this rolled-back test transaction so the assertions focus on
-- prescription/calculation_context coordination rather than RLS fixtures.
create or replace function private.can_manage_session(target_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select true; $$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'consistency-test@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.programs (id, athlete_id, coach_id, name, status)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Consistency test', 'draft'
);

insert into public.training_weeks (id, program_id, week_number, status)
values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'planned');

insert into public.sessions (id, training_week_id, session_order, title, scheduled_day)
values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, 'Consistency session', 1);

insert into public.session_exercises (id, session_id, exercise_order, exercise_name, prescription, calculation_context)
values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 'Plain kg', '{"loadKg":20,"unit":"kg"}', '{}'),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 2, 'Derived one RM', '{"loadKg":50,"unit":"kg"}', '{"percentage_source":"one_rm","one_rm_kg":100}'),
  ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 3, 'Not applicable', '{"load_type":"not_applicable","load_value":"0"}', '{}'),
  ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', 4, 'Bodyweight', '{"load_type":"bodyweight","load_value":"70","unit":"kg"}', '{}'),
  ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000001', 5, 'Climbing grade', '{"load_type":"climbing_grade","load_value":"7a","unit":"french"}', '{}'),
  ('50000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000001', 6, 'Test percentage', '{"load_type":"test_percentage","load_value":"85","unit":"%"}', '{}'),
  ('50000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000001', 7, 'Derived target', '{"loadKg":25,"unit":"kg"}', '{"test_target":{"set_targets":[{"percentage":50,"calculatedTarget":25,"targetUnit":"kg"}]}}');

create temporary table rpc_result as
select public.adjust_prescription_loads_reported(
  'session',
  '40000000-0000-0000-0000-000000000001',
  10
) as value;

select is(
  (select value from rpc_result),
  '{"updatedRows":1,"unscalableRows":6,"unchangedRows":0,"partialRows":0}'::jsonb,
  'RPC reports updated and excluded session rows separately'
);

select is(
  (select prescription from public.session_exercises where id = '50000000-0000-0000-0000-000000000001'),
  '{"loadKg":22,"unit":"kg"}'::jsonb,
  'RPC scales a plain kilogram prescription'
);

select is(
  (select prescription from public.session_exercises where id = '50000000-0000-0000-0000-000000000002'),
  '{"loadKg":50,"unit":"kg"}'::jsonb,
  'RPC preserves a prescription derived from one RM'
);

select is(
  (select calculation_context from public.session_exercises where id = '50000000-0000-0000-0000-000000000007'),
  '{"test_target":{"set_targets":[{"percentage":50,"calculatedTarget":25,"targetUnit":"kg"}]}}'::jsonb,
  'RPC leaves calculation_context unchanged'
);

select * from finish();
rollback;
