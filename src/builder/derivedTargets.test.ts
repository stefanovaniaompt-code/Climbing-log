import { describe, expect, it } from 'vitest'
import { calculateDerivedTarget, chooseTestReference, hasNewerTest, type TestOutcomeReference } from './derivedTargets'

const old: TestOutcomeReference = { resultId: 'old', metricKey: 'peak_n', value: 400, unit: 'N', testedAt: '2026-01-01', side: 'left', grip: 'half-crimp', bodyWeightKg: 70 }
const latest: TestOutcomeReference = { ...old, resultId: 'new', value: 420, testedAt: '2026-02-01' }

describe('derived exercise targets', () => {
  it('chooses latest, PB or a locked result explicitly', () => {
    expect(chooseTestReference([old, latest], 'latest_valid')?.resultId).toBe('new')
    expect(chooseTestReference([old, { ...latest, value: 390 }], 'personal_best')?.resultId).toBe('old')
    expect(chooseTestReference([old, latest], 'specific_result', 'old')?.resultId).toBe('old')
  })
  it('calculates and locks an 80% target', () => {
    expect(calculateDerivedTarget(latest, 80).calculatedTarget).toBe(336)
  })
  it('converts total pull-up load to external load', () => {
    const pullup = { ...latest, value: 100, unit: 'kg_total', bodyWeightKg: 70 }
    expect(calculateDerivedTarget(pullup, 80, { prescriptionUnit: 'kg_external' }).calculatedTarget).toBe(10)
  })
  it('signals a newer result without mutating the locked target', () => {
    const locked = calculateDerivedTarget(old, 75)
    expect(hasNewerTest(locked, [latest])).toBe(true)
    expect(locked.resultId).toBe('old')
  })
})
