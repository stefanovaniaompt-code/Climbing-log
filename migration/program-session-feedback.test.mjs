import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = new URL('../supabase/migrations/20260923082845_add_program_type_and_session_feedback.sql', import.meta.url)

test('migration adds program type and session feedback constraints without changing RLS', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /program_type text not null default 'athlete'/i)
  assert.match(sql, /program_type in \('athlete', 'patient'\)/i)
  assert.match(sql, /pain_vas is null or pain_vas between 1 and 10/i)
  assert.match(sql, /pain_exercise_id[\s\S]*references public\.session_exercises\(id\)/i)
  assert.match(sql, /completion_outcome in \('completed', 'partial', 'not_completed'\)/i)
  assert.doesNotMatch(sql, /security definer/i)
  assert.doesNotMatch(sql, /create policy|drop policy|alter policy/i)
})
