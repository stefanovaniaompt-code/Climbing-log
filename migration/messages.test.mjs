import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = new URL('../supabase/migrations/20260924045200_add_messages.sql', import.meta.url)

test('messages migration secures participants, immutable content and realtime', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /create table public\.messages/i)
  assert.match(sql, /foreign key \(coach_id, athlete_id\)[\s\S]*references public\.coach_athletes/i)
  assert.match(sql, /alter table public\.messages enable row level security/i)
  assert.match(sql, /sender_user_id = \(select auth\.uid\(\)\)/i)
  assert.match(sql, /private\.current_athlete_id\(\)/i)
  assert.match(sql, /private\.is_coach_of\(athlete_id\)/i)
  assert.match(sql, /grant update \(read_at\) on public\.messages to authenticated/i)
  assert.doesNotMatch(sql, /grant update on public\.messages/i)
  assert.doesNotMatch(sql, /for delete/i)
  assert.match(sql, /alter publication supabase_realtime add table public\.messages/i)
  assert.doesNotMatch(sql, /security definer/i)
})

test('implementation contains no LLM integration', async () => {
  const files = await Promise.all([
    readFile(new URL('../src/feedback/coachFeedbackRepository.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/messaging/messageRepository.ts', import.meta.url), 'utf8'),
  ])
  assert.doesNotMatch(files.join('\n'), /openai|anthropic|claude|gemini|\bllm\b/i)
})

test('athlete coach lookup uses the production profiles columns', async () => {
  const source = await readFile(new URL('../src/messaging/messageRepository.ts', import.meta.url), 'utf8')
  assert.match(source, /from\('profiles'\)\.select\('id,full_name'\)\.in\('id', ids\)/)
  assert.doesNotMatch(source, /user_id,display_name/)
})
