import assert from 'node:assert/strict'
import { test } from 'node:test'
import { intentionalAthleteGuidance, previewLegacyIntentionalProgression, readIntentionalLoadPlan, resolveIntentionalSetRows, validateIntentionalLoadPlan } from '../prescriptions/intentionalBlockLoad.ts'

test('percentuali e ripetizioni per cinque serie', () => {
  const prescription = {
    sets: 5,
    intentionalLoad: { version: 1, mode: 'percentage', source: { type: 'manual_max', maxKg: 27 } },
    steps: [
      { reps: 10, percentage: 60 },
      { reps: 8, percentage: 65 },
      { reps: 6, percentage: 70 },
      { reps: 4, percentage: 80 },
      { reps: 3, percentage: 86 },
    ],
  }
  assert.deepEqual(resolveIntentionalSetRows(prescription).map(row => [row.reps, row.calculatedKg]), [
    [10, 16], [8, 17.5], [6, 19], [4, 21.5], [3, 23],
  ])
})

test('non converte automaticamente una prescrizione storica', () => {
  const legacy = { sets: 1, instructions: 'Serie 1: 10 ripetizioni al 60%' }
  assert.equal(readIntentionalLoadPlan(legacy), null)
  assert.deepEqual(resolveIntentionalSetRows(legacy), [])
})

test('non salva serie incomplete', () => {
  assert.match(validateIntentionalLoadPlan({
    sets: 2,
    intentionalLoad: { version: 1, mode: 'percentage', source: { type: 'manual_max', maxKg: 27 } },
    steps: [{ reps: 10, percentage: 60 }, { reps: 0, percentage: null }],
  }) ?? '', /ripetizioni/)
})

test("l'importazione delle sei sequenze storiche è solo un’anteprima", () => {
  const instructions = 'RPE 8–9/10. Carichi calcolati sul massimale di 27 kg e arrotondati a 0,5 kg.\n\n10 rep 60%\n8 rep 65%\n6 rep 70%\n4 rep 80%\n3 rep 86%'
  assert.deepEqual(previewLegacyIntentionalProgression(instructions), {
    maxKg: 27,
    rows: [
      { reps: 10, percentage: 60 }, { reps: 8, percentage: 65 },
      { reps: 6, percentage: 70 }, { reps: 4, percentage: 80 },
      { reps: 3, percentage: 86 },
    ],
  })
  assert.equal(previewLegacyIntentionalProgression('Aumentare del 5% rispetto alla seduta precedente'), null)
})

test('il carico da test conserva l’unità originale e non usa un target storico', () => {
  const prescription = {
    sets: 2,
    intentionalLoad: { version: 1, mode: 'percentage', source: {
      type: 'athlete_test', resultId: 'test-1', metricLabel: 'Forza', measuredAt: '2026-10-01',
      value: 40, unit: 'kg_external',
    } },
    steps: [{ reps: 8, percentage: 60 }, { reps: 5, percentage: 80 }],
  }
  assert.deepEqual(resolveIntentionalSetRows(prescription).map(row => [row.reps, row.calculatedKg, row.unit]), [
    [8, 24, 'kg esterni'], [5, 32, 'kg esterni'],
  ])
  assert.equal(validateIntentionalLoadPlan(prescription), null)
})

test('i kg manuali restano indipendenti dalle percentuali precedenti', () => {
  const prescription = {
    sets: 2,
    intentionalLoad: { version: 1, mode: 'manual_kg' },
    steps: [{ reps: 10, loadKg: 15, percentage: 80 }, { reps: 3, loadKg: 23, percentage: 80 }],
  }
  assert.deepEqual(resolveIntentionalSetRows(prescription).map(row => [row.reps, row.manualKg, row.percentage]), [
    [10, 15, null], [3, 23, null],
  ])
  assert.equal(validateIntentionalLoadPlan(prescription), null)
})

test('la vista atleta non duplica le vecchie righe ma conserva le note tecniche', () => {
  const instructions = 'RPE 8–9/10. Carichi calcolati sul massimale di 27 kg.\n10 rep 60%\n3 rep 86%\nSpalle attive.'
  assert.equal(intentionalAthleteGuidance({ intentionalLoad: { version: 1, mode: 'manual_kg' } }, instructions), 'RPE 8–9/10.\nSpalle attive.')
  assert.equal(intentionalAthleteGuidance({}, instructions, true), 'RPE 8–9/10.\nSpalle attive.')
  assert.equal(intentionalAthleteGuidance({}, instructions), instructions)
  assert.equal(intentionalAthleteGuidance({}, 'Aumentare del 5% rispetto alla seduta precedente'), 'Aumentare del 5% rispetto alla seduta precedente')
})
