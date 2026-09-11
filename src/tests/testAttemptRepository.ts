import { dataRuntime } from '../dataRuntime'
import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'
import type { TestAttemptSyncPayload } from './testAttemptTypes'

export async function syncTestAttempt(profile: AppProfile, payload: TestAttemptSyncPayload) {
  if (!supabase || dataRuntime.backendSchema !== 'legacy-v1') return
  if (payload.ownerUserId !== profile.userId) throw new Error('Acquisizione appartenente a un altro account.')
  const rawCurvePath = `${payload.testSessionId}/${payload.attemptId}.json`
  const session = await supabase.from('test_sessions').upsert({
    id: payload.testSessionId,
    athlete_id: payload.athleteId,
    coach_id: payload.coachId,
    tested_at: payload.acquisition.startedAt.slice(0, 10),
    body_weight_kg: payload.bodyWeightKg,
    protocol_version: payload.protocolVersion,
    context: payload.config,
    mode: payload.coachId ? 'live' : 'remote',
    status: 'completed',
    started_at: payload.acquisition.startedAt,
    ended_at: payload.acquisition.endedAt,
  }, { onConflict: 'id' }).select('id').single()
  if (session.error) throw session.error

  const item = await supabase.from('test_session_items').upsert({
    id: payload.testSessionItemId,
    test_session_id: payload.testSessionId,
    item_order: 1,
    protocol_key: payload.protocolKey,
    protocol_version: payload.protocolVersion,
    side: payload.side,
    grip: payload.grip || null,
    source: 'tindeq',
    config: payload.config,
    status: 'completed',
  }, { onConflict: 'id' }).select('id').single()
  if (item.error) throw item.error

  const attempt = await supabase.from('test_attempts').upsert({
    id: payload.attemptId,
    acquisition_id: payload.acquisitionId,
    test_session_id: payload.testSessionId,
    test_session_item_id: payload.testSessionItemId,
    attempt_number: payload.attemptNumber,
    measurement_source: 'tindeq',
    device_type: 'tindeq-progressor',
    device_info: payload.acquisition.deviceInfo ?? {},
    side: payload.side,
    grip: payload.grip || null,
    protocol_key: payload.protocolKey,
    protocol_version: payload.protocolVersion,
    quality_status: payload.acquisition.qualityStatus,
    quality_flags: payload.acquisition.qualityFlags,
    primary_metric_key: payload.acquisition.primaryMetricKey,
    primary_value: payload.acquisition.primaryValue,
    primary_unit: payload.acquisition.primaryUnit,
    secondary_metrics: payload.acquisition.secondaryMetrics,
    raw_curve_path: rawCurvePath,
    sampling_metadata: payload.acquisition.samplingMetadata,
    body_weight_kg_at_test: payload.bodyWeightKg,
    started_at: payload.acquisition.startedAt,
    ended_at: payload.acquisition.endedAt,
    is_selected: payload.acquisition.qualityStatus === 'VALID',
    created_by: profile.userId,
  }, { onConflict: 'id' }).select('id').single()
  if (attempt.error) throw attempt.error

  const rawBody = JSON.stringify({ version: 1, acquisitionId: payload.acquisitionId, unit: 'N', samples: payload.acquisition.samples, metadata: payload.acquisition.samplingMetadata })
  const upload = await supabase.storage.from('test-acquisitions').upload(rawCurvePath, new Blob([rawBody], { type: 'application/json' }), { contentType: 'application/json', upsert: true })
  if (upload.error) throw upload.error

  if (payload.acquisition.primaryMetricKey && payload.acquisition.primaryValue !== null && payload.acquisition.primaryUnit) {
    const result = await supabase.from('test_results').upsert({
      id: payload.resultId,
      test_session_id: payload.testSessionId,
      attempt_id: payload.attemptId,
      metric_key: payload.acquisition.primaryMetricKey,
      metric_label: payload.acquisition.primaryMetricKey,
      value: payload.acquisition.primaryValue,
      unit: payload.acquisition.primaryUnit,
      side: payload.side,
      grip: payload.grip || null,
      normalize_to_body_weight: payload.acquisition.primaryUnit === 'N/kg' || payload.acquisition.primaryUnit === '%BW',
      setup: payload.config,
      measurement_source: 'tindeq',
      quality_status: payload.acquisition.qualityStatus,
      is_primary: true,
      protocol_key: payload.protocolKey,
      protocol_version: payload.protocolVersion,
      secondary_metrics: payload.acquisition.secondaryMetrics,
      raw_curve_path: rawCurvePath,
      body_weight_kg_at_test: payload.bodyWeightKg,
    }, { onConflict: 'id' }).select('id').single()
    if (result.error) throw result.error
  }
}

export function createAttemptPayload(profile: AppProfile, athleteId: string, protocolKey: TestAttemptSyncPayload['protocolKey'], protocolVersion: string, side: TestAttemptSyncPayload['side'], grip: string, bodyWeightKg: number | null, config: Record<string, unknown>, acquisition: TestAttemptSyncPayload['acquisition'], attemptNumber = 1): TestAttemptSyncPayload {
  return {
    ownerUserId: profile.userId,
    athleteId,
    coachId: profile.role === 'coach' ? profile.userId : null,
    testSessionId: crypto.randomUUID(),
    testSessionItemId: crypto.randomUUID(),
    attemptId: crypto.randomUUID(),
    acquisitionId: crypto.randomUUID(),
    resultId: crypto.randomUUID(),
    attemptNumber,
    protocolKey,
    protocolVersion,
    side,
    grip,
    bodyWeightKg,
    config,
    acquisition,
  }
}
