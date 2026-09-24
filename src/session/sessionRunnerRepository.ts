import { dataRuntime } from '../dataRuntime'
import { loadAthleteHome } from '../dashboard/athleteHomeRepository'
import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'
import { normalizeProgramType } from '../programs/programType'
import { enqueueExerciseSync, isRetryableNetworkError, listPendingExerciseSync } from '../outbox'
import {
  buildActualFromPrescription,
  type ExerciseProgress,
  type ExerciseSyncPayload,
  type JsonRecord,
  type RunnerExercise,
  type SessionRunnerData,
} from './sessionRunner'
import { buildSessionFeedbackUpdate, type CompletionOutcome, type SessionFeedbackValues } from './sessionFeedback'

type SessionRow = {
  id: string
  title: string
  objective: string | null
  duration_minutes: number | null
  coach_notes: string | null
  training_weeks: unknown
}

type SessionLogRow = {
  id: string
  status: string
  completion_outcome: CompletionOutcome | null
  started_at: string | null
  completed_at: string | null
  session_rpe: number | string | null
  notes: string | null
  pain_present: boolean | null
  pain_vas: number | null
  pain_exercise_id: string | null
  pain_persists_post_session: boolean | null
  feedback_submitted_at: string | null
  feedback_updated_at: string | null
}

const SESSION_LOG_SELECT = 'id,status,completion_outcome,started_at,completed_at,session_rpe,notes,pain_present,pain_vas,pain_exercise_id,pain_persists_post_session,feedback_submitted_at,feedback_updated_at'

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

type ExerciseTestTargetRow = {
  session_exercise_id: string
  reference_type: string
  test_result_id: string | null
  metric_key: string
  source_metric_label: string | null
  source_value: number | string
  source_unit: string
  source_tested_at: string
  source_measured_at: string | null
  source_side: string | null
  source_grip: string | null
  source_body_weight_kg: number | string | null
  source_protocol_key: string | null
  source_protocol_version: string | null
  source_setup: JsonRecord | null
  source_measurement_source: string | null
  source_quality_status: string | null
  target_unit: string
  set_targets: unknown[]
  locked_at: string
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

function sessionProgramType(value: unknown) {
  if (!value || typeof value !== 'object') return normalizeProgramType(null)
  const relation = (value as { training_weeks?: unknown }).training_weeks
  const week = Array.isArray(relation) ? relation[0] : relation
  if (!week || typeof week !== 'object') return normalizeProgramType(null)
  const programs = (week as { programs?: unknown }).programs
  const program = Array.isArray(programs) ? programs[0] : programs
  return normalizeProgramType(program && typeof program === 'object' ? (program as { program_type?: unknown }).program_type : null)
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
    programType: 'athlete',
    logId: 'demo-log',
    status: 'in_progress',
    completionOutcome: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    sessionRpe: null,
    notes: '',
    painPresent: null,
    painVas: null,
    painExerciseId: null,
    painPersistsPostSession: null,
    feedbackSubmittedAt: null,
    feedbackUpdatedAt: null,
  },
  exercises: [
    { id: 'demo-ex-1', order: 1, name: 'Block lift · 20 mm', prescription: { sets: 4, dose: '5 sec', load_type: 'external', load_value: '32.5', unit: 'kg', timer: { execution_mode: 'bilateral', preparation_seconds: 5, work_seconds: 5, repetitions: 1, set_rest_seconds: 102 } }, calculationContext: {}, targetRpeMin: 7, targetRpeMax: 8, restSeconds: 102, instructions: 'Presa attiva e spalla bassa.', progress: null },
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
    supabase.from('sessions').select('id,title,objective,duration_minutes,coach_notes,training_weeks(programs(program_type))').eq('id', candidateId).maybeSingle(),
    supabase.from('session_exercises').select('id,exercise_order,exercise_name,prescription,calculation_context,target_rpe_min,target_rpe_max,rest_seconds,instructions').eq('session_id', candidateId).order('exercise_order'),
    supabase.from('session_logs').select(SESSION_LOG_SELECT).eq('session_id', candidateId).eq('athlete_id', athleteId).maybeSingle(),
  ])
  if (sessionResult.error) throw sessionResult.error
  if (exerciseResult.error) throw exerciseResult.error
  if (logResult.error) throw logResult.error
  if (!sessionResult.data) throw new Error('La sessione selezionata non è disponibile per questo atleta.')

  const exerciseRows =
    (
      exerciseResult.data ??
      []
    ) as ExerciseRow[]

  const exerciseIds =
    exerciseRows.map(
      row => row.id,
    )

  let testTargetRows:
    ExerciseTestTargetRow[] = []

  if (exerciseIds.length) {
    const targetResult =
      await supabase
        .from(
          'exercise_test_targets',
        )
        .select(
          'session_exercise_id,reference_type,test_result_id,metric_key,source_metric_label,source_value,source_unit,source_tested_at,source_measured_at,source_side,source_grip,source_body_weight_kg,source_protocol_key,source_protocol_version,source_setup,source_measurement_source,source_quality_status,target_unit,set_targets,locked_at',
        )
        .in(
          'session_exercise_id',
          exerciseIds,
        )

    if (targetResult.error) {
      throw targetResult.error
    }

    testTargetRows =
      (
        targetResult.data ??
        []
      ) as ExerciseTestTargetRow[]
  }

  const testTargetByExercise =
    new Map(
      testTargetRows.map(
        target => [
          target
            .session_exercise_id,
          target,
        ],
      ),
    )

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
  const exercises:
    RunnerExercise[] =
    exerciseRows.map(
      row => {
        const testTarget =
          testTargetByExercise.get(
            row.id,
          )

        return {
          id:
            row.id,

          order:
            row.exercise_order,

          name:
            row.exercise_name,

          prescription:
            row.prescription ??
            {},

          calculationContext: {
            ...(
              row.calculation_context ??
              {}
            ),

            ...(
              testTarget
                ? {
                    test_target:
                      testTarget,
                  }
                : {}
            ),
          },

          targetRpeMin:
            numericOrNull(
              row.target_rpe_min,
            ),

          targetRpeMax:
            numericOrNull(
              row.target_rpe_max,
            ),

          restSeconds:
            row.rest_seconds,

          instructions:
            row.instructions,

          progress:
            progressByExercise.get(
              row.id,
            ) ??
            null,
        }
      },
    )

  return {
    source: 'legacy-v1',
    session: {
      id: session.id,
      title: session.title,
      objective: session.objective,
      durationMinutes: session.duration_minutes,
      coachNotes: session.coach_notes,
      programType: sessionProgramType(session),
      logId: sessionLog?.id ?? null,
      status: sessionLog?.status ?? 'planned',
      completionOutcome: sessionLog?.completion_outcome ?? null,
      startedAt: sessionLog?.started_at ?? null,
      completedAt: sessionLog?.completed_at ?? null,
      sessionRpe: numericOrNull(sessionLog?.session_rpe ?? null),
      notes: sessionLog?.notes ?? '',
      painPresent: sessionLog?.pain_present ?? null,
      painVas: sessionLog?.pain_vas ?? null,
      painExerciseId: sessionLog?.pain_exercise_id ?? null,
      painPersistsPostSession: sessionLog?.pain_persists_post_session ?? null,
      feedbackSubmittedAt: sessionLog?.feedback_submitted_at ?? null,
      feedbackUpdatedAt: sessionLog?.feedback_updated_at ?? null,
    },
    exercises,
  }
}

async function readSessionLog(profile: AppProfile, sessionId: string): Promise<SessionLogRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('session_logs')
    .select(SESSION_LOG_SELECT)
    .eq('session_id', sessionId)
    .eq('athlete_id', athleteIdentity(profile))
    .maybeSingle()
  if (error) throw error
  return data as SessionLogRow | null
}

export async function beginSession(profile: AppProfile, sessionId: string): Promise<SessionLogRow> {
  if (!supabase || profile.userId.startsWith('00000000-')) return { id: 'demo-log', status: 'in_progress', completion_outcome: null, started_at: new Date().toISOString(), completed_at: null, session_rpe: null, notes: null, pain_present: null, pain_vas: null, pain_exercise_id: null, pain_persists_post_session: null, feedback_submitted_at: null, feedback_updated_at: null }
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
      .select(SESSION_LOG_SELECT)
      .maybeSingle()
    if (error) throw error
    return (data as SessionLogRow | null) ?? await readSessionLog(profile, sessionId) ?? existing
  }

  const { data, error } = await supabase
    .from('session_logs')
    .insert({ session_id: sessionId, athlete_id: athleteIdentity(profile), status: 'in_progress', started_at: now, autosaved_at: now })
    .select(SESSION_LOG_SELECT)
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
    actual: buildActualFromPrescription(
      exercise.prescription,
      exercise.calculationContext,
    ),
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

export async function autosaveSessionDraft(
  profile: AppProfile,
  sessionLogId: string,
  input: { rpe: number | null; notes: string },
): Promise<void> {
  if (!supabase || profile.userId.startsWith('00000000-')) return

  const autosavedAt = new Date().toISOString()

  const { error } = await supabase
    .from('session_logs')
    .update({
      session_rpe: input.rpe,
      notes: input.notes.trim() || null,
      autosaved_at: autosavedAt,
    })
    .eq('id', sessionLogId)
    .eq('athlete_id', athleteIdentity(profile))
    .eq('status', 'in_progress')

  if (error) throw error
}

export async function saveSessionFeedback(profile: AppProfile, sessionLogId: string, values: SessionFeedbackValues, current: { status: string; completedAt: string | null; feedbackSubmittedAt: string | null }) {
  const now = new Date().toISOString()
  const update = buildSessionFeedbackUpdate(values, current, now)
  if (!supabase || profile.userId.startsWith('00000000-')) return { completedAt: current.completedAt ?? now, feedbackSubmittedAt: current.feedbackSubmittedAt ?? now, feedbackUpdatedAt: current.feedbackSubmittedAt ? now : null }
  const { data, error } = await supabase
    .from('session_logs')
    .update(update)
    .eq('id', sessionLogId)
    .eq('athlete_id', athleteIdentity(profile))
    .select('completed_at,feedback_submitted_at,feedback_updated_at')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Il feedback della sessione non è più disponibile.')
  return { completedAt: data.completed_at as string, feedbackSubmittedAt: data.feedback_submitted_at as string, feedbackUpdatedAt: data.feedback_updated_at as string | null }
}
