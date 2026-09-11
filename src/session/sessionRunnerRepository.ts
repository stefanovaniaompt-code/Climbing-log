import { dataRuntime } from '../dataRuntime'
import { loadAthleteHome } from '../dashboard/athleteHomeRepository'
import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'
import { enqueueExerciseSync, isRetryableNetworkError, listPendingExerciseSync } from '../outbox'
import {
  buildActualFromPrescription,
  type ExerciseProgress,
  type ExerciseSyncPayload,
  type JsonRecord,
  type RunnerExercise,
  type SessionRunnerData,
} from './sessionRunner'

type SessionRow = {
  id: string
  title: string
  objective: string | null
  duration_minutes: number | null
  coach_notes: string | null
}

type SessionLogRow = {
  id: string
  status: string
  completion_outcome: 'completed' | 'partial' | null
  started_at: string | null
  completed_at: string | null
  session_rpe: number | string | null
  notes: string | null
}

type ExerciseRow = {
  id: string
  exercise_order: number
  exercise_name: string
  prescription: JsonRecord
  calculation_context: JsonRecord
  target_rpe_min: number | string | null
  target_rpe_max: number | string | null
  rest_seconds: number | null
  instructions: string | null
}

type ExerciseLogRow = {
  id: string
  session_exercise_id: string
  completed: boolean
  actual: JsonRecord
  rpe: number | string | null
  notes: string | null
  completed_at: string | null
}

function numericOrNull(value: number | string | null): number | null {
  if (value === null) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function rowToProgress(row: Omit<ExerciseLogRow, 'session_exercise_id'> | ExerciseLogRow): ExerciseProgress {
  return {
    completed: row.completed,
    actual: row.actual ?? {},
    rpe: numericOrNull(row.rpe),
    notes: row.notes ?? '',
    completedAt: row.completed_at,
    syncState: 'synced',
  }
}

const demo: SessionRunnerData = {
  source: 'demo',
  session: {
    id: 'demo-2',
    title: 'Max hangs + trazioni',
    objective: 'Forza dita',
    durationMinutes: 55,
    coachNotes: 'Spalla bassa, presa attiva. Interrompi se perdi la posizione.',
    logId: 'demo-log',
    status: 'in_progress',
    completionOutcome: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    sessionRpe: null,
    notes: '',
  },
  exercises: [
    { id: 'demo-ex-1', order: 1, name: 'Block lift · 20 mm', prescription: { sets: 4, dose: '5 sec', load_type: 'external', load_value: '32.5', unit: 'kg', timer: { set_rest_seconds: 102 } }, calculationContext: {}, targetRpeMin: 7, targetRpeMax: 8, restSeconds: 102, instructions: 'Presa attiva e spalla bassa.', progress: null },
    { id: 'demo-ex-2', order: 2, name: 'Pull-up zavorrato', prescription: { sets: 5, dose: '3 rep', load_type: 'external', load_value: '27.5', unit: 'kg' }, calculationContext: {}, targetRpeMin: 7, targetRpeMax: 8, restSeconds: 150, instructions: null, progress: null },
  ],
}

const athleteIdentity = (profile: AppProfile) => {
  if (!profile.athleteId) throw new Error('Identità atleta non disponibile.')
  return profile.athleteId
}

export async function loadSessionRunner(profile: AppProfile, requestedSessionId?: string | null): Promise<SessionRunnerData | null> {
  if (!supabase || profile.userId.startsWith('00000000-') || dataRuntime.backendSchema !== 'legacy-v1') return demo

  const athleteId = athleteIdentity(profile)
  const home = requestedSessionId ? null : await loadAthleteHome(profile)
  const candidateId = requestedSessionId
    ?? home?.sessions.find(session => session.status === 'in_progress')?.id
    ?? home?.sessions.find(session => session.status !== 'completed' && session.status !== 'skipped')?.id
    ?? home?.sessions.at(-1)?.id
  if (!candidateId) return null

  const [sessionResult, exerciseResult, logResult] = await Promise.all([
    supabase.from('sessions').select('id,title,objective,duration_minutes,coach_notes').eq('id', candidateId).maybeSingle(),
    supabase.from('session_exercises').select('id,exercise_order,exercise_name,prescription,calculation_context,target_rpe_min,target_rpe_max,rest_seconds,instructions').eq('session_id', candidateId).order('exercise_order'),
    supabase.from('session_logs').select('id,status,completion_outcome,started_at,completed_at,session_rpe,notes').eq('session_id', candidateId).eq('athlete_id', athleteId).maybeSingle(),
  ])
  if (sessionResult.error) throw sessionResult.error
  if (exerciseResult.error) throw exerciseResult.error
  if (logResult.error) throw logResult.error
  if (!sessionResult.data) throw new Error('La sessione selezionata non è disponibile per questo atleta.')

  const session = sessionResult.data as SessionRow
  const sessionLog = logResult.data as SessionLogRow | null
  let progressRows: ExerciseLogRow[] = []
  if (sessionLog) {
    const { data, error } = await supabase
      .from('exercise_logs')
      .select('id,session_exercise_id,completed,actual,rpe,notes,completed_at')
      .eq('session_log_id', sessionLog.id)
      .eq('athlete_id', athleteId)
    if (error) throw error
    progressRows = (data ?? []) as ExerciseLogRow[]
  }

  const progressByExercise = new Map<string, ExerciseProgress>(progressRows.map(row => [row.session_exercise_id, rowToProgress(row)]))
  if (sessionLog) {
    const queuedItems = await listPendingExerciseSync(profile.userId, sessionLog.id).catch(() => [])
    for (const item of queuedItems) {
      if (progressByExercise.get(item.payload.sessionExerciseId)?.completed) continue
      progressByExercise.set(item.payload.sessionExerciseId, {
        completed: true,
        actual: item.payload.actual,
        rpe: item.payload.rpe,
        notes: item.payload.notes,
        completedAt: item.payload.completedAt,
        syncState: 'queued',
      })
    }
  }
  const exercises: RunnerExercise[] = ((exerciseResult.data ?? []) as ExerciseRow[]).map(row => ({
    id: row.id,
    order: row.exercise_order,
    name: row.exercise_name,
    prescription: row.prescription ?? {},
    calculationContext: row.calculation_context ?? {},
    targetRpeMin: numericOrNull(row.target_rpe_min),
    targetRpeMax: numericOrNull(row.target_rpe_max),
    restSeconds: row.rest_seconds,
    instructions: row.instructions,
    progress: progressByExercise.get(row.id) ?? null,
  }))

  return {
    source: 'legacy-v1',
    session: {
      id: session.id,
      title: session.title,
      objective: session.objective,
      durationMinutes: session.duration_minutes,
      coachNotes: session.coach_notes,
      logId: sessionLog?.id ?? null,
      status: sessionLog?.status ?? 'planned',
      completionOutcome: sessionLog?.completion_outcome ?? null,
      startedAt: sessionLog?.started_at ?? null,
      completedAt: sessionLog?.completed_at ?? null,
      sessionRpe: numericOrNull(sessionLog?.session_rpe ?? null),
      notes: sessionLog?.notes ?? '',
    },
    exercises,
  }
}

async function readSessionLog(profile: AppProfile, sessionId: string): Promise<SessionLogRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('session_logs')
    .select('id,status,completion_outcome,started_at,completed_at,session_rpe,notes')
    .eq('session_id', sessionId)
    .eq('athlete_id', athleteIdentity(profile))
    .maybeSingle()
  if (error) throw error
  return data as SessionLogRow | null
}

export async function beginSession(profile: AppProfile, sessionId: string): Promise<SessionLogRow> {
  if (!supabase || profile.userId.startsWith('00000000-')) return { id: 'demo-log', status: 'in_progress', completion_outcome: null, started_at: new Date().toISOString(), completed_at: null, session_rpe: null, notes: null }
  const existing = await readSessionLog(profile, sessionId)
  if (existing?.status === 'completed') return existing
  if (existing?.status === 'in_progress') return existing
  if (existing?.status === 'skipped') throw new Error('La sessione è già marcata come saltata e non viene modificata automaticamente.')

  const now = new Date().toISOString()
  if (existing) {
    const { data, error } = await supabase
      .from('session_logs')
      .update({ status: 'in_progress', started_at: existing.started_at ?? now, autosaved_at: now })
      .eq('id', existing.id)
      .eq('athlete_id', athleteIdentity(profile))
      .eq('status', 'planned')
      .select('id,status,completion_outcome,started_at,completed_at,session_rpe,notes')
      .maybeSingle()
    if (error) throw error
    return (data as SessionLogRow | null) ?? await readSessionLog(profile, sessionId) ?? existing
  }

  const { data, error } = await supabase
    .from('session_logs')
    .insert({ session_id: sessionId, athlete_id: athleteIdentity(profile), status: 'in_progress', started_at: now, autosaved_at: now })
    .select('id,status,completion_outcome,started_at,completed_at,session_rpe,notes')
    .single()
  if (!error) return data as SessionLogRow
  if (error.code === '23505') {
    const concurrent = await readSessionLog(profile, sessionId)
    if (concurrent) return concurrent
  }
  throw error
}

async function readExerciseLog(profile: AppProfile, payload: ExerciseSyncPayload): Promise<ExerciseLogRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('exercise_logs')
    .select('id,session_exercise_id,completed,actual,rpe,notes,completed_at')
    .eq('session_log_id', payload.sessionLogId)
    .eq('session_exercise_id', payload.sessionExerciseId)
    .eq('athlete_id', athleteIdentity(profile))
    .maybeSingle()
  if (error) throw error
  return data as ExerciseLogRow | null
}

async function persistExercisePayload(profile: AppProfile, payload: ExerciseSyncPayload): Promise<ExerciseProgress> {
  if (!supabase || profile.userId.startsWith('00000000-')) return { completed: true, actual: payload.actual, rpe: payload.rpe, notes: payload.notes, completedAt: payload.completedAt, syncState: 'synced' }
  if (payload.ownerUserId !== profile.userId) throw new Error('La modifica offline appartiene a un altro utente e non può essere sincronizzata.')

  const existing = await readExerciseLog(profile, payload)
  if (existing?.completed) return rowToProgress(existing)
  const values = {
    completed: true,
    actual: payload.actual,
    rpe: payload.rpe,
    notes: payload.notes || null,
    completed_at: payload.completedAt,
  }

  if (existing) {
    const { data, error } = await supabase
      .from('exercise_logs')
      .update(values)
      .eq('id', existing.id)
      .eq('athlete_id', athleteIdentity(profile))
      .eq('completed', false)
      .select('id,session_exercise_id,completed,actual,rpe,notes,completed_at')
      .maybeSingle()
    if (error) throw error
    const resolved = data as ExerciseLogRow | null ?? await readExerciseLog(profile, payload)
    if (!resolved) throw new Error('Il log esercizio non è più disponibile.')
    return rowToProgress(resolved)
  }

  const { data, error } = await supabase
    .from('exercise_logs')
    .insert({
      session_log_id: payload.sessionLogId,
      session_exercise_id: payload.sessionExerciseId,
      athlete_id: athleteIdentity(profile),
      ...values,
    })
    .select('id,session_exercise_id,completed,actual,rpe,notes,completed_at')
    .single()
  if (!error) return rowToProgress(data as ExerciseLogRow)
  if (error.code === '23505') {
    const concurrent = await readExerciseLog(profile, payload)
    if (concurrent) return rowToProgress(concurrent)
  }
  throw error
}

export async function saveExerciseProgress(profile: AppProfile, sessionLogId: string, exercise: RunnerExercise, input: { rpe: number | null; notes: string }): Promise<{ progress: ExerciseProgress; disposition: 'saved' | 'queued' }> {
  const completedAt = new Date().toISOString()
  const payload: ExerciseSyncPayload = {
    ownerUserId: profile.userId,
    sessionLogId,
    sessionExerciseId: exercise.id,
    actual: buildActualFromPrescription(exercise.prescription),
    rpe: input.rpe,
    notes: input.notes.trim(),
    completedAt,
  }
  try {
    return { progress: await persistExercisePayload(profile, payload), disposition: 'saved' }
  } catch (reason) {
    if (!isRetryableNetworkError(reason)) throw reason
    await enqueueExerciseSync(payload)
    return {
      progress: { completed: true, actual: payload.actual, rpe: payload.rpe, notes: payload.notes, completedAt, syncState: 'queued' },
      disposition: 'queued',
    }
  }
}

export async function syncQueuedExercise(profile: AppProfile, payload: ExerciseSyncPayload): Promise<void> {
  await persistExercisePayload(profile, payload)
}

export async function finishSession(profile: AppProfile, sessionLogId: string, input: { allCompleted: boolean; rpe: number | null; notes: string }) {
  const completedAt = new Date().toISOString()
  if (!supabase || profile.userId.startsWith('00000000-')) return { completedAt }
  const { data, error } = await supabase
    .from('session_logs')
    .update({
      status: 'completed',
      completed_at: completedAt,
      completion_outcome: input.allCompleted ? 'completed' : 'partial',
      session_rpe: input.rpe,
      notes: input.notes.trim() || null,
      autosaved_at: completedAt,
    })
    .eq('id', sessionLogId)
    .eq('athlete_id', athleteIdentity(profile))
    .eq('status', 'in_progress')
    .select('completed_at')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('La sessione non è in corso oppure è già stata completata.')
  return { completedAt: data.completed_at as string }
}
