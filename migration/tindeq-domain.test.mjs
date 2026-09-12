import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sql = readFileSync(
  'supabase/migrations/20260912113000_enforce_single_selected_test_attempt.sql',
  'utf8',
)

test(
  'Tindeq domain migration enforces one selected attempt per item',
  () => {
    assert.match(
      sql,
      /create unique index if not exists\s+test_attempts_one_selected_per_item_idx/i,
    )

    assert.match(
      sql,
      /where\s+test_session_item_id is not null\s+and is_selected = true/i,
    )
  },
)

test(
  'selection RPC is security invoker and rejects INVALID attempts',
  () => {
    assert.match(
      sql,
      /create or replace function public\.select_test_attempt/i,
    )

    assert.match(
      sql,
      /security invoker/i,
    )

    assert.match(
      sql,
      /target_quality = 'INVALID'/i,
    )

    assert.match(
      sql,
      /set is_selected = false/i,
    )

    assert.match(
      sql,
      /set is_selected = true/i,
    )
  },
)

test(
  'selection RPC is exposed only to authenticated users',
  () => {
    assert.match(
      sql,
      /revoke all[\s\S]*from public/i,
    )

    assert.match(
      sql,
      /grant execute[\s\S]*to authenticated/i,
    )
  },
)
