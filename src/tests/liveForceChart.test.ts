import { describe, expect, it } from 'vitest'
import { buildLiveForceChart } from './liveForceChartModel'

describe('live force chart', () => {
  it('builds a target band at plus or minus ten percent', () => {
    const chart = buildLiveForceChart(
      [
        { elapsedSeconds: 0, forceN: 50 },
        { elapsedSeconds: 1, forceN: 60 },
      ],
      60,
    )

    expect(chart.lowerTargetN).toBe(54)
    expect(chart.upperTargetN).toBeCloseTo(66)
    expect(chart.inTarget).toBe(true)
    expect(chart.polyline).toContain('600.0')
  })

  it('marks force outside the target band', () => {
    const chart = buildLiveForceChart(
      [{ elapsedSeconds: 2, forceN: 40 }],
      60,
    )

    expect(chart.inTarget).toBe(false)
  })
})
