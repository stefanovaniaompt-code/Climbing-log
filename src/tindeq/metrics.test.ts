import { describe, expect, it } from 'vitest'
import { asymmetryPercent, criticalForce, detectOnset, detectRepeaters, forceUnits, impulse, peakForce, rfdMetrics, selectBestValidAttempt, timeToTaskFailure } from './metrics'

const curve = (forces: number[], stepMs = 50) => forces.map((forceN, index) => ({ forceN, timestampMicros: index * stepMs * 1000 }))

describe('Tindeq metrics engine', () => {
  it('computes peak, BW normalisation, impulse and asymmetry', () => {
    const points = curve([0, 100, 200], 1000)
    expect(peakForce(points).value).toBe(200)
    expect(impulse(points)).toBe(200)
    expect(forceUnits.newtonsToPercentBodyWeight(490.3325, 50)).toBeCloseTo(100)
    expect(forceUnits.newtonsToNkg(500, 50)).toBe(10)
    expect(asymmetryPercent(80, 100)).toBe(20)
  })

  it('detects a sustained onset and calculates configurable RFD windows', () => {
    const points = curve([0, 0, 0, 25, 50, 75, 100, 125], 50)
    const onset = detectOnset(points, { baselineDurationMs: 100, minimumForceN: 20, sustainedMs: 50 })
    expect(onset).toBe(3)
    const metrics = rfdMetrics(points, { baselineDurationMs: 100, minimumForceN: 20, sustainedMs: 50 }, [50, 200])
    expect(metrics.byWindow[50]).toBeCloseTo(500)
    expect(metrics.byWindow[200]).toBeCloseTo(500)
  })

  it('calculates time-to-failure after the grace window', () => {
    const points = curve([100, 100, 70, 70, 70, 70], 500)
    expect(timeToTaskFailure(points, 100, 0.8, 1000)).toBe(1)
  })

  it('recognises repeater contractions and their validity', () => {
    const points = curve([0, 100, 100, 100, 0, 0, 90, 90, 90, 0], 500)
    const reps = detectRepeaters(points, 100, { minimumWorkMs: 900, targetTolerancePercent: 0.15 })
    expect(reps).toHaveLength(2)
    expect(reps.map(rep => rep.valid)).toEqual([true, true])
  })

  it('fits Critical Force and W-prime', () => {
    const result = criticalForce([{ durationSeconds: 5, workJoules: 150 }, { durationSeconds: 10, workJoules: 250 }, { durationSeconds: 20, workJoules: 450 }])
    expect(result?.criticalForceN).toBeCloseTo(20)
    expect(result?.wPrimeJ).toBeCloseTo(50)
  })

  it('excludes REVIEW and INVALID from best attempt', () => {
    const best = selectBestValidAttempt([{ qualityStatus: 'INVALID' as const, primaryValue: 500 }, { qualityStatus: 'REVIEW' as const, primaryValue: 450 }, { qualityStatus: 'VALID' as const, primaryValue: 420 }])
    expect(best?.primaryValue).toBe(420)
  })
})
