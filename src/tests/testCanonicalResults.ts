import type { AcquisitionResult } from '../tindeq/acquisition'
import {
  getTestDefinition,
  type MetricDefinition,
  type TestProtocolKey,
} from './testCatalog'
import type {
  TestSessionDraft,
  TestSessionItemDraft,
  TestSide,
} from './testAttemptTypes'

export type CanonicalTestMetric = {
  metricKey: string
  metricLabel: string
  value: number
  unit: string
  dimension: MetricDefinition['dimension']
  isPrimary: boolean
  normalizeToBodyWeight: boolean
}

export type CanonicalTestResultBundle = {
  testSessionId: string
  testSessionItemId: string
  attemptId: string

  protocolKey: TestProtocolKey
  protocolVersion: string

  side: TestSide
  grip: string
  setup: Record<string, unknown>

  bodyWeightKg: number | null

  measurementSource: 'tindeq'
  qualityStatus: AcquisitionResult['qualityStatus']

  startedAt: string
  endedAt: string

  rawCurvePath: string

  metrics: CanonicalTestMetric[]
}

function isFiniteMetric(
  value: number | null | undefined,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value)
  )
}

function normalizedUnit(unit: string) {
  return unit.trim().toLowerCase()
}

function isBodyWeightNormalizedUnit(
  unit: string,
) {
  const normalized =
    normalizedUnit(unit)

  return (
    normalized === 'n/kg' ||
    normalized === '%bw'
  )
}

function metricValues(
  acquisition: AcquisitionResult,
) {
  const values =
    new Map<string, number | null>()

  for (
    const [key, value]
    of Object.entries(
      acquisition.secondaryMetrics,
    )
  ) {
    values.set(key, value)
  }

  if (
    acquisition.primaryMetricKey &&
    isFiniteMetric(
      acquisition.primaryValue,
    )
  ) {
    values.set(
      acquisition.primaryMetricKey,
      acquisition.primaryValue,
    )
  }

  return values
}

export function buildCanonicalTestResults(
  session: TestSessionDraft,
  item: TestSessionItemDraft,
  attemptId: string,
  acquisition: AcquisitionResult,
): CanonicalTestResultBundle {
  if (
    item.testSessionId !==
    session.id
  ) {
    throw new Error(
      'Test item and session do not match.',
    )
  }

  if (!attemptId.trim()) {
    throw new Error(
      'Attempt id is required.',
    )
  }

  const definition =
    getTestDefinition(
      item.protocolKey,
    )

  if (!definition) {
    throw new Error(
      `Unknown test protocol: ${item.protocolKey}`,
    )
  }

  const values =
    metricValues(acquisition)

  if (
    acquisition.primaryMetricKey &&
    isFiniteMetric(
      acquisition.primaryValue,
    )
  ) {
    const primaryDefinition =
      definition.metrics.find(
        metric =>
          metric.key ===
          acquisition.primaryMetricKey,
      )

    if (!primaryDefinition) {
      throw new Error(
        `Primary metric ${acquisition.primaryMetricKey} is not defined for protocol ${item.protocolKey}.`,
      )
    }

    if (
      acquisition.primaryUnit &&
      normalizedUnit(
        acquisition.primaryUnit,
      ) !==
        normalizedUnit(
          primaryDefinition.unit,
        )
    ) {
      throw new Error(
        `Primary metric unit mismatch for ${acquisition.primaryMetricKey}.`,
      )
    }
  }

  const metrics =
    definition.metrics.flatMap(
      metric => {
        const value =
          values.get(metric.key)

        if (
          !isFiniteMetric(value)
        ) {
          return []
        }

        return [{
          metricKey:
            metric.key,

          metricLabel:
            metric.label,

          value,

          unit:
            metric.unit,

          dimension:
            metric.dimension,

          isPrimary:
            metric.key ===
            acquisition.primaryMetricKey,

          normalizeToBodyWeight:
            isBodyWeightNormalizedUnit(
              metric.unit,
            ),
        }]
      },
    )

  return {
    testSessionId:
      session.id,

    testSessionItemId:
      item.id,

    attemptId,

    protocolKey:
      item.protocolKey,

    protocolVersion:
      item.protocolVersion,

    side:
      item.side,

    grip:
      item.grip,

    setup:
      { ...item.config },

    bodyWeightKg:
      session.bodyWeightKg,

    measurementSource:
      'tindeq',

    qualityStatus:
      acquisition.qualityStatus,

    startedAt:
      acquisition.startedAt,

    endedAt:
      acquisition.endedAt,

    rawCurvePath:
      `${session.id}/${attemptId}.json`,

    metrics,
  }
}

export function primaryCanonicalMetric(
  bundle: CanonicalTestResultBundle,
) {
  return (
    bundle.metrics.find(
      metric =>
        metric.isPrimary,
    ) ??
    null
  )
}
