import { dataRuntime } from '../dataRuntime'
import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'
import { normalizeProgramType, type ProgramType } from '../programs/programType'
import { nextSequence, type ProgramBuilderData } from './programBuilder'

const demo: ProgramBuilderData = {
  source: 'demo',
  athletes: [{ id: 'demo-a', name: 'Sara Monti' }],
  programs: [{ id: 'demo-p', athleteId: 'demo-a', name: 'Forza dita', goal: 'Costruzione forza massima', programType: 'athlete', status: 'draft', startDate: '2026-09-07', endDate: null }],
  weeks: [{ id: 'demo-w', programId: 'demo-p', weekNumber: 1, blockName: 'Carico 1', phase: 'Forza', status: 'planned' }],
  sessions: [{ id: 'demo-s', weekId: 'demo-w', order: 1, title: 'Forza dita', objective: 'Forza massima', durationMinutes: 55, scheduledDay: 2 }],
  library: [
    { id: 'demo-l1', name: 'Block lift · 20 mm', category: 'Dita', defaultInstructions: 'Trazione progressiva, spalla attiva.', defaultPrescription: { sets: 4, seconds: 5, loadKg: 32.5 } },
    { id: 'demo-l2', name: 'Pull-up zavorrato', category: 'Trazione', defaultInstructions: null, defaultPrescription: { sets: 5, reps: 3, loadKg: 20 } },
  ],
  exercises: [{ id: 'demo-e', sessionId: 'demo-s', exerciseId: 'demo-l1', order: 1, name: 'Block lift · 20 mm', prescription: { sets: 4, seconds: 5, loadKg: 32.5 }, targetRpeMin: 7, targetRpeMax: 8, restSeconds: 180, instructions: 'Trazione progressiva, spalla attiva.' }],
}

const isDemo = (profile: AppProfile) => !supabase || profile.userId.startsWith('00000000-') || dataRuntime.backendSchema !== 'legacy-v1'
const assertCoach = (profile: AppProfile) => { if (profile.role !== 'coach') throw new Error('Il Program Builder è riservato al coach.') }

export async function loadProgramBuilder(profile: AppProfile): Promise<ProgramBuilderData> {
  assertCoach(profile)
  if (isDemo(profile)) return demo

  const [relationsResult, programsResult, libraryResult] = await Promise.all([
    supabase!.from('coach_athletes').select('athlete_id').eq('coach_id', profile.userId).eq('status', 'active'),
    supabase!.from('programs').select('id,athlete_id,name,goal,program_type,status,start_date,end_date').eq('coach_id', profile.userId).order('updated_at', { ascending: false }),
    supabase!.from('exercise_library').select('id,name,category,default_instructions,default_prescription').eq('coach_id', profile.userId).eq('archived', false).order('name'),
  ])
  for (const result of [relationsResult, programsResult, libraryResult]) if (result.error) throw result.error

  const athleteIds = (relationsResult.data ?? []).map(row => row.athlete_id as string)
  const profilesResult = athleteIds.length
    ? await supabase!.from('athletes').select('id,first_name,last_name').in('id', athleteIds)
    : { data: [], error: null }
  if (profilesResult.error) throw profilesResult.error

  const programs = (programsResult.data ?? []).map(row => ({ id: row.id, athleteId: row.athlete_id, name: row.name, goal: row.goal, programType: normalizeProgramType(row.program_type), status: row.status, startDate: row.start_date, endDate: row.end_date })) as ProgramBuilderData['programs']
  const programIds = programs.map(program => program.id)
  const weeksResult = programIds.length
    ? await supabase!.from('training_weeks').select('id,program_id,week_number,block_name,phase,status').in('program_id', programIds).order('week_number')
    : { data: [], error: null }
  if (weeksResult.error) throw weeksResult.error
  const weeks = (weeksResult.data ?? []).map(row => ({ id: row.id, programId: row.program_id, weekNumber: row.week_number, blockName: row.block_name, phase: row.phase, status: row.status })) as ProgramBuilderData['weeks']
  const weekIds = weeks.map(week => week.id)
  const sessionsResult = weekIds.length
    ? await supabase!.from('sessions').select('id,training_week_id,session_order,title,objective,duration_minutes,scheduled_day').in('training_week_id', weekIds).order('session_order')
    : { data: [], error: null }
  if (sessionsResult.error) throw sessionsResult.error
  const sessions = (sessionsResult.data ?? []).map(row => ({ id: row.id, weekId: row.training_week_id, order: row.session_order, title: row.title, objective: row.objective, durationMinutes: row.duration_minutes, scheduledDay: row.scheduled_day })) as ProgramBuilderData['sessions']
  const sessionIds = sessions.map(session => session.id)
  const exercisesResult = sessionIds.length
    ? await supabase!.from('session_exercises').select('id,session_id,exercise_id,exercise_order,exercise_name,prescription,target_rpe_min,target_rpe_max,rest_seconds,instructions').in('session_id', sessionIds).order('exercise_order')
    : { data: [], error: null }
  if (exercisesResult.error) throw exercisesResult.error

  return {
    source: 'legacy-v1',
    athletes: (profilesResult.data ?? []).map(row => ({ id: row.id, name: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'Atleta' })),
    programs,
    weeks,
    sessions,
    library: (libraryResult.data ?? []).map(row => ({ id: row.id, name: row.name, category: row.category, defaultInstructions: row.default_instructions, defaultPrescription: (row.default_prescription ?? {}) as Record<string, unknown> })),
    exercises: (exercisesResult.data ?? []).map(row => ({ id: row.id, sessionId: row.session_id, exerciseId: row.exercise_id, order: row.exercise_order, name: row.exercise_name, prescription: (row.prescription ?? {}) as Record<string, unknown>, targetRpeMin: row.target_rpe_min === null ? null : Number(row.target_rpe_min), targetRpeMax: row.target_rpe_max === null ? null : Number(row.target_rpe_max), restSeconds: row.rest_seconds, instructions: row.instructions })),
  }
}

export async function createProgram(profile: AppProfile, athleteId: string, name: string, goal: string, programType: ProgramType) {
  assertCoach(profile); if (isDemo(profile)) return 'demo-p'
  const result = await supabase!.from('programs').insert({ coach_id: profile.userId, athlete_id: athleteId, name: name.trim(), goal: goal.trim() || null, program_type: programType, status: 'draft', start_date: new Date().toISOString().slice(0, 10) }).select('id').single()
  if (result.error) throw result.error
  return result.data.id as string
}

export async function createWeek(profile: AppProfile, programId: string, existingNumbers: number[]) {
  assertCoach(profile); if (isDemo(profile)) return 'demo-w'
  const weekNumber = nextSequence(existingNumbers)
  const result = await supabase!.from('training_weeks').insert({ program_id: programId, week_number: weekNumber, block_name: `Settimana ${weekNumber}`, status: 'planned' }).select('id').single()
  if (result.error) throw result.error
  return result.data.id as string
}

export async function createSession(profile: AppProfile, weekId: string, existingOrders: number[]) {
  assertCoach(profile); if (isDemo(profile)) return 'demo-s'
  const order = nextSequence(existingOrders)
  const result = await supabase!.from('sessions').insert({ training_week_id: weekId, session_order: order, title: `Sessione ${order}`, scheduled_day: Math.min(order, 7) }).select('id').single()
  if (result.error) throw result.error
  return result.data.id as string
}

export async function updateWeekDetails(profile: AppProfile, weekId: string, blockName: string, phase: string) {
  assertCoach(profile); if (isDemo(profile)) return
  const result = await supabase!.from('training_weeks').update({ block_name: blockName.trim() || null, phase: phase.trim() || null }).eq('id', weekId).select('id').single()
  if (result.error) throw result.error
}

export async function updateSessionDetails(profile: AppProfile, sessionId: string, title: string, objective: string, durationMinutes: number, scheduledDay: number) {
  assertCoach(profile); if (isDemo(profile)) return
  if (!title.trim()) throw new Error('Inserisci un titolo per la sessione.')
  const result = await supabase!.from('sessions').update({ title: title.trim(), objective: objective.trim() || null, duration_minutes: durationMinutes || null, scheduled_day: Math.min(7, Math.max(1, scheduledDay)) }).eq('id', sessionId).select('id').single()
  if (result.error) throw result.error
}

export async function addExercise(profile: AppProfile, sessionId: string, existingOrders: number[], name: string, libraryExercise?: ProgramBuilderData['library'][number]) {
  assertCoach(profile); if (isDemo(profile)) return 'demo-e'
  const result = await supabase!.from('session_exercises').insert({
    session_id: sessionId,
    exercise_id: libraryExercise?.id ?? null,
    exercise_order: nextSequence(existingOrders),
    exercise_name: (libraryExercise?.name ?? name).trim(),
    prescription: libraryExercise?.defaultPrescription ?? { sets: 3, reps: 5 },
    target_rpe_min: 6,
    target_rpe_max: 8,
    rest_seconds: 120,
    instructions: libraryExercise?.defaultInstructions ?? null,
  }).select('id').single()
  if (result.error) throw result.error
  return result.data.id as string
}

export type ExercisePatch = { sets: number; reps: number; seconds: number; loadKg: number; rpe: number; restSeconds: number; instructions: string }

export async function updateExercise(profile: AppProfile, exerciseId: string, patch: ExercisePatch) {
  assertCoach(profile); if (isDemo(profile)) return
  const result = await supabase!.from('session_exercises').update({
    prescription: { sets: patch.sets, reps: patch.reps || undefined, seconds: patch.seconds || undefined, loadKg: patch.loadKg || undefined },
    target_rpe_min: Math.max(0, patch.rpe - 1),
    target_rpe_max: patch.rpe,
    rest_seconds: patch.restSeconds,
    instructions: patch.instructions.trim() || null,
  }).eq('id', exerciseId).select('id').single()
  if (result.error) throw result.error
}

export async function publishProgram(profile: AppProfile, programId: string, athleteId: string) {
  assertCoach(profile); if (isDemo(profile)) return
  const previous = await supabase!.from('programs').select('id').eq('coach_id', profile.userId).eq('athlete_id', athleteId).eq('status', 'active').neq('id', programId)
  if (previous.error) throw previous.error
  const previousIds = (previous.data ?? []).map(row => row.id as string)
  if (previousIds.length) {
    const archive = await supabase!.from('programs').update({ status: 'archived' }).in('id', previousIds).select('id')
    if (archive.error) throw archive.error
  }
  const activate = await supabase!.from('programs').update({ status: 'active' }).eq('id', programId).eq('coach_id', profile.userId).select('id').single()
  if (activate.error) {
    if (previousIds.length) await supabase!.from('programs').update({ status: 'active' }).in('id', previousIds)
    throw activate.error
  }
}
