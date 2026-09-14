import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { stageCiMigrations } from '../scripts/stage-ci-migrations.mjs'

const migrationPath =
  'supabase/migrations/20260913165149_harden_database_access.sql'
const sql = readFileSync(migrationPath, 'utf8')
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8')

test('athlete test policies resolve the application athlete identity', () => {
  assert.match(sql, /create policy test_library_select[\s\S]*private\.current_athlete_id\(\)/i)
  assert.match(sql, /create policy test_plan_items_select[\s\S]*private\.current_athlete_id\(\)/i)
  assert.doesNotMatch(sql, /tp\.athlete_id\s*=\s*\(select auth\.uid\(\)\)/i)
})

test('remote SECURITY DEFINER RPCs reject anonymous execution', () => {
  for (const routine of [
    'start_remote_test_session',
    'save_remote_test_item',
    'complete_remote_test_session',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `revoke all[\\s\\S]*?public\\.${routine}[\\s\\S]*?from public, anon`,
        'i',
      ),
    )
  }
})

test('private application tables expose no privileges to anon', () => {
  for (const table of [
    'athletes',
    'coach_link_requests',
    'exercise_test_targets',
    'test_attempts',
    'test_result_corrections',
    'test_session_items',
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all privileges on table public\\.${table} from anon`, 'i'),
    )
  }
})

test('CI stages every canonical migration newer than its isolated baseline', () => {
  const root = mkdtempSync(join(tmpdir(), 'climbing-coach-ci-migrations-'))
  const sourceDirectory = join(root, 'canonical')
  const targetDirectory = join(root, 'baseline')

  try {
    mkdirSync(sourceDirectory)
    mkdirSync(targetDirectory)
    writeFileSync(join(sourceDirectory, '20260912140000_existing.sql'), '-- old')
    writeFileSync(join(sourceDirectory, '20260913161938_realign.sql'), '-- new 1')
    writeFileSync(join(sourceDirectory, '20260913165149_harden.sql'), '-- new 2')
    writeFileSync(join(targetDirectory, '20260912150000_baseline.sql'), '-- baseline')

    const result = stageCiMigrations({ sourceDirectory, targetDirectory })

    assert.equal(result.latestBaselineVersion, '20260912150000')
    assert.deepEqual(result.staged, [
      '20260913161938_realign.sql',
      '20260913165149_harden.sql',
    ])
    assert.equal(existsSync(join(targetDirectory, '20260912140000_existing.sql')), false)
    assert.equal(
      readFileSync(join(targetDirectory, '20260913161938_realign.sql'), 'utf8'),
      '-- new 1',
    )
    assert.equal(
      readFileSync(join(targetDirectory, '20260913165149_harden.sql'), 'utf8'),
      '-- new 2',
    )
    assert.match(ciWorkflow, /node scripts\/stage-ci-migrations\.mjs/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
