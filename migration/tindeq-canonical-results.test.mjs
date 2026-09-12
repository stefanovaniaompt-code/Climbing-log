import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sql = readFileSync(
  'supabase/migrations/20260912120000_materialize_selected_test_results.sql',
  'utf8',
)

test(
  'canonical results are materialized atomically with attempt selection',
  () => {
    assert.match(
      sql,
      /create or replace function public\.materialize_test_attempt_results/i,
    )

    assert.match(
      sql,
      /security invoker/i,
    )

    assert.match(
      sql,
      /set is_selected = false/i,
    )

    assert.match(
      sql,
      /set is_selected = true/i,
    )

    assert.match(
      sql,
      /insert into public\.test_results/i,
    )
  },
)

test(
  'official results from the previous attempt of the same item are replaced',
  () => {
    assert.match(
      sql,
      /delete from public\.test_results tr[\s\S]*test_session_item_id[\s\S]*p_test_session_item_id/i,
    )

    assert.match(
      sql,
      /measurement_source[\s\S]*'tindeq'/i,
    )
  },
)

test(
  'canonical values must match values already stored on the acquisition attempt',
  () => {
    assert.match(
      sql,
      /secondary_metrics[\s\S]*metric_key/i,
    )

    assert.match(
      sql,
      /does not match the stored attempt value/i,
    )

    assert.match(
      sql,
      /Exactly one canonical primary metric is required/i,
    )
  },
)

test(
  'one official result exists per attempt and metric',
  () => {
    assert.match(
      sql,
      /create unique index if not exists\s+test_results_attempt_metric_idx/i,
    )

    assert.match(
      sql,
      /attempt_id,\s*metric_key/i,
    )
  },
)

test(
  'the old selection-only RPC is no longer executable by authenticated clients',
  () => {
    assert.match(
      sql,
      /revoke execute[\s\S]*select_test_attempt\(uuid, uuid\)[\s\S]*from authenticated/i,
    )

    assert.match(
      sql,
      /grant execute[\s\S]*materialize_test_attempt_results[\s\S]*to authenticated/i,
    )
  },
)
