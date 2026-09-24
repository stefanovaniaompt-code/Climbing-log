import { dataRuntime } from '../dataRuntime'
import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'
import { normalizeProgramType } from '../programs/programType'
import type { FeedbackEntry } from './coachFeedback'

export async function loadCoachFeedback(profile: AppProfile): Promise<FeedbackEntry[]> {
  if (!supabase || profile.userId.startsWith('00000000-') || dataRuntime.backendSchema !== 'legacy-v1') return []
  if (profile.role !== 'coach') throw new Error('I feedback sono disponibili nell’area coach.')
  const [relationsResult, programsResult] = await Promise.all([
    supabase.from('coach_athletes').select('athlete_id').eq('coach_id', profile.userId).eq('status', 'active'),
    supabase.from('programs').select('id,athlete_id,program_type').eq('coach_id', profile.userId),
  ])
  if (relationsResult.error) throw relationsResult.error
  if (programsResult.error) throw programsResult.error
  const athleteIds = [...new Set((relationsResult.data ?? []).map(row => row.athlete_id as string))]
  const programs = (programsResult.data ?? []) as Array<{ id: string; athlete_id: string; program_type: string | null }>
  if (!athleteIds.length || !programs.length) return []
  const [athletesResult, weeksResult] = await Promise.all([
    supabase.from('athletes').select('id,first_name,last_name').in('id', athleteIds),
    supabase.from('training_weeks').select('id,program_id').in('program_id', programs.map(program => program.id)),
  ])
  if (athletesResult.error) throw athletesResult.error
  if (weeksResult.error) throw weeksResult.error
  const weeks = (weeksResult.data ?? []) as Array<{ id: string; program_id: string }>
  if (!weeks.length) return []
  const sessionsResult = await supabase.from('sessions').select('id,training_week_id,title').in('training_week_id', weeks.map(week => week.id))
  if (sessionsResult.error) throw sessionsResult.error
  const sessions = (sessionsResult.data ?? []) as Array<{ id: string; training_week_id: string; title: string }>
  if (!sessions.length) return []
  const logsResult = await supabase.from('session_logs').select('id,session_id,athlete_id,completion_outcome,session_rpe,notes,pain_present,pain_vas,pain_exercise_id,pain_persists_post_session,feedback_submitted_at').in('session_id', sessions.map(session => session.id)).not('feedback_submitted_at', 'is', null).order('feedback_submitted_at', { ascending: false })
  if (logsResult.error) throw logsResult.error
  const logs = (logsResult.data ?? []) as Array<{ id: string; session_id: string; athlete_id: string; completion_outcome: FeedbackEntry['completionOutcome']; session_rpe: number | string | null; notes: string | null; pain_present: boolean | null; pain_vas: number | null; pain_exercise_id: string | null; pain_persists_post_session: boolean | null; feedback_submitted_at: string }>
  const painIds = [...new Set(logs.flatMap(log => log.pain_exercise_id ? [log.pain_exercise_id] : []))]
  const painExercisesResult = painIds.length ? await supabase.from('session_exercises').select('id,exercise_name').in('id', painIds) : { data: [], error: null }
  if (painExercisesResult.error) throw painExercisesResult.error
  const names = new Map((athletesResult.data ?? []).map(row => [row.id as string, [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'Atleta']))
  const programById = new Map(programs.map(program => [program.id, program])); const weekById = new Map(weeks.map(week => [week.id, week])); const sessionById = new Map(sessions.map(session => [session.id, session])); const painNames = new Map((painExercisesResult.data ?? []).map(row => [row.id as string, row.exercise_name as string]))
  return logs.flatMap(log => {
    const session = sessionById.get(log.session_id); const week = session ? weekById.get(session.training_week_id) : undefined; const program = week ? programById.get(week.program_id) : undefined
    if (!session || !program || program.athlete_id !== log.athlete_id) return []
    return [{ id: log.id, athleteId: log.athlete_id, athleteName: names.get(log.athlete_id) ?? 'Atleta', programType: normalizeProgramType(program.program_type), sessionTitle: session.title, submittedAt: log.feedback_submitted_at, completionOutcome: log.completion_outcome, sessionRpe: log.session_rpe === null ? null : Number(log.session_rpe), notes: log.notes ?? '', painPresent: log.pain_present === true, painVas: log.pain_vas, painExerciseId: log.pain_exercise_id, painExerciseName: log.pain_exercise_id ? painNames.get(log.pain_exercise_id) ?? null : null, painPersistsPostSession: log.pain_persists_post_session }]
  })
}
