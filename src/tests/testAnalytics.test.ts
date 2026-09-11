import { describe, expect, it } from 'vitest'
import { buildComparisons, calculateAsymmetry, validateTest, type TestData } from './testAnalytics'

const data: TestData = {
  source: 'demo', athletes: [{ id: 'a', name: 'Ada' }],
  sessions: [
    { id: 'new', athleteId: 'a', coachId: 'c', testedAt: '2026-09-01', createdAt: '2026-09-01T10:00:00Z', bodyWeightKg: 60, protocolVersion: 'BL-1', context: {}, notes: '' },
    { id: 'old', athleteId: 'a', coachId: 'c', testedAt: '2026-06-01', createdAt: '2026-06-01T10:00:00Z', bodyWeightKg: 60, protocolVersion: 'BL-1', context: {}, notes: '' },
  ],
  results: [
    { id: '1', testSessionId: 'new', metricKey: 'peak_force', metricLabel: 'Forza picco', value: 48, unit: 'kg', side: 'right', grip: '20 mm', normalizeToBodyWeight: true, setup: { posture: 'seated' }, notes: '' },
    { id: '2', testSessionId: 'old', metricKey: 'peak_force', metricLabel: 'Forza picco', value: 40, unit: 'kg', side: 'right', grip: '20 mm', normalizeToBodyWeight: true, setup: { posture: 'seated' }, notes: '' },
    { id: '3', testSessionId: 'new', metricKey: 'peak_force', metricLabel: 'Forza picco', value: 45, unit: 'kg', side: 'left', grip: '20 mm', normalizeToBodyWeight: true, setup: { posture: 'seated' }, notes: '' },
  ],
}

describe('test analytics', () => {
  it('calcola delta e normalizzazione solo tra protocolli coerenti', () => {
    const result = buildComparisons(data, 'a').find(item => item.side === 'right')!
    expect(result.delta).toBe(8)
    expect(result.percent).toBe(20)
    expect(result.normalized).toBe(.8)
  })
  it('calcola l’asimmetria sul valore più alto', () => expect(calculateAsymmetry(buildComparisons(data, 'a'))[0].percent).toBeCloseTo(6.25))
  it('blocca un test senza misure', () => expect(validateTest({ athleteId: 'a', testedAt: '2026-09-01', bodyWeightKg: null, protocolVersion: 'P1', context: {}, notes: '', metrics: [] })).toContain('misura'))
  it('segnala setup non confrontabili', () => {
    const changed = structuredClone(data)
    changed.results[1].setup = { posture: 'standing' }
    expect(buildComparisons(changed, 'a').find(item => item.side === 'right')?.comparable).toBe(false)
  })
})
