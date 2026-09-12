import {
  buildComparisons,
  calculateAsymmetry,
  metricHistory,
  type MetricComparison,
  type TestData,
  type TestInput,
  type TestSessionRecord,
} from './testAnalytics'

export type TestCaptureSource =
  | 'manual'
  | 'tindeq'
  | 'imported'
  | 'unknown'

export type MetricHistoryPoint = {
  date: string
  left: number | null
  right: number | null
  bilateral: number | null
}

export type MetricSideBundle = {
  key: string
  metricKey: string
  label: string
  grip: string
  unit: string
  left: MetricComparison | null
  right: MetricComparison | null
  bilateral: MetricComparison | null
  points: MetricHistoryPoint[]
}

export type TestPresentation = {
  sessions: TestSessionRecord[]
  groups: MetricSideBundle[]
  asymmetries: ReturnType<typeof calculateAsymmetry>
  comparableSeries: number
  latestTestedAt: string | null
}

function groupKey(item: MetricComparison) {
  return [
    item.metricKey,
    item.grip,
    item.unit,
  ].join('|')
}

function mergeHistory(
  data: TestData,
  athleteId: string,
  group: Omit<MetricSideBundle, 'points'>,
): MetricHistoryPoint[] {
  const points = new Map<string, MetricHistoryPoint>()

  const add = (
    comparison: MetricComparison | null,
    side: 'left' | 'right' | 'bilateral',
  ) => {
    if (!comparison) return

    for (const point of metricHistory(
      data,
      athleteId,
      comparison.key,
    )) {
      const current = points.get(point.date) ?? {
        date: point.date,
        left: null,
        right: null,
        bilateral: null,
      }

      current[side] = point.value
      points.set(point.date, current)
    }
  }

  add(group.left, 'left')
  add(group.right, 'right')
  add(group.bilateral, 'bilateral')

  return [...points.values()].sort(
    (left, right) => left.date.localeCompare(right.date),
  )
}

export function buildTestPresentation(
  data: TestData,
  athleteId: string,
): TestPresentation {
  const comparisons = buildComparisons(data, athleteId)
  const groupMap = new Map<
    string,
    Omit<MetricSideBundle, 'points'>
  >()

  for (const comparison of comparisons) {
    const key = groupKey(comparison)
    const current = groupMap.get(key) ?? {
      key,
      metricKey: comparison.metricKey,
      label: comparison.label,
      grip: comparison.grip,
      unit: comparison.unit,
      left: null,
      right: null,
      bilateral: null,
    }

    if (comparison.side === 'left') {
      current.left = comparison
    } else if (comparison.side === 'right') {
      current.right = comparison
    } else {
      current.bilateral = comparison
    }

    groupMap.set(key, current)
  }

  const groups = [...groupMap.values()]
    .map(group => ({
      ...group,
      points: mergeHistory(data, athleteId, group),
    }))
    .sort((left, right) =>
      left.label.localeCompare(right.label, 'it'),
    )

  const sessions = data.sessions
    .filter(session => session.athleteId === athleteId)
    .sort(
      (left, right) =>
        right.testedAt.localeCompare(left.testedAt) ||
        right.createdAt.localeCompare(left.createdAt),
    )

  return {
    sessions,
    groups,
    asymmetries: calculateAsymmetry(comparisons),
    comparableSeries:
      comparisons.filter(item => item.comparable).length,
    latestTestedAt: sessions[0]?.testedAt ?? null,
  }
}

export function buildRetestInput(
  data: TestData,
  testSessionId: string,
  testedAt = new Date().toISOString().slice(0, 10),
): TestInput | null {
  const session = data.sessions.find(
    item => item.id === testSessionId,
  )

  if (!session) return null

  const metrics = data.results
    .filter(result => result.testSessionId === testSessionId)
    .map(result => ({
      metricKey: result.metricKey,
      metricLabel: result.metricLabel,
      value: Number.NaN,
      unit: result.unit,
      side: result.side,
      grip: result.grip,
      normalizeToBodyWeight: result.normalizeToBodyWeight,
      setup: { ...result.setup },
      notes: '',
    }))

  if (metrics.length === 0) return null

  const context = { ...session.context }
  delete context.capture_source

  return {
    athleteId: session.athleteId,
    testedAt,
    bodyWeightKg: session.bodyWeightKg,
    protocolVersion: session.protocolVersion,
    context,
    notes: '',
    metrics,
  }
}

export function canManageTests(
  role: 'athlete' | 'coach',
) {
  return role === 'coach'
}

export function testCaptureSource(
  session: TestSessionRecord,
): TestCaptureSource {
  const source = String(
    session.context.capture_source ?? '',
  ).toLowerCase()

  if (
    source === 'manual' ||
    source === 'tindeq' ||
    source === 'imported'
  ) {
    return source
  }

  return 'unknown'
}

export function testCaptureSourceLabel(
  session: TestSessionRecord,
) {
  const source = testCaptureSource(session)

  if (source === 'manual') return 'Manuale'
  if (source === 'tindeq') return 'Tindeq'
  if (source === 'imported') return 'Importato'
  return 'Registrato'
}

export function sessionMeasureCount(
  data: TestData,
  testSessionId: string,
) {
  return data.results.filter(
    result => result.testSessionId === testSessionId,
  ).length
}
