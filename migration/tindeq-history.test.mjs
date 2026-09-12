import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const sql =
  readFileSync(
    'supabase/migrations/20260912140000_test_result_measured_at.sql',
    'utf8',
  )

test(
  'test results receive a real measurement timestamp',
  () => {
    assert.match(
      sql,
      /measured_at timestamptz/,
    )

    assert.match(
      sql,
      /set_test_result_measured_at/,
    )

    assert.match(
      sql,
      /attempt\.ended_at/,
    )

    assert.match(
      sql,
      /item\.completed_at/,
    )
  },
)

test(
  'legacy results are backfilled',
  () => {
    assert.match(
      sql,
      /update public\.test_results/,
    )

    assert.match(
      sql,
      /where result\.measured_at is null/,
    )

    assert.match(
      sql,
      /alter column measured_at[\s\S]*set not null/,
    )
  },
)

test(
  'longitudinal history has supporting indexes',
  () => {
    assert.match(
      sql,
      /test_results_history_measured_at_idx/,
    )

    assert.match(
      sql,
      /test_results_longitudinal_idx/,
    )
  },
)
