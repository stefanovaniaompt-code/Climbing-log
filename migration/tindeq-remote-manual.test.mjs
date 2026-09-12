import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const sql =
  readFileSync(
    'supabase/migrations/20260912130000_remote_manual_test_workflow.sql',
    'utf8',
  )

test(
  'remote items persist draft values, notes and completion time',
  () => {
    assert.match(
      sql,
      /draft_values jsonb/,
    )

    assert.match(
      sql,
      /athlete_notes text/,
    )

    assert.match(
      sql,
      /completed_at timestamptz/,
    )
  },
)

test(
  'remote results keep item provenance',
  () => {
    assert.match(
      sql,
      /test_session_item_id uuid/,
    )

    assert.match(
      sql,
      /test_results_manual_item_metric_idx/,
    )
  },
)

test(
  'coach edit permission is narrower than read access',
  () => {
    assert.match(
      sql,
      /create or replace function private\.can_edit_test_session/,
    )

    assert.match(
      sql,
      /ts\.coach_id = \(select auth\.uid\(\)\)/,
    )
  },
)

test(
  'athlete execution uses narrow remote RPCs',
  () => {
    assert.match(
      sql,
      /start_remote_test_session/,
    )

    assert.match(
      sql,
      /save_remote_test_item/,
    )

    assert.match(
      sql,
      /complete_remote_test_session/,
    )

    assert.match(
      sql,
      /v_session\.mode <> 'remote'/,
    )
  },
)

test(
  'official results are created only on completed manual items',
  () => {
    assert.match(
      sql,
      /if p_status <> 'completed'/,
    )

    assert.match(
      sql,
      /insert into public\.test_results/,
    )

    assert.match(
      sql,
      /'manual'/,
    )

    assert.match(
      sql,
      /'VALID'/,
    )
  },
)

test(
  'final submission rejects unfinished tests',
  () => {
    assert.match(
      sql,
      /item\.status not in \('completed', 'skipped'\)/,
    )
  },
)
