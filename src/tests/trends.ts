import type { QualityStatus } from '../tindeq/metrics'

export type TrendResult = { id: string; testedAt: string; primaryValue: number; unit: string; side: string | null; grip: string; protocolKey: string; protocolVersion: string; qualityStatus: QualityStatus; metricKey: string }

export function buildTrendSeries(results: TrendResult[]) {
  const valid = results.filter(result => result.qualityStatus === 'VALID')
  const groups = new Map<string, TrendResult[]>()
  for (const result of valid) {
    const key = [result.protocolKey, result.protocolVersion, result.metricKey, result.unit, result.side ?? '', result.grip].join('|')
    groups.set(key, [...(groups.get(key) ?? []), result])
  }
  return [...groups.entries()].map(([key, values]) => {
    const points = values.sort((left, right) => left.testedAt.localeCompare(right.testedAt))
    const latest = points.at(-1)!
    const previous = points.at(-2)
    const pb = points.reduce((best, item) => item.primaryValue > best.primaryValue ? item : best)
    const delta = previous ? latest.primaryValue - previous.primaryValue : null
    return { key, points, latest, pb, delta, deltaPercent: delta !== null && previous!.primaryValue !== 0 ? delta / Math.abs(previous!.primaryValue) * 100 : null }
  })
}
