import { describe, expect, it } from 'vitest'
import { readIntentionalLoadPlan, resolveIntentionalSetRows, validateIntentionalLoadPlan } from '../prescriptions/intentionalBlockLoad'

describe('Intentional Block Lifting: carico per serie', () => {
  const manualMax = {
    version: 1,
    mode: 'percentage',
    source: { type: 'manual_max', maxKg: 27 },
  } as const

  it('calcola cinque percentuali senza alterare le ripetizioni di ogni serie', () => {
    const prescription = {
      sets: 5,
      intentionalLoad: manualMax,
      steps: [
        { reps: 10, percentage: 60 },
        { reps: 8, percentage: 65 },
        { reps: 6, percentage: 70 },
        { reps: 4, percentage: 80 },
        { reps: 3, percentage: 86 },
      ],
    }
    expect(resolveIntentionalSetRows(prescription)).toMatchObject([
      { reps: 10, percentage: 60, calculatedKg: 16 },
      { reps: 8, percentage: 65, calculatedKg: 17.5 },
      { reps: 6, percentage: 70, calculatedKg: 19 },
      { reps: 4, percentage: 80, calculatedKg: 21.5 },
      { reps: 3, percentage: 86, calculatedKg: 23 },
    ])
  })

  it('non inventa percentuali o ripetizioni per i record storici', () => {
    const legacy = { sets: 1, instructions: 'Serie 1: 10 ripetizioni al 60%' }
    expect(readIntentionalLoadPlan(legacy)).toBeNull()
    expect(resolveIntentionalSetRows(legacy)).toEqual([])
  })

  it('rifiuta righe incomplete prima della persistenza', () => {
    expect(validateIntentionalLoadPlan({
      sets: 2,
      intentionalLoad: manualMax,
      steps: [{ reps: 10, percentage: 60 }, { reps: 0, percentage: null }],
    })).toContain('ripetizioni')
  })

  it('in kg manuali non usa percentuali o target test residui', () => {
    expect(resolveIntentionalSetRows({
      sets: 2,
      intentionalLoad: { version: 1, mode: 'manual_kg' },
      steps: [{ reps: 10, loadKg: 16 }, { reps: 8, loadKg: 17.5 }],
    })).toMatchObject([
      { reps: 10, manualKg: 16 },
      { reps: 8, manualKg: 17.5 },
    ])
  })
})
