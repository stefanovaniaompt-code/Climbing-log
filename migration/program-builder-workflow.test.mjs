import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const cloneSql = readFileSync(new URL('../supabase/migrations/20260930120000_clone_training_week.sql', import.meta.url), 'utf8')
const workflowSql = readFileSync(new URL('../supabase/migrations/20261002120000_program_builder_workflow.sql', import.meta.url), 'utf8')
const renumberSql = readFileSync(new URL('../supabase/migrations/20261007120000_renumber_weeks_after_deletion.sql', import.meta.url), 'utf8')

test('clone week is atomic and copies sessions plus exercises', () => {
  for (const token of ['pg_advisory_xact_lock', 'insert into public.training_weeks', 'insert into public.sessions', 'insert into public.session_exercises', 'prescription', 'calculation_context', 'coach_notes']) assert.match(cloneSql, new RegExp(token))
  assert.match(workflowSql, /source_week\.load_type/)
  assert.match(workflowSql, /insert into public\.exercise_test_targets/)
  assert.match(workflowSql, /cloned_exercise_id/)
  assert.match(workflowSql, /set_targets/)
})

test('deleting a week atomically renumbers remaining weeks without unique-key collisions', () => {
  assert.match(renumberSql, /security invoker/)
  assert.match(renumberSql, /private\.can_manage_week\(tw\.id\)/)
  assert.match(renumberSql, /pg_catalog\.pg_advisory_xact_lock/)
  assert.match(renumberSql, /set week_number = tw\.week_number \+ max_week_number/)
  assert.match(renumberSql, /row_number\(\) over \(order by tw\.week_number - max_week_number\)/)
  assert.match(renumberSql, /revoke all on function public\.delete_training_week_and_renumber\(uuid\) from public, anon/)
  assert.ok(renumberSql.indexOf('delete from public.training_weeks') < renumberSql.indexOf('set week_number = tw.week_number + max_week_number'))
})

test('builder extension keeps RLS and cascade ownership', () => {
  assert.match(workflowSql, /references public\.programs\(id\) on delete cascade/)
  assert.match(workflowSql, /enable row level security/)
  assert.match(workflowSql, /private\.can_manage_program\(program_id\)/)
  assert.match(workflowSql, /security invoker/)
  assert.match(workflowSql, /adjust_prescription_loads/)
})
