export type TestTargetReference =
  | 'latest_valid'
  | 'personal_best'
  | 'specific_result'

export type TestOutcomeQuality =
  | 'VALID'
  | 'REVIEW'
  | 'INVALID'

export type TestOutcomeReference = {
  resultId: string
  metricKey: string
  metricLabel: string
  value: number
  unit: string

  measuredAt: string
  testedAt: string

  side: string | null
  grip: string

  bodyWeightKg:
    number | null

  protocolKey:
    string | null

  protocolVersion:
    string | null

  setup:
    Record<string, unknown>

  measurementSource:
    'manual' | 'tindeq'

  qualityStatus:
    TestOutcomeQuality

  higherIsBetter?: boolean
}

export type DerivedSetTarget = {
  setNumber: number
  percentage: number
  calculatedTarget: number
  targetUnit: string
}

export type DerivedTarget = {
  resultId:
    string | null

  metricKey: string
  metricLabel: string

  sourceValue: number
  sourceUnit: string

  testedAt: string
  measuredAt: string

  side: string | null
  grip: string

  bodyWeightKg:
    number | null

  protocolKey:
    string | null

  protocolVersion:
    string | null

  setup:
    Record<string, unknown>

  measurementSource:
    'manual' | 'tindeq'

  qualityStatus:
    TestOutcomeQuality

  reference:
    TestTargetReference

  targetUnit: string

  setTargets:
    DerivedSetTarget[]

  /*
   * Backward-compatible summary.
   * These always represent the first set.
   */
  percentage: number
  calculatedTarget: number

  lockedAt: string
}

export type DerivedTargetOptions = {
  prescriptionUnit?: string
  currentBodyWeightKg?: number
  roundTo?: number

  reference?:
    TestTargetReference

  lockedAt?: string
}

function stableValue(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(
      stableValue,
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
            stableValue(
              record[key],
            )

          return result
        },
        {},
      )
  }

  return value
}

function stableJson(
  value:
    Record<string, unknown>,
) {
  return JSON.stringify(
    stableValue(value),
  )
}

function referenceTime(
  result:
    TestOutcomeReference,
) {
  return (
    result.measuredAt ||
    result.testedAt
  )
}

function usableAutomaticReference(
  result:
    TestOutcomeReference,
) {
  return (
    result.qualityStatus ===
      'VALID' &&
    Number.isFinite(
      result.value,
    )
  )
}

export function compatibleTestReference(
  left:
    Pick<
      TestOutcomeReference,
      | 'metricKey'
      | 'unit'
      | 'side'
      | 'grip'
      | 'protocolKey'
      | 'protocolVersion'
      | 'setup'
    >,

  right:
    Pick<
      TestOutcomeReference,
      | 'metricKey'
      | 'unit'
      | 'side'
      | 'grip'
      | 'protocolKey'
      | 'protocolVersion'
      | 'setup'
    >,
) {
  return (
    left.metricKey ===
      right.metricKey &&
    left.unit ===
      right.unit &&
    left.side ===
      right.side &&
    left.grip ===
      right.grip &&
    left.protocolKey ===
      right.protocolKey &&
    left.protocolVersion ===
      right.protocolVersion &&
    stableJson(
      left.setup,
    ) ===
      stableJson(
        right.setup,
      )
  )
}

export function chooseTestReference(
  results:
    TestOutcomeReference[],

  reference:
    TestTargetReference,

  specificResultId?: string,
) {
  if (
    reference ===
    'specific_result'
  ) {
    return (
      results.find(
        item =>
          item.resultId ===
          specificResultId &&
          item.qualityStatus !==
            'INVALID',
      ) ?? null
    )
  }

  const valid =
    results.filter(
      usableAutomaticReference,
    )

  if (
    reference ===
    'personal_best'
  ) {
    return (
      [...valid].sort(
        (
          left,
          right,
        ) => {
          const direction =
            left.higherIsBetter ===
            false
              ? 1
              : -1

          return (
            (
              left.value -
              right.value
            ) *
            direction
          )
        },
      )[0] ?? null
    )
  }

  return (
    [...valid].sort(
      (
        left,
        right,
      ) =>
        referenceTime(
          right,
        ).localeCompare(
          referenceTime(
            left,
          ),
        ),
    )[0] ?? null
  )
}

function requireBodyWeight(
  source:
    TestOutcomeReference,

  options:
    DerivedTargetOptions,
) {
  const bodyWeight =
    options.currentBodyWeightKg ??
    source.bodyWeightKg

  if (
    !bodyWeight ||
    bodyWeight <= 0
  ) {
    throw new Error(
      'Serve il peso corporeo per questa conversione.',
    )
  }

  return bodyWeight
}

function convertTarget(
  source:
    TestOutcomeReference,

  percentage: number,

  options:
    DerivedTargetOptions,
) {
  const targetUnit =
    options.prescriptionUnit ??
    source.unit

  const scaled =
    source.value *
    percentage /
    100

  let calculated =
    scaled

  if (
    targetUnit ===
    source.unit
  ) {
    calculated =
      scaled
  } else if (
    (
      source.unit ===
        'kgf' &&
      targetUnit ===
        'kg'
    ) ||
    (
      source.unit ===
        'kg' &&
      targetUnit ===
        'kgf'
    )
  ) {
    calculated =
      scaled
  } else if (
    source.unit === 'N' &&
    (
      targetUnit ===
        'kg' ||
      targetUnit ===
        'kgf'
    )
  ) {
    calculated =
      scaled /
      9.80665
  } else if (
    (
      source.unit ===
        'kg' ||
      source.unit ===
        'kgf'
    ) &&
    targetUnit === 'N'
  ) {
    calculated =
      scaled *
      9.80665
  } else if (
    source.unit ===
      'N/kg' &&
    targetUnit === 'N'
  ) {
    calculated =
      scaled *
      requireBodyWeight(
        source,
        options,
      )
  } else if (
    source.unit ===
      'N/kg' &&
    (
      targetUnit ===
        'kg' ||
      targetUnit ===
        'kgf'
    )
  ) {
    calculated =
      scaled *
      requireBodyWeight(
        source,
        options,
      ) /
      9.80665
  } else if (
    source.unit ===
      '%BW' &&
    targetUnit ===
      'kg_total'
  ) {
    calculated =
      requireBodyWeight(
        source,
        options,
      ) *
      scaled /
      100
  } else if (
    source.unit ===
      '%BW' &&
    targetUnit ===
      'kg_external'
  ) {
    const bodyWeight =
      requireBodyWeight(
        source,
        options,
      )

    calculated =
      bodyWeight *
      scaled /
      100 -
      bodyWeight
  } else if (
    source.unit ===
      'kg_total' &&
    targetUnit ===
      'kg_external'
  ) {
    calculated =
      scaled -
      requireBodyWeight(
        source,
        options,
      )
  } else if (
    source.unit ===
      'kg' &&
    targetUnit ===
      'kg_external'
  ) {
    calculated =
      scaled
  } else {
    throw new Error(
      `Conversione non supportata: ${source.unit} -> ${targetUnit}.`,
    )
  }

  if (
    options.roundTo &&
    options.roundTo > 0
  ) {
    calculated =
      Math.round(
        calculated /
        options.roundTo,
      ) *
      options.roundTo
  }

  return {
    calculatedTarget:
      calculated,

    targetUnit,
  }
}

export function calculateDerivedSetTargets(
  source:
    TestOutcomeReference,

  percentages:
    number[],

  options:
    DerivedTargetOptions = {},
): DerivedTarget {
  if (
    source.qualityStatus ===
    'INVALID'
  ) {
    throw new Error(
      'Un risultato INVALID non puo essere usato come riferimento.',
    )
  }

  if (!percentages.length) {
    throw new Error(
      'Inserisci almeno una percentuale.',
    )
  }

  const setTargets =
    percentages.map(
      (
        percentage,
        index,
      ) => {
        if (
          !Number.isFinite(
            percentage,
          ) ||
          percentage <= 0
        ) {
          throw new Error(
            'Ogni percentuale deve essere maggiore di zero.',
          )
        }

        const converted =
          convertTarget(
            source,
            percentage,
            options,
          )

        return {
          setNumber:
            index + 1,

          percentage,

          calculatedTarget:
            converted
              .calculatedTarget,

          targetUnit:
            converted
              .targetUnit,
        }
      },
    )

  const first =
    setTargets[0]

  return {
    resultId:
      source.resultId,

    metricKey:
      source.metricKey,

    metricLabel:
      source.metricLabel,

    sourceValue:
      source.value,

    sourceUnit:
      source.unit,

    testedAt:
      source.testedAt,

    measuredAt:
      source.measuredAt,

    side:
      source.side,

    grip:
      source.grip,

    bodyWeightKg:
      source.bodyWeightKg,

    protocolKey:
      source.protocolKey,

    protocolVersion:
      source.protocolVersion,

    setup: {
      ...source.setup,
    },

    measurementSource:
      source.measurementSource,

    qualityStatus:
      source.qualityStatus,

    reference:
      options.reference ??
      'latest_valid',

    targetUnit:
      first.targetUnit,

    setTargets,

    percentage:
      first.percentage,

    calculatedTarget:
      first.calculatedTarget,

    lockedAt:
      options.lockedAt ??
      new Date()
        .toISOString(),
  }
}

export function calculateDerivedTarget(
  source:
    TestOutcomeReference,

  percentage: number,

  options:
    DerivedTargetOptions = {},
) {
  return calculateDerivedSetTargets(
    source,
    [percentage],
    options,
  )
}

export function hasNewerTest(
  target:
    DerivedTarget,

  results:
    TestOutcomeReference[],
) {
  const lockedReference:
    TestOutcomeReference = {
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

  return results.some(
    result =>
      result.qualityStatus ===
        'VALID' &&
      compatibleTestReference(
        lockedReference,
        result,
      ) &&
      referenceTime(
        result,
      ) >
        referenceTime(
          lockedReference,
        ),
  )
}

export function formatDerivedTarget(
  value: number,
) {
  return Number(
    value.toFixed(2),
  )
}
