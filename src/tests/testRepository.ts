import { dataRuntime } from '../dataRuntime'
import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'
import type { TestData, TestInput, TestResultRecord, TestSessionRecord } from './testAnalytics'

const demo: TestData = {
  source: 'demo', athletes: [{ id: 'demo-a', name: 'Sara Monti' }],
  sessions: [
    { id: 'demo-new', athleteId: 'demo-a', coachId: 'demo-c', testedAt: '2026-08-29', createdAt: '2026-08-29T10:00:00Z', bodyWeightKg: 60, protocolVersion: 'BLOCK-LIFT-20-V1', context: { posture: 'seated' }, notes: '' },
    { id: 'demo-old', athleteId: 'demo-a', coachId: 'demo-c', testedAt: '2026-05-12', createdAt: '2026-05-12T10:00:00Z', bodyWeightKg: 60.5, protocolVersion: 'BLOCK-LIFT-20-V1', context: { posture: 'seated' }, notes: '' },
  ],
  results: [
    { id: 'r1', testSessionId: 'demo-new', metricKey: 'peak_force', metricLabel: 'Forza picco', value: 48.2, unit: 'kg', side: 'right', grip: '20 mm', normalizeToBodyWeight: true, setup: { posture: 'seated' }, notes: '' },
    { id: 'r2', testSessionId: 'demo-new', metricKey: 'peak_force', metricLabel: 'Forza picco', value: 46.1, unit: 'kg', side: 'left', grip: '20 mm', normalizeToBodyWeight: true, setup: { posture: 'seated' }, notes: '' },
    { id: 'r3', testSessionId: 'demo-old', metricKey: 'peak_force', metricLabel: 'Forza picco', value: 43, unit: 'kg', side: 'right', grip: '20 mm', normalizeToBodyWeight: true, setup: { posture: 'seated' }, notes: '' },
    { id: 'r4', testSessionId: 'demo-old', metricKey: 'peak_force', metricLabel: 'Forza picco', value: 40.5, unit: 'kg', side: 'left', grip: '20 mm', normalizeToBodyWeight: true, setup: { posture: 'seated' }, notes: '' },
  ],
}

const isDemo = (profile: AppProfile) => !supabase || profile.userId.startsWith('00000000-') || dataRuntime.backendSchema !== 'legacy-v1'
const displayName = (row: { first_name: string | null; last_name: string | null }) => [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'Atleta'

export async function loadTests(profile: AppProfile): Promise<TestData> {
  if (isDemo(profile)) return demo
  let athletes: TestData['athletes'] = []
  if (profile.role === 'coach') {
    const relationships = await supabase!.from('coach_athletes').select('athlete_id').eq('coach_id', profile.userId).eq('status', 'active')
    if (relationships.error) throw relationships.error
    const ids = (relationships.data ?? []).map(row => row.athlete_id as string)
    if (ids.length) {
      const identities = await supabase!.from('athletes').select('id,first_name,last_name').in('id', ids)
      if (identities.error) throw identities.error
      athletes = (identities.data ?? []).map(row => ({ id: row.id, name: displayName(row) }))
    }
  } else {
    if (!profile.athleteId) throw new Error('Identità atleta non disponibile.')
    athletes = [{ id: profile.athleteId, name: profile.displayName }]
  }
  const athleteIds = athletes.map(athlete => athlete.id)
  if (!athleteIds.length) return { source: 'legacy-v1', athletes, sessions: [], results: [] }
  const sessionsResult = await supabase!.from('test_sessions').select('id,athlete_id,coach_id,tested_at,created_at,body_weight_kg,protocol_version,context,notes').in('athlete_id', athleteIds).order('tested_at', { ascending: false }).order('created_at', { ascending: false }).limit(200)
  if (sessionsResult.error) throw sessionsResult.error
  const sessionIds = (sessionsResult.data ?? []).map(row => row.id as string)
  const resultsResult = sessionIds.length ? await supabase!.from('test_results').select('id,test_session_id,metric_key,metric_label,value,unit,side,grip,normalize_to_body_weight,setup,notes').in('test_session_id', sessionIds) : { data: [], error: null }
  if (resultsResult.error) throw resultsResult.error
  return {
    source: 'legacy-v1', athletes,
    sessions: (sessionsResult.data ?? []).map(row => ({ id: row.id, athleteId: row.athlete_id, coachId: row.coach_id, testedAt: row.tested_at, createdAt: row.created_at, bodyWeightKg: row.body_weight_kg === null ? null : Number(row.body_weight_kg), protocolVersion: row.protocol_version ?? '', context: (row.context ?? {}) as Record<string, unknown>, notes: row.notes ?? '' })) as TestSessionRecord[],
    results: (resultsResult.data ?? []).map(row => ({ id: row.id, testSessionId: row.test_session_id, metricKey: row.metric_key, metricLabel: row.metric_label, value: Number(row.value), unit: row.unit, side: row.side, grip: row.grip ?? '', normalizeToBodyWeight: row.normalize_to_body_weight, setup: (row.setup ?? {}) as Record<string, unknown>, notes: row.notes ?? '' })) as TestResultRecord[],
  }
}

export async function createTest(profile: AppProfile, input: TestInput) {
  if (profile.role !== 'coach') {
    throw new Error('Solo il coach puo registrare manualmente un test.')
  }
  if (isDemo(profile)) return 'demo-new'
  const sessionResult = await supabase!.from('test_sessions').insert({ athlete_id: input.athleteId, coach_id: profile.role === 'coach' ? profile.userId : null, tested_at: input.testedAt, body_weight_kg: input.bodyWeightKg, protocol_version: input.protocolVersion.trim(), context: { ...input.context, capture_source: 'manual' }, notes: input.notes.trim() || null }).select('id').single()
  if (sessionResult.error) throw sessionResult.error
  const testSessionId = sessionResult.data.id as string
  const rows = input.metrics.map(metric => ({ test_session_id: testSessionId, metric_key: metric.metricKey.trim(), metric_label: metric.metricLabel.trim(), value: metric.value, unit: metric.unit.trim(), side: metric.side, grip: metric.grip.trim() || null, normalize_to_body_weight: metric.normalizeToBodyWeight, setup: { ...input.context, ...metric.setup }, notes: metric.notes.trim() || null }))
  const resultsResult = await supabase!.from('test_results').insert(rows).select('id')
  if (resultsResult.error || resultsResult.data?.length !== rows.length) {
    const rollback = await supabase!.from('test_sessions').delete().eq('id', testSessionId).select('id').single()
    if (rollback.error) throw new Error('Le misure non sono state salvate e la pulizia automatica del nuovo test richiede controllo.', { cause: rollback.error })
    throw resultsResult.error ?? new Error('Il database non ha confermato tutte le misure; il nuovo test non è stato salvato.')
  }
  return testSessionId
}

export async function deleteTest(profile: AppProfile, testSessionId: string) {
  if (profile.role !== 'coach') {
    throw new Error('Solo il coach puo eliminare una rilevazione.')
  }
  if (isDemo(profile)) return
  const result = await supabase!
    .from('test_sessions')
    .delete()
    .eq('id', testSessionId)
    .select('id')
    .single()
  if (result.error) throw result.error
}
