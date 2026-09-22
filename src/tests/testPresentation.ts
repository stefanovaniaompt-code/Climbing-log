import {
  buildComparisons,
  calculateAsymmetry,
  metricHistory,
  type MetricComparison,
  type TestData,
  type TestInput,
  type TestSessionRecord,
} from './testAnalytics'
import { getTestDefinition } from './testCatalog'
import { liveGripLabel } from './liveTestTemplates'

export function isVisibleTestResult(
  result: TestData['results'][number],
) {
  return !(
    result.protocolKey?.startsWith('live_mvc_') &&
    result.metricKey === 'peak_n'
  )
}

function visibleTestData(data: TestData): TestData {
  return {
    ...data,
    results: data.results.filter(isVisibleTestResult),
  }
}

export type SessionTindeqTest = {
  attemptId: string
  label: string
  detail: string
}

export function sessionTindeqTests(
  data: TestData,
  testSessionId: string,
): SessionTindeqTest[] {
  const grouped = new Map<string, TestData['results']>()

  for (const result of data.results) {
    if (
      result.testSessionId !== testSessionId ||
      result.measurementSource !== 'tindeq' ||
      !result.attemptId ||
      !isVisibleTestResult(result)
    ) {
      continue
    }

    grouped.set(
      result.attemptId,
      [...(grouped.get(result.attemptId) ?? []), result],
    )
  }

  return [...grouped.entries()].map(([attemptId, results]) => {
    const primary = results.find(result => result.isPrimary) ?? results[0]
    const definition = getTestDefinition(primary.protocolKey ?? '')
    const side = primary.side === 'right'
      ? 'DX'
      : primary.side === 'left'
        ? 'SX'
        : primary.side === 'bilateral'
          ? 'Bilaterale'
          : ''
    const grip = primary.grip ? liveGripLabel(primary.grip) : ''
    const value = `${primary.value.toLocaleString('it-IT', {
      maximumFractionDigits: 2,
    })} ${primary.unit}`

    return {
      attemptId,
      label: definition?.name ?? primary.metricLabel,
      detail: [side, grip, value].filter(Boolean).join(' - '),
    }
  })
}

export type TestCaptureSource =
  | 'manual'
  | 'remote'
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

  protocolKey: string
  protocolVersion: string

  setupSignature: string
  setupLabel: string

  grip: string
  unit: string

  left:
    MetricComparison | null

  right:
    MetricComparison | null

  bilateral:
    MetricComparison | null

  points:
    MetricHistoryPoint[]
}

export type TestPresentation = {
  sessions:
    TestSessionRecord[]

  groups:
    MetricSideBundle[]

  asymmetries:
    ReturnType<
      typeof calculateAsymmetry
    >

  comparableSeries: number

  latestTestedAt:
    string | null
}

function groupKey(
  item:
    MetricComparison,
) {
  return item
    .compatibilityKey
}

function mergeHistory(
  data: TestData,
  athleteId: string,
  group:
    Omit<
      MetricSideBundle,
      'points'
    >,
): MetricHistoryPoint[] {
  const points =
    new Map<
      string,
      MetricHistoryPoint
    >()

  const add =
    (
      comparison:
        MetricComparison | null,

      side:
        | 'left'
        | 'right'
        | 'bilateral',
    ) => {
      if (!comparison) {
        return
      }

      for (
        const point
        of metricHistory(
          data,
          athleteId,
          comparison.key,
        )
      ) {
        const current =
          points.get(
            point.sessionId,
          ) ?? {
            date:
              point.date,

            left:
              null,

            right:
              null,

            bilateral:
              null,
          }

        /*
         * A remote battery can span more than one day.
         * Use the latest actual measurement date as the
         * label of the paired session point.
         */
        if (
          point.date >
          current.date
        ) {
          current.date =
            point.date
        }

        current[side] =
          point.value

        points.set(
          point.sessionId,
          current,
        )
      }
    }

  add(
    group.left,
    'left',
  )

  add(
    group.right,
    'right',
  )

  add(
    group.bilateral,
    'bilateral',
  )

  return [
    ...points.values(),
  ].sort(
    (
      left,
      right,
    ) =>
      left.date
        .localeCompare(
          right.date,
        ),
  )
}

export function buildTestPresentation(
  data: TestData,
  athleteId: string,
): TestPresentation {
  const visibleData = visibleTestData(data)
  const comparisons =
    buildComparisons(
      visibleData,
      athleteId,
    )

  const groupMap =
    new Map<
      string,
      Omit<
        MetricSideBundle,
        'points'
      >
    >()

  for (
    const comparison
    of comparisons
  ) {
    const key =
      groupKey(
        comparison,
      )

    const current =
      groupMap.get(
        key,
      ) ?? {
        key,

        metricKey:
          comparison.metricKey,

        label:
          comparison.label,

        protocolKey:
          comparison.protocolKey,

        protocolVersion:
          comparison
            .protocolVersion,

        setupSignature:
          comparison
            .setupSignature,

        setupLabel:
          comparison.setupLabel,

        grip:
          comparison.grip,

        unit:
          comparison.unit,

        left:
          null,

        right:
          null,

        bilateral:
          null,
      }

    if (
      comparison.side ===
      'left'
    ) {
      current.left =
        comparison
    } else if (
      comparison.side ===
      'right'
    ) {
      current.right =
        comparison
    } else {
      current.bilateral =
        comparison
    }

    groupMap.set(
      key,
      current,
    )
  }

  const groups =
    [
      ...groupMap.values(),
    ]
      .map(
        group => ({
          ...group,

          points:
            mergeHistory(
              visibleData,
              athleteId,
              group,
            ),
        }),
      )
      .sort(
        (
          left,
          right,
        ) =>
          left.label
            .localeCompare(
              right.label,
              'it',
            ) ||
          left
            .protocolVersion
            .localeCompare(
              right
                .protocolVersion,
            ) ||
          left
            .setupLabel
            .localeCompare(
              right
                .setupLabel,
              'it',
            ),
      )

  const sessions =
    data.sessions
      .filter(
        session =>
          session
            .athleteId ===
            athleteId &&
          (
            !session.status ||
            session.status ===
              'completed'
          ),
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.testedAt
            .localeCompare(
              left.testedAt,
            ) ||
          right.createdAt
            .localeCompare(
              left.createdAt,
            ),
      )

  const latestMeasuredAt =
    comparisons
      .map(
        item =>
          item
            .latestMeasuredAt,
      )
      .sort()
      .at(-1)

  return {
    sessions,
    groups,

    asymmetries:
      calculateAsymmetry(
        comparisons,
      ),

    comparableSeries:
      comparisons.filter(
        item =>
          item.comparable,
      ).length,

    latestTestedAt:
      latestMeasuredAt
        ? latestMeasuredAt
            .slice(0, 10)
        : sessions[0]
            ?.testedAt ??
          null,
  }
}

export function buildRetestInput(
  data: TestData,
  testSessionId: string,
  testedAt =
    new Date()
      .toISOString()
      .slice(0, 10),
): TestInput | null {
  const session =
    data.sessions.find(
      item =>
        item.id ===
        testSessionId,
    )

  if (!session) {
    return null
  }

  const metrics =
    data.results
      .filter(
        result =>
          result
            .testSessionId ===
            testSessionId &&
          result
            .qualityStatus !==
            'INVALID',
      )
      .map(
        result => ({
          metricKey:
            result.metricKey,

          metricLabel:
            result.metricLabel,

          value:
            Number.NaN,

          unit:
            result.unit,

          side:
            result.side,

          grip:
            result.grip,

          normalizeToBodyWeight:
            result
              .normalizeToBodyWeight,

          setup: {
            ...result.setup,
          },

          notes: '',
        }),
      )

  if (
    metrics.length === 0
  ) {
    return null
  }

  const context = {
    ...session.context,
  }

  delete context
    .capture_source

  return {
    athleteId:
      session.athleteId,

    testedAt,

    bodyWeightKg:
      session.bodyWeightKg,

    protocolVersion:
      session.protocolVersion,

    context,

    notes: '',

    metrics,
  }
}

export function canManageTests(
  role:
    | 'athlete'
    | 'coach',
) {
  return role ===
    'coach'
}

export function testCaptureSource(
  session:
    TestSessionRecord,
): TestCaptureSource {
  if (
    session.mode ===
    'remote'
  ) {
    return 'remote'
  }

  if (
    session.mode ===
    'live'
  ) {
    return 'tindeq'
  }

  const source =
    String(
      session.context
        .capture_source ??
      '',
    ).toLowerCase()

  if (
    source ===
      'remote_manual'
  ) {
    return 'remote'
  }

  if (
    source ===
      'manual' ||
    source ===
      'tindeq' ||
    source ===
      'imported'
  ) {
    return source
  }

  return 'unknown'
}

export function testCaptureSourceLabel(
  session:
    TestSessionRecord,
) {
  const source =
    testCaptureSource(
      session,
    )

  if (
    source === 'manual'
  ) {
    return 'Manuale'
  }

  if (
    source === 'remote'
  ) {
    return 'A distanza'
  }

  if (
    source === 'tindeq'
  ) {
    return 'Tindeq'
  }

  if (
    source === 'imported'
  ) {
    return 'Importato'
  }

  return 'Registrato'
}

export function sessionMeasureCount(
  data: TestData,
  testSessionId: string,
) {
  return data.results
    .filter(
      result =>
        isVisibleTestResult(result) &&
        result
          .testSessionId ===
          testSessionId &&
        result
          .qualityStatus !==
          'INVALID',
    )
    .length
}
