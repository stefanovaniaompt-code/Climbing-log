import {
  dataRuntime,
} from '../dataRuntime'

import {
  supabase,
} from '../lib/supabase'

import type {
  AppProfile,
} from '../onboarding/types'

import {
  getTestDefinition,
} from '../tests/testCatalog'

import type {
  DerivedTarget,
  TestOutcomeReference,
} from './derivedTargets'

const isDemo = (
  profile:
    AppProfile,
) =>
  !supabase ||
  profile.userId.startsWith(
    '00000000-',
  ) ||
  dataRuntime.backendSchema !==
    'legacy-v1'

function assertCoach(
  profile:
    AppProfile,
) {
  if (
    profile.role !==
    'coach'
  ) {
    throw new Error(
      'I target derivati dai test sono riservati al coach.',
    )
  }
}

type SessionLookup = {
  id: string
  tested_at: string
}

type ResultRow = {
  id: string
  test_session_id: string
  metric_key: string
  metric_label: string
  value: number | string
  unit: string
  side: string | null
  grip: string | null
  body_weight_kg_at_test:
    number | string | null
  protocol_key: string | null
  protocol_version: string | null
  setup:
    Record<string, unknown> | null
  measurement_source:
    'manual' | 'tindeq'
  quality_status:
    'VALID' | 'REVIEW' | 'INVALID'
  measured_at: string
}

type TargetRow = {
  session_exercise_id: string
  reference_type:
    DerivedTarget['reference']

  test_result_id:
    string | null

  metric_key: string
  source_metric_label:
    string | null

  source_value:
    number | string

  source_unit: string
  source_tested_at: string

  source_measured_at:
    string | null

  source_side:
    string | null

  source_grip:
    string | null

  source_body_weight_kg:
    number | string | null

  source_protocol_key:
    string | null

  source_protocol_version:
    string | null

  source_setup:
    Record<string, unknown> | null

  source_measurement_source:
    'manual' | 'tindeq' | null

  source_quality_status:
    'VALID' | 'REVIEW' | 'INVALID' | null

  percentage:
    number | string

  calculated_target:
    number | string

  target_unit: string

  set_targets:
    DerivedTarget['setTargets']

  locked_at: string
}

export function targetToRow(
  sessionExerciseId:
    string,

  target:
    DerivedTarget,
) {
  const first =
    target.setTargets[0]

  if (!first) {
    throw new Error(
      'Il target deve contenere almeno una serie.',
    )
  }

  return {
    session_exercise_id:
      sessionExerciseId,

    reference_type:
      target.reference,

    test_result_id:
      target.resultId,

    test_attempt_id:
      null,

    metric_key:
      target.metricKey,

    source_metric_label:
      target.metricLabel,

    source_value:
      target.sourceValue,

    source_unit:
      target.sourceUnit,

    source_tested_at:
      target.testedAt,

    source_measured_at:
      target.measuredAt,

    source_side:
      target.side,

    source_grip:
      target.grip,

    source_body_weight_kg:
      target.bodyWeightKg,

    source_protocol_key:
      target.protocolKey,

    source_protocol_version:
      target.protocolVersion,

    source_setup:
      target.setup,

    source_measurement_source:
      target.measurementSource,

    source_quality_status:
      target.qualityStatus,

    percentage:
      first.percentage,

    calculated_target:
      first.calculatedTarget,

    target_unit:
      target.targetUnit,

    set_targets:
      target.setTargets,

    locked_at:
      target.lockedAt,
  }
}

export function targetFromRow(
  row:
    TargetRow,
): DerivedTarget {
  const setTargets =
    Array.isArray(
      row.set_targets,
    )
      ? row.set_targets.map(
          item => ({
            setNumber:
              Number(
                item.setNumber,
              ),

            percentage:
              Number(
                item.percentage,
              ),

            calculatedTarget:
              Number(
                item.calculatedTarget,
              ),

            targetUnit:
              String(
                item.targetUnit,
              ),
          }),
        )
      : []

  const first =
    setTargets[0]

  if (!first) {
    throw new Error(
      'Snapshot test target non valido.',
    )
  }

  return {
    resultId:
      row.test_result_id,

    metricKey:
      row.metric_key,

    metricLabel:
      row.source_metric_label ??
      row.metric_key,

    sourceValue:
      Number(
        row.source_value,
      ),

    sourceUnit:
      row.source_unit,

    testedAt:
      row.source_tested_at,

    measuredAt:
      row.source_measured_at ??
      `${row.source_tested_at}T12:00:00.000Z`,

    side:
      row.source_side,

    grip:
      row.source_grip ?? '',

    bodyWeightKg:
      row.source_body_weight_kg ===
        null
        ? null
        : Number(
            row.source_body_weight_kg,
          ),

    protocolKey:
      row.source_protocol_key,

    protocolVersion:
      row.source_protocol_version,

    setup:
      row.source_setup ?? {},

    measurementSource:
      row.source_measurement_source ??
      'manual',

    qualityStatus:
      row.source_quality_status ??
      'VALID',

    reference:
      row.reference_type,

    targetUnit:
      row.target_unit,

    setTargets,

    percentage:
      first.percentage,

    calculatedTarget:
      first.calculatedTarget,

    lockedAt:
      row.locked_at,
  }
}

export async function loadAthleteTestReferences(
  profile:
    AppProfile,

  athleteId:
    string,
): Promise<
  TestOutcomeReference[]
> {
  assertCoach(profile)

  if (isDemo(profile)) {
    return []
  }

  const sessions =
    await supabase!
      .from(
        'test_sessions',
      )
      .select(
        'id,tested_at',
      )
      .eq(
        'athlete_id',
        athleteId,
      )
      .eq(
        'status',
        'completed',
      )

  if (sessions.error) {
    throw sessions.error
  }

  const sessionRows =
    (
      sessions.data ??
      []
    ) as SessionLookup[]

  if (!sessionRows.length) {
    return []
  }

  const sessionById =
    new Map(
      sessionRows.map(
        session => [
          session.id,
          session,
        ],
      ),
    )

  const results =
    await supabase!
      .from(
        'test_results',
      )
      .select(
        'id,test_session_id,metric_key,metric_label,value,unit,side,grip,body_weight_kg_at_test,protocol_key,protocol_version,setup,measurement_source,quality_status,measured_at',
      )
      .in(
        'test_session_id',
        sessionRows.map(
          session =>
            session.id,
        ),
      )
      .neq(
        'quality_status',
        'INVALID',
      )
      .order(
        'measured_at',
        {
          ascending: false,
        },
      )

  if (results.error) {
    throw results.error
  }

  return (
    (
      results.data ??
      []
    ) as ResultRow[]
  ).map(
    row => {
      const session =
        sessionById.get(
          row.test_session_id,
        )

      const definition =
        getTestDefinition(
          row.protocol_key ?? '',
        )

      return {
        resultId:
          row.id,

        metricKey:
          row.metric_key,

        metricLabel:
          row.metric_label,

        value:
          Number(
            row.value,
          ),

        unit:
          row.unit,

        measuredAt:
          row.measured_at,

        testedAt:
          session
            ?.tested_at ??
          row.measured_at
            .slice(0, 10),

        side:
          row.side,

        grip:
          row.grip ?? '',

        bodyWeightKg:
          row.body_weight_kg_at_test ===
            null
            ? null
            : Number(
                row.body_weight_kg_at_test,
              ),

        protocolKey:
          row.protocol_key,

        protocolVersion:
          row.protocol_version,

        setup:
          row.setup ?? {},

        measurementSource:
          row.measurement_source,

        qualityStatus:
          row.quality_status,

        higherIsBetter:
          definition
            ?.higherIsBetter ??
          true,
      }
    },
  )
}

export async function loadExerciseTestTarget(
  profile:
    AppProfile,

  sessionExerciseId:
    string,
): Promise<
  DerivedTarget | null
> {
  assertCoach(profile)

  if (isDemo(profile)) {
    return null
  }

  const result =
    await supabase!
      .from(
        'exercise_test_targets',
      )
      .select(
        'session_exercise_id,reference_type,test_result_id,metric_key,source_metric_label,source_value,source_unit,source_tested_at,source_measured_at,source_side,source_grip,source_body_weight_kg,source_protocol_key,source_protocol_version,source_setup,source_measurement_source,source_quality_status,percentage,calculated_target,target_unit,set_targets,locked_at',
      )
      .eq(
        'session_exercise_id',
        sessionExerciseId,
      )
      .maybeSingle()

  if (result.error) {
    throw result.error
  }

  if (!result.data) {
    return null
  }

  return targetFromRow(
    result.data as
      TargetRow,
  )
}

export async function saveExerciseTestTarget(
  profile:
    AppProfile,

  sessionExerciseId:
    string,

  target:
    DerivedTarget,
) {
  assertCoach(profile)

  if (isDemo(profile)) {
    return target
  }

  const result =
    await supabase!
      .from(
        'exercise_test_targets',
      )
      .upsert(
        targetToRow(
          sessionExerciseId,
          target,
        ),
        {
          onConflict:
            'session_exercise_id',
        },
      )
      .select(
        'session_exercise_id',
      )
      .single()

  if (result.error) {
    throw result.error
  }

  return target
}

export async function clearExerciseTestTarget(
  profile:
    AppProfile,

  sessionExerciseId:
    string,
) {
  assertCoach(profile)

  if (isDemo(profile)) {
    return
  }

  const result =
    await supabase!
      .from(
        'exercise_test_targets',
      )
      .delete()
      .eq(
        'session_exercise_id',
        sessionExerciseId,
      )

  if (result.error) {
    throw result.error
  }
}
