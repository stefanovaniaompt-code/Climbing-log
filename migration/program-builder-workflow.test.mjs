import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const cloneSql = readFileSync(new URL('../supabase/migrations/20260930120000_clone_training_week.sql', import.meta.url), 'utf8')
const workflowSql = readFileSync(new URL('../supabase/migrations/20261002120000_program_builder_workflow.sql', import.meta.url), 'utf8')

test('clone week is atomic and copies sessions plus exercises', () => {
  for (const token of ['pg_advisory_xact_lock', 'insert into public.training_weeks', 'insert into public.sessions', 'insert into public.session_exercises', 'prescription', 'calculation_context', 'coach_notes']) assert.match(cloneSql, new RegExp(token))
  assert.match(workflowSql, /source_week\.load_type/)
  assert.match(workflowSql, /insert into public\.exercise_test_targets/)
  assert.match(workflowSql, /cloned_exercise_id/)
})

test('builder extension keeps RLS and cascade ownership', () => {
  assert.match(workflowSql, /references public\.programs\(id\) on delete cascade/)
  assert.match(workflowSql, /enable row level security/)
  assert.match(workflowSql, /private\.can_manage_program\(program_id\)/)
  assert.match(workflowSql, /security invoker/)
  assert.match(workflowSql, /adjust_prescription_loads/)
})
