export type TestAthlete = { id: string; name: string }
export type TestSessionRecord = { id: string; athleteId: string; coachId: string | null; testedAt: string; createdAt: string; bodyWeightKg: number | null; protocolVersion: string; context: Record<string, unknown>; notes: string }
export type TestResultRecord = { id: string; testSessionId: string; metricKey: string; metricLabel: string; value: number; unit: string; side: 'left' | 'right' | 'bilateral' | null; grip: string; normalizeToBodyWeight: boolean; setup: Record<string, unknown>; notes: string }
export type TestData = { source: 'demo' | 'legacy-v1'; athletes: TestAthlete[]; sessions: TestSessionRecord[]; results: TestResultRecord[] }
export type TestMetricInput = Omit<TestResultRecord, 'id' | 'testSessionId'>
export type TestInput = { athleteId: string; testedAt: string; bodyWeightKg: number | null; protocolVersion: string; context: Record<string, unknown>; notes: string; metrics: TestMetricInput[] }

export type MetricComparison = {
  key: string
  label: string
  side: TestResultRecord['side']
  grip: string
  unit: string
  latest: number
  previous: number | null
  delta: number | null
  percent: number | null
  normalized: number | null
  comparable: boolean
  reason: string | null
}

const stableJson = (value: Record<string, unknown>) => JSON.stringify(Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => { result[key] = value[key]; return result }, {}))
const seriesKey = (result: TestResultRecord) => [result.metricKey, result.side ?? '', result.grip, result.unit].join('|')

export function validateTest(input: TestInput) {
  if (!input.athleteId) return 'Seleziona un atleta.'
  if (!input.testedAt) return 'Inserisci la data del test.'
  if (!input.protocolVersion.trim()) return 'Indica il protocollo usato.'
  if (input.bodyWeightKg !== null && input.bodyWeightKg <= 0) return 'Il peso corporeo deve essere maggiore di zero.'
  if (!input.metrics.length) return 'Aggiungi almeno una misura.'
  for (const metric of input.metrics) {
    if (!metric.metricKey.trim() || !metric.metricLabel.trim()) return 'Ogni misura deve avere nome e chiave.'
    if (!Number.isFinite(metric.value)) return `Inserisci un valore valido per ${metric.metricLabel || 'la misura'}.`
    if (!metric.unit.trim()) return `Indica l’unità di ${metric.metricLabel}.`
  }
  return null
}

export function buildComparisons(data: TestData, athleteId: string): MetricComparison[] {
  const sessions = data.sessions.filter(session => session.athleteId === athleteId).sort((a, b) => b.testedAt.localeCompare(a.testedAt) || b.createdAt.localeCompare(a.createdAt))
  const sessionById = new Map(sessions.map(session => [session.id, session]))
  const grouped = new Map<string, TestResultRecord[]>()
  for (const result of data.results) {
    if (!sessionById.has(result.testSessionId)) continue
    const key = seriesKey(result)
    grouped.set(key, [...(grouped.get(key) ?? []), result])
  }
  return [...grouped.entries()].map(([key, results]) => {
    const ordered = results.sort((a, b) => {
      const aSession = sessionById.get(a.testSessionId)!
      const bSession = sessionById.get(b.testSessionId)!
      return bSession.testedAt.localeCompare(aSession.testedAt) || bSession.createdAt.localeCompare(aSession.createdAt)
    })
    const latest = ordered[0]
    const previous = ordered[1]
    const latestSession = sessionById.get(latest.testSessionId)!
    const previousSession = previous ? sessionById.get(previous.testSessionId)! : null
    const comparable = Boolean(previous && previousSession && latestSession.protocolVersion === previousSession.protocolVersion && stableJson(latest.setup) === stableJson(previous.setup))
    const delta = comparable && previous ? latest.value - previous.value : null
    return {
      key, label: latest.metricLabel, side: latest.side, grip: latest.grip, unit: latest.unit,
      latest: latest.value, previous: previous?.value ?? null, delta,
      percent: delta !== null && previous && previous.value !== 0 ? delta / Math.abs(previous.value) * 100 : null,
      normalized: latest.normalizeToBodyWeight && latestSession.bodyWeightKg ? latest.value / latestSession.bodyWeightKg : null,
      comparable,
      reason: !previous ? 'Serve un retest' : comparable ? null : 'Protocollo o setup differente',
    }
  }).sort((a, b) => a.label.localeCompare(b.label, 'it'))
}

export function calculateAsymmetry(comparisons: MetricComparison[]) {
  const groups = new Map<string, Partial<Record<'left' | 'right', MetricComparison>>>()
  for (const item of comparisons) {
    if (item.side !== 'left' && item.side !== 'right') continue
    const key = [item.label, item.grip, item.unit].join('|')
    groups.set(key, { ...(groups.get(key) ?? {}), [item.side]: item })
  }
  return [...groups.entries()].flatMap(([key, pair]) => {
    if (!pair.left || !pair.right) return []
    const maximum = Math.max(Math.abs(pair.left.latest), Math.abs(pair.right.latest))
    return [{ key, label: pair.left.label, grip: pair.left.grip, percent: maximum ? Math.abs(pair.left.latest - pair.right.latest) / maximum * 100 : 0, weakerSide: pair.left.latest < pair.right.latest ? 'Sinistra' : pair.right.latest < pair.left.latest ? 'Destra' : 'Bilanciato' }]
  })
}

export function metricHistory(data: TestData, athleteId: string, comparisonKey: string) {
  const sessionById = new Map(data.sessions.filter(session => session.athleteId === athleteId).map(session => [session.id, session]))
  return data.results.filter(result => sessionById.has(result.testSessionId) && seriesKey(result) === comparisonKey).map(result => ({ date: sessionById.get(result.testSessionId)!.testedAt, value: result.value })).sort((a, b) => a.date.localeCompare(b.date))
}
