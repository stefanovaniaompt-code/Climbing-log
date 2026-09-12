import { dataRuntime } from '../dataRuntime'
import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'
import type { CanonicalTestResultBundle } from './testCanonicalResults'
import type {
  TestAttemptSyncPayload,
  TestSessionDraft,
  TestSessionItemDraft,
} from './testAttemptTypes'

export { createAttemptPayload } from './testAttemptDomain'

const isDemo = (profile: AppProfile) =>
  !supabase ||
  profile.userId.startsWith('00000000-') ||
  dataRuntime.backendSchema !== 'legacy-v1'

export async function syncTestSession(
  profile: AppProfile,
  session: TestSessionDraft,
) {
  if (isDemo(profile)) return session.id

  if (
    session.coachId &&
    session.coachId !== profile.userId
  ) {
    throw new Error(
      'La sessione appartiene a un altro coach.',
    )
  }

  const result = await supabase!
    .from('test_sessions')
    .upsert(
      {
        id: session.id,
        athlete_id: session.athleteId,
        coach_id: session.coachId,
        tested_at: session.testedAt,
        body_weight_kg: session.bodyWeightKg,
        protocol_version: session.protocolVersion,
        context: session.context,
        mode: session.mode,
        status: session.status,
        started_at: session.startedAt,
        ended_at: session.endedAt,
      },
      {
        onConflict: 'id',
      },
    )
    .select('id')
    .single()

  if (result.error) throw result.error

  return result.data.id as string
}

export async function syncTestSessionItem(
  profile: AppProfile,
  item: TestSessionItemDraft,
) {
  if (isDemo(profile)) return item.id

  const result = await supabase!
    .from('test_session_items')
    .upsert(
      {
        id: item.id,
        test_session_id: item.testSessionId,
        item_order: item.itemOrder,
        protocol_key: item.protocolKey,
        protocol_version: item.protocolVersion,
        side: item.side,
        grip: item.grip || null,
        source: item.source,
        config: item.config,
        status: item.status,
      },
      {
        onConflict: 'id',
      },
    )
    .select('id')
    .single()

  if (result.error) throw result.error

  return result.data.id as string
}

export async function syncTestAttempt(
  profile: AppProfile,
  payload: TestAttemptSyncPayload,
) {
  if (isDemo(profile)) {
    return payload.attemptId
  }

  if (
    payload.ownerUserId !==
    profile.userId
  ) {
    throw new Error(
      'Acquisizione appartenente a un altro account.',
    )
  }

  const rawCurvePath =
    `${payload.testSessionId}/${payload.attemptId}.json`

  const attempt = await supabase!
    .from('test_attempts')
    .upsert(
      {
        id: payload.attemptId,
        acquisition_id:
          payload.acquisitionId,

        test_session_id:
          payload.testSessionId,

        test_session_item_id:
          payload.testSessionItemId,

        attempt_number:
          payload.attemptNumber,

        measurement_source:
          'tindeq',

        device_type:
          'tindeq-progressor',

        device_info:
          payload.acquisition.deviceInfo ?? {},

        side:
          payload.side,

        grip:
          payload.grip || null,

        protocol_key:
          payload.protocolKey,

        protocol_version:
          payload.protocolVersion,

        quality_status:
          payload.acquisition.qualityStatus,

        quality_flags:
          payload.acquisition.qualityFlags,

        primary_metric_key:
          payload.acquisition.primaryMetricKey,

        primary_value:
          payload.acquisition.primaryValue,

        primary_unit:
          payload.acquisition.primaryUnit,

        secondary_metrics:
          payload.acquisition.secondaryMetrics,

        raw_curve_path:
          rawCurvePath,

        sampling_metadata:
          payload.acquisition.samplingMetadata,

        body_weight_kg_at_test:
          payload.bodyWeightKg,

        started_at:
          payload.acquisition.startedAt,

        ended_at:
          payload.acquisition.endedAt,

        is_selected:
          false,

        created_by:
          profile.userId,
      },
      {
        onConflict: 'id',
      },
    )
    .select('id')
    .single()

  if (attempt.error) {
    throw attempt.error
  }

  const rawBody =
    JSON.stringify({
      version: 1,

      acquisitionId:
        payload.acquisitionId,

      unit: 'N',

      samples:
        payload.acquisition.samples,

      metadata:
        payload.acquisition.samplingMetadata,
    })

  const upload =
    await supabase!.storage
      .from('test-acquisitions')
      .upload(
        rawCurvePath,

        new Blob(
          [rawBody],
          {
            type:
              'application/json',
          },
        ),

        {
          contentType:
            'application/json',

          upsert:
            true,
        },
      )

  if (upload.error) {
    throw upload.error
  }

  return attempt.data.id as string
}

export async function selectTestAttempt(
  profile: AppProfile,
  bundle: CanonicalTestResultBundle,
) {
  if (bundle.qualityStatus === 'INVALID') {
    throw new Error(
      'Un tentativo non valido non può diventare risultato ufficiale.',
    )
  }

  if (isDemo(profile)) return

  const metrics =
    bundle.metrics.map(
      metric => ({
        metricKey:
          metric.metricKey,

        metricLabel:
          metric.metricLabel,

        value:
          metric.value,

        unit:
          metric.unit,

        isPrimary:
          metric.isPrimary,

        normalizeToBodyWeight:
          metric.normalizeToBodyWeight,
      }),
    )

  const result =
    await supabase!.rpc(
      'materialize_test_attempt_results',
      {
        p_test_session_item_id:
          bundle.testSessionItemId,

        p_attempt_id:
          bundle.attemptId,

        p_setup:
          bundle.setup,

        p_metrics:
          metrics,
      },
    )

  if (result.error) {
    throw result.error
  }
}
