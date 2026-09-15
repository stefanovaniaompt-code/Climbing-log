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
  it('uses kilograms as the clinical MVC outcome while retaining raw Newtons', () => {
    const result = computeAcquisitionMetrics(samples, { protocolKey: 'live_mvc_half_crimp', protocolVersion: '2.0', bodyWeightKg: 50, side: 'right', grip: 'half_crimp' })
    expect(result.key).toBe('mvc_kg')
    expect(result.unit).toBe('kg')
    expect(result.value).toBeCloseTo(400 / 9.80665)
    expect(result.metrics.peak_n).toBe(400)
  })

  it('stores the MVC snapshot and 60 percent target with endurance time', () => {
    const targetN = 100
    const enduranceSamples = [100, 100, 80, 80, 80, 80, 80].map((forceN, index) => ({ forceN, timestampMicros: index * 1_000_000, sourceForceKgf: forceN / 9.80665, unit: 'N' as const }))
    const result = computeAcquisitionMetrics(enduranceSamples, { protocolKey: 'live_endurance_open_hand', protocolVersion: '2.0', bodyWeightKg: null, side: 'right', grip: 'open_hand', targetN, targetKg: 10.2, mvcUsedKg: 17, targetTolerancePercent: 0.05 })
    expect(result.key).toBe('time_to_failure')
    expect(result.value).toBe(6)
    expect(result.metrics.mvc_used_kg).toBe(17)
    expect(result.metrics.target_kg).toBe(10.2)
  })
  it('uses peak kilograms divided by actual onset-to-peak time for clinical RFD', () => {
    const rfdSamples = [0, 0, 0, 0, 0, 0, 30, 40, 50, 60, 70, 80, 90, 98.0665].map((forceN, index) => ({ forceN, timestampMicros: index * 100_000, sourceForceKgf: forceN / 9.80665, unit: 'N' as const }))
    const result = computeAcquisitionMetrics(rfdSamples, { protocolKey: 'live_rfd_open_hand', protocolVersion: '2.0', bodyWeightKg: null, side: 'left', grip: 'open_hand' })
    expect(result.key).toBe('rfd_average_kg_s')
    expect(result.unit).toBe('kg/s')
    expect(result.value).toBeCloseTo(10 / 0.7)
    expect(result.metrics.force_onset_timestamp_micros).toBe(600_000)
    expect(result.metrics.peak_timestamp_micros).toBe(1_300_000)
  })
})
