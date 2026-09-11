import { describe, expect, it } from 'vitest'
import { computeAcquisitionMetrics } from './acquisition'

const samples = [0, 100, 200, 300, 400].map((forceN, index) => ({ forceN, timestampMicros: index * 100_000, sourceForceKgf: forceN / 9.80665, unit: 'N' as const }))

describe('acquisition metrics dispatch', () => {
  it('uses BW recorded at test for peak force primary outcome', () => {
    const result = computeAcquisitionMetrics(samples, { protocolKey: 'peak_force', protocolVersion: '1.0', bodyWeightKg: 50, side: 'right', grip: '20mm' })
    expect(result.key).toBe('peak_nkg')
    expect(result.value).toBe(8)
  })
  it('keeps free measurement outside primary trends', () => {
    const result = computeAcquisitionMetrics(samples, { protocolKey: 'free_measurement', protocolVersion: '1.0', bodyWeightKg: null, side: null, grip: '' })
    expect(result.key).toBeNull()
    expect(result.metrics.peak_n).toBe(400)
  })
})
