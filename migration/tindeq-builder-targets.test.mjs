import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const sql =
  readFileSync(
    'supabase/migrations/20260912150000_builder_test_targets.sql',
    'utf8',
  )

test(
  'builder targets store the full source snapshot',
  () => {
    assert.match(
      sql,
      /source_metric_label text/,
    )

    assert.match(
      sql,
      /source_protocol_key text/,
    )

    assert.match(
      sql,
      /source_protocol_version text/,
    )

    assert.match(
      sql,
      /source_setup jsonb/,
    )

    assert.match(
      sql,
      /source_measured_at timestamptz/,
    )
  },
)

test(
  'builder targets store multiple set prescriptions',
  () => {
    assert.match(
      sql,
      /set_targets jsonb/,
    )

    assert.match(
      sql,
      /jsonb_array_length/,
    )

    assert.match(
      sql,
      /exercise_test_targets_set_targets_check/,
    )
  },
)

test(
  'legacy single target rows are backfilled into a one-set snapshot',
  () => {
    assert.match(
      sql,
      /jsonb_build_array/,
    )

    assert.match(
      sql,
      /'setNumber'/,
    )

    assert.match(
      sql,
      /percentage/,
    )

    assert.match(
      sql,
      /calculated_target/,
    )
  },
)
