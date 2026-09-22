export type TestAthlete = {
  id: string
  name: string
}

export type TestSessionRecord = {
  id: string
  athleteId: string
  coachId: string | null
  testedAt: string
  createdAt: string
  bodyWeightKg: number | null
  protocolVersion: string
  context: Record<string, unknown>
  notes: string

  mode?:
    | 'manual'
    | 'remote'
    | 'live'

  status?:
    | 'assigned'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
}

export type TestResultRecord = {
  id: string
  testSessionId: string
  attemptId?: string | null
  metricKey: string
  metricLabel: string
  value: number
  unit: string

  side:
    | 'left'
    | 'right'
    | 'bilateral'
    | null

  grip: string
  normalizeToBodyWeight: boolean
  setup: Record<string, unknown>
  notes: string

  protocolKey?: string | null
  protocolVersion?: string | null

  measurementSource?:
    | 'manual'
    | 'tindeq'

  qualityStatus?:
    | 'VALID'
    | 'REVIEW'
    | 'INVALID'

  isPrimary?: boolean

  measuredAt?: string | null
}

export type TestData = {
  source:
    | 'demo'
    | 'legacy-v1'

  athletes: TestAthlete[]
  sessions: TestSessionRecord[]
  results: TestResultRecord[]
}

export type TestMetricInput =
  Omit<
    TestResultRecord,
    | 'id'
    | 'testSessionId'
    | 'attemptId'
    | 'protocolKey'
    | 'protocolVersion'
    | 'measurementSource'
    | 'qualityStatus'
    | 'isPrimary'
    | 'measuredAt'
  >

export type TestInput = {
  athleteId: string
  testedAt: string
  bodyWeightKg: number | null
  protocolVersion: string
  context: Record<string, unknown>
  notes: string
  metrics: TestMetricInput[]
}

export type MetricComparison = {
  key: string
  compatibilityKey: string

  metricKey: string
  label: string

  protocolKey: string
  protocolVersion: string

  setupSignature: string
  setupLabel: string

  side:
    TestResultRecord['side']

  grip: string
  unit: string

  latest: number
  previous: number | null

  latestSessionId: string
  previousSessionId: string | null

  latestMeasuredAt: string
  previousMeasuredAt: string | null

  latestSource:
    | 'manual'
    | 'tindeq'

  latestQualityStatus:
    | 'VALID'
    | 'REVIEW'
    | 'INVALID'

  delta: number | null
  percent: number | null
  normalized: number | null

  comparable: boolean
  reason: string | null
}

const NON_MATERIAL_SETUP_KEYS =
  new Set([
    'primaryMetricKey',
    'capture_source',
    'measurement_source',
    'measurementSource',
    'source',
    'liveClinicalKind',
    'mvcSourceItemId',
    'mvcUsedKg',
    'targetPercent',
    'targetTolerancePercent',
    'targetKg',
    'targetN',
    'enduranceFailureGraceMs',
    'repeaterWorkMs',
  ])

function canonicalValue(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(
      canonicalValue,
    )
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    const record =
      value as Record<
        string,
        unknown
      >

    return Object.keys(record)
      .sort()
      .reduce<
        Record<string, unknown>
      >(
        (
          result,
          key,
        ) => {
          result[key] =
            canonicalValue(
              record[key],
            )

          return result
        },
        {},
      )
  }

  return value
}

function materialSetup(
  setup:
    Record<string, unknown>,
) {
  return Object.entries(
    setup,
  ).reduce<
    Record<string, unknown>
  >(
    (
      result,
      [key, value],
    ) => {
      if (
        !NON_MATERIAL_SETUP_KEYS
          .has(key)
      ) {
        result[key] =
          value
      }

      return result
    },
    {},
  )
}

function stableJson(
  value:
    Record<string, unknown>,
) {
  return JSON.stringify(
    canonicalValue(value),
  )
}

function setupSummary(
  setup:
    Record<string, unknown>,
) {
  return Object.entries(
    materialSetup(setup),
  )
    .map(
      ([key, value]) => {
        if (
          value === null ||
          typeof value ===
            'string' ||
          typeof value ===
            'number' ||
          typeof value ===
            'boolean'
        ) {
          return `${key}: ${String(value)}`
        }

        return key
      },
    )
    .join(' / ')
}

function isCompletedSession(
  session:
    TestSessionRecord,
) {
  return (
    !session.status ||
    session.status ===
      'completed'
  )
}

function resultProtocolKey(
  result:
    TestResultRecord,
) {
  return (
    result.protocolKey
      ?.trim() ||
    `legacy:${result.metricKey}`
  )
}

function resultProtocolVersion(
  result:
    TestResultRecord,
  session:
    TestSessionRecord,
) {
  return (
    result.protocolVersion
      ?.trim() ||
    session.protocolVersion
      .trim() ||
    'legacy'
  )
}

export function testResultMeasuredAt(
  result:
    TestResultRecord,
  session:
    TestSessionRecord,
) {
  return (
    result.measuredAt
      ?.trim() ||
    `${session.testedAt}T12:00:00.000Z`
  )
}

function resultIdentity(
  result:
    TestResultRecord,
  session:
    TestSessionRecord,
) {
  const protocolKey =
    resultProtocolKey(
      result,
    )

  const protocolVersion =
    resultProtocolVersion(
      result,
      session,
    )

  const cleanSetup =
    materialSetup(
      result.setup,
    )

  const setupSignature =
    stableJson(
      cleanSetup,
    )

  const compatibilityKey = [
    protocolKey,
    protocolVersion,
    result.metricKey,
    result.grip,
    result.unit,
    setupSignature,
  ].join('|')

  const key = [
    compatibilityKey,
    result.side ?? '',
  ].join('|')

  return {
    key,
    compatibilityKey,
    protocolKey,
    protocolVersion,
    setupSignature,
    setupLabel:
      setupSummary(
        cleanSetup,
      ),
  }
}

function isHistoricalResult(
  result:
    TestResultRecord,
  session:
    TestSessionRecord,
) {
  return (
    isCompletedSession(
      session,
    ) &&
    result.qualityStatus !==
      'INVALID'
  )
}

export function validateTest(
  input: TestInput,
) {
  if (!input.athleteId) {
    return 'Seleziona un atleta.'
  }

  if (!input.testedAt) {
    return 'Inserisci la data del test.'
  }

  if (
    !input.protocolVersion
      .trim()
  ) {
    return 'Indica il protocollo usato.'
  }

  if (
    input.bodyWeightKg !==
      null &&
    input.bodyWeightKg <= 0
  ) {
    return 'Il peso corporeo deve essere maggiore di zero.'
  }

  if (!input.metrics.length) {
    return 'Aggiungi almeno una misura.'
  }

  for (
    const metric
    of input.metrics
  ) {
    if (
      !metric.metricKey
        .trim() ||
      !metric.metricLabel
        .trim()
    ) {
      return 'Ogni misura deve avere nome e chiave.'
    }

    if (
      !Number.isFinite(
        metric.value,
      )
    ) {
      return `Inserisci un valore valido per ${
        metric.metricLabel ||
        'la misura'
      }.`
    }

    if (
      !metric.unit.trim()
    ) {
      return `Indica l unita di ${metric.metricLabel}.`
    }
  }

  return null
}

export function buildComparisons(
  data: TestData,
  athleteId: string,
): MetricComparison[] {
  const sessions =
    data.sessions.filter(
      session =>
        session.athleteId ===
          athleteId &&
        isCompletedSession(
          session,
        ),
    )

  const sessionById =
    new Map(
      sessions.map(
        session => [
          session.id,
          session,
        ],
      ),
    )

  const grouped =
    new Map<
      string,
      {
        identity:
          ReturnType<
            typeof resultIdentity
          >

        results:
          TestResultRecord[]
      }
    >()

  for (
    const result
    of data.results
  ) {
    const session =
      sessionById.get(
        result.testSessionId,
      )

    if (
      !session ||
      !isHistoricalResult(
        result,
        session,
      )
    ) {
      continue
    }

    const identity =
      resultIdentity(
        result,
        session,
      )

    const current =
      grouped.get(
        identity.key,
      )

    if (current) {
      current.results.push(
        result,
      )
    } else {
      grouped.set(
        identity.key,
        {
          identity,
          results: [result],
        },
      )
    }
  }

  return [
    ...grouped.entries(),
  ]
    .map(
      (
        [
          key,
          {
            identity,
            results,
          },
        ],
      ) => {
        const ordered =
          [...results].sort(
            (
              left,
              right,
            ) => {
              const leftSession =
                sessionById.get(
                  left
                    .testSessionId,
                )!

              const rightSession =
                sessionById.get(
                  right
                    .testSessionId,
                )!

              const leftTime =
                testResultMeasuredAt(
                  left,
                  leftSession,
                )

              const rightTime =
                testResultMeasuredAt(
                  right,
                  rightSession,
                )

              return (
                rightTime
                  .localeCompare(
                    leftTime,
                  ) ||
                rightSession
                  .createdAt
                  .localeCompare(
                    leftSession
                      .createdAt,
                  )
              )
            },
          )

        const latest =
          ordered[0]

        const previous =
          ordered[1]

        const latestSession =
          sessionById.get(
            latest.testSessionId,
          )!

        const previousSession =
          previous
            ? sessionById.get(
                previous
                  .testSessionId,
              )!
            : null

        const latestMeasuredAt =
          testResultMeasuredAt(
            latest,
            latestSession,
          )

        const previousMeasuredAt =
          previous &&
          previousSession
            ? testResultMeasuredAt(
                previous,
                previousSession,
              )
            : null

        const comparable =
          Boolean(previous)

        const delta =
          previous
            ? latest.value -
              previous.value
            : null

        return {
          key,

          compatibilityKey:
            identity
              .compatibilityKey,

          metricKey:
            latest.metricKey,

          label:
            latest.metricLabel,

          protocolKey:
            identity.protocolKey,

          protocolVersion:
            identity
              .protocolVersion,

          setupSignature:
            identity
              .setupSignature,

          setupLabel:
            identity.setupLabel,

          side:
            latest.side,

          grip:
            latest.grip,

          unit:
            latest.unit,

          latest:
            latest.value,

          previous:
            previous?.value ??
            null,

          latestSessionId:
            latest
              .testSessionId,

          previousSessionId:
            previous
              ?.testSessionId ??
            null,

          latestMeasuredAt,

          previousMeasuredAt,

          latestSource:
            latest
              .measurementSource ??
            'manual',

          latestQualityStatus:
            latest
              .qualityStatus ??
            'VALID',

          delta,

          percent:
            delta !== null &&
            previous &&
            previous.value !== 0
              ? (
                  delta /
                  Math.abs(
                    previous.value,
                  ) *
                  100
                )
              : null,

          normalized:
            latest
              .normalizeToBodyWeight &&
            latestSession
              .bodyWeightKg
              ? (
                  latest.value /
                  latestSession
                    .bodyWeightKg
                )
              : null,

          comparable,

          reason:
            comparable
              ? null
              : 'Serve un retest compatibile',
        }
      },
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
            right.setupLabel,
            'it',
          ),
    )
}

export function calculateAsymmetry(
  comparisons:
    MetricComparison[],
) {
  const groups =
    new Map<
      string,
      Partial<
        Record<
          'left' | 'right',
          MetricComparison
        >
      >
    >()

  for (
    const item
    of comparisons
  ) {
    if (
      item.side !==
        'left' &&
      item.side !==
        'right'
    ) {
      continue
    }

    groups.set(
      item.compatibilityKey,
      {
        ...(
          groups.get(
            item.compatibilityKey,
          ) ?? {}
        ),

        [item.side]:
          item,
      },
    )
  }

  return [
    ...groups.entries(),
  ].flatMap(
    (
      [key, pair],
    ) => {
      if (
        !pair.left ||
        !pair.right
      ) {
        return []
      }

      /*
       * Never calculate an asymmetry by mixing
       * measurements from two different test sessions.
       */
      if (
        pair.left
          .latestSessionId !==
        pair.right
          .latestSessionId
      ) {
        return []
      }

      const maximum =
        Math.max(
          Math.abs(
            pair.left.latest,
          ),
          Math.abs(
            pair.right.latest,
          ),
        )

      return [
        {
          key,

          label:
            pair.left.label,

          grip:
            pair.left.grip,

          percent:
            maximum
              ? (
                  Math.abs(
                    pair.left
                      .latest -
                    pair.right
                      .latest,
                  ) /
                  maximum *
                  100
                )
              : 0,

          weakerSide:
            pair.left.latest <
            pair.right.latest
              ? 'Sinistra'
              : pair.right
                    .latest <
                  pair.left
                    .latest
                ? 'Destra'
                : 'Bilanciato',
        },
      ]
    },
  )
}

export function metricHistory(
  data: TestData,
  athleteId: string,
  comparisonKey: string,
) {
  const sessionById =
    new Map(
      data.sessions
        .filter(
          session =>
            session
              .athleteId ===
              athleteId &&
            isCompletedSession(
              session,
            ),
        )
        .map(
          session => [
            session.id,
            session,
          ],
        ),
    )

  return data.results
    .flatMap(
      result => {
        const session =
          sessionById.get(
            result.testSessionId,
          )

        if (
          !session ||
          !isHistoricalResult(
            result,
            session,
          )
        ) {
          return []
        }

        const identity =
          resultIdentity(
            result,
            session,
          )

        if (
          identity.key !==
          comparisonKey
        ) {
          return []
        }

        const measuredAt =
          testResultMeasuredAt(
            result,
            session,
          )

        return [
          {
            sessionId:
              result
                .testSessionId,

            measuredAt,

            date:
              measuredAt.slice(
                0,
                10,
              ),

            value:
              result.value,
          },
        ]
      },
    )
    .sort(
      (
        left,
        right,
      ) =>
        left.measuredAt
          .localeCompare(
            right.measuredAt,
          ),
    )
}
