import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildDryRunPlan, validateLegacyBackup } from './validate-v1.mjs'

test('valida e conta un backup V1 rappresentativo', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/legacy-v1.sample.json', import.meta.url), 'utf8'))
  const result = buildDryRunPlan(fixture)

  assert.equal(result.valid, true)
  assert.deepEqual(result.counts, { weeks: 2, exercises: 3, completedExercises: 2, sets: 6, anaerobicSets: 2, routes: 2 })
  assert.equal(result.staging.trainingWeeks.length, 2)
  assert.equal(result.staging.exerciseLogs.length, 3)
  assert.match(result.checksum, /^[a-f0-9]{64}$/)
})

test('genera gli stessi identificatori e checksum a ogni dry-run', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/legacy-v1.sample.json', import.meta.url), 'utf8'))
  const first = buildDryRunPlan(fixture)
  const second = buildDryRunPlan(fixture)

  assert.equal(first.checksum, second.checksum)
  assert.equal(first.staging.exerciseLogs[0].legacyId, second.staging.exerciseLogs[0].legacyId)
})

test('blocca backup strutturalmente non valido', () => {
  const result = validateLegacyBackup({ settings: [], weeks: 'nope' })
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('weeks deve essere un array.'))
  assert.ok(result.errors.includes('settings deve essere un oggetto.'))
})
