import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sql = readFileSync(
  'supabase/migrations/20260914132311_remote_test_template_flow.sql',
  'utf8',
)

test('athletes can read templates through remote session items', () => {
  assert.match(sql, /from public\.test_session_items tsi/)
  assert.match(sql, /tsi\.test_library_id = test_library\.id/)
  assert.match(sql, /ts\.athlete_id = private\.current_athlete_id\(\)/)
})

test('remote RPC validates the assigned output schema', () => {
  assert.match(sql, /v_schema := v_item\.config->'outputSchema'/)
  assert.match(sql, /All required remote results must be completed/)
  assert.match(sql, /Remote repetitions must be integers/)
})

test('manual results preserve template and per-side provenance', () => {
  assert.match(sql, /test_session_item_id, test_library_id/)
  assert.match(sql, /coalesce\(nullif\(metric->>'side', ''\), v_item\.side\)/)
})

test('security definer RPC is not executable by anon', () => {
  assert.match(sql, /from public, anon/)
  assert.match(sql, /to authenticated, service_role/)
})
