import { describe, expect, it } from 'vitest'
import { buildTrendSeries, type TrendResult } from './trends'

const result = (id: string, testedAt: string, value: number, status: TrendResult['qualityStatus'] = 'VALID'): TrendResult => ({ id, testedAt, primaryValue: value, unit: 'N', side: 'left', grip: 'half-crimp', protocolKey: 'peak_force', protocolVersion: '1.0', qualityStatus: status, metricKey: 'peak_n' })

describe('generic test trends', () => {
  it('orders by date and excludes invalid/review results', () => {
    const series = buildTrendSeries([result('new', '2026-03-01', 420), result('invalid', '2026-04-01', 999, 'INVALID'), result('old', '2026-01-01', 400), result('review', '2026-05-01', 800, 'REVIEW')])[0]
    expect(series.points.map(point => point.id)).toEqual(['old', 'new'])
    expect(series.latest.id).toBe('new')
    expect(series.pb.id).toBe('new')
    expect(series.delta).toBe(20)
  })
  it('never mixes protocol versions', () => {
    const nextVersion = { ...result('v2', '2026-04-01', 450), protocolVersion: '2.0' }
    expect(buildTrendSeries([result('v1', '2026-01-01', 400), nextVersion])).toHaveLength(2)
  })
})
