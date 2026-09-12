import {
  compatibleTestReference,
  type DerivedTarget,
  type TestOutcomeReference,
} from './derivedTargets'

export type TestReferenceGroup = {
  id: string
  representative: TestOutcomeReference
  results: TestOutcomeReference[]
}

const LOAD_REFERENCE_UNITS =
  new Set([
    'kg',
    'kgf',
    'N',
    'N/kg',
    '%BW',
    'kg_total',
  ])

export function isLoadReferenceUnit(
  unit: string,
) {
  return LOAD_REFERENCE_UNITS.has(
    unit,
  )
}

export function targetUnitsForReference(
  unit: string,
) {
  if (
    unit === 'kg' ||
    unit === 'kgf'
  ) {
    return ['kg']
  }

  if (unit === 'N') {
    return [
      'kg',
      'N',
    ]
  }

  if (unit === 'N/kg') {
    return [
      'kg',
      'N',
    ]
  }

  if (unit === '%BW') {
    return [
      'kg_external',
      'kg_total',
    ]
  }

  if (
    unit ===
    'kg_total'
  ) {
    return [
      'kg_external',
      'kg_total',
    ]
  }

  return []
}

export function groupTestReferences(
  results:
    TestOutcomeReference[],
): TestReferenceGroup[] {
  const groups:
    TestReferenceGroup[] = []

  const ordered =
    results
      .filter(
        result =>
          result.qualityStatus !==
            'INVALID' &&
          isLoadReferenceUnit(
            result.unit,
          ),
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.measuredAt
            .localeCompare(
              left.measuredAt,
            ),
      )

  for (
    const result
    of ordered
  ) {
    const current =
      groups.find(
        group =>
          compatibleTestReference(
            group.representative,
            result,
          ),
      )

    if (current) {
      current.results.push(
        result,
      )
      continue
    }

    groups.push({
      id:
        result.resultId,

      representative:
        result,

      results:
        [result],
    })
  }

  return groups
}

export function derivedTargetAsReference(
  target:
    DerivedTarget,
): TestOutcomeReference {
  return {
    resultId:
      target.resultId ??
      '',

    metricKey:
      target.metricKey,

    metricLabel:
      target.metricLabel,

    value:
      target.sourceValue,

    unit:
      target.sourceUnit,

    testedAt:
      target.testedAt,

    measuredAt:
      target.measuredAt,

    side:
      target.side,

    grip:
      target.grip,

    bodyWeightKg:
      target.bodyWeightKg,

    protocolKey:
      target.protocolKey,

    protocolVersion:
      target.protocolVersion,

    setup:
      target.setup,

    measurementSource:
      target.measurementSource,

    qualityStatus:
      target.qualityStatus,
  }
}

export function findReferenceGroupForTarget(
  groups:
    TestReferenceGroup[],

  target:
    DerivedTarget,
) {
  const reference =
    derivedTargetAsReference(
      target,
    )

  return (
    groups.find(
      group =>
        compatibleTestReference(
          group.representative,
          reference,
        ),
    ) ?? null
  )
}
