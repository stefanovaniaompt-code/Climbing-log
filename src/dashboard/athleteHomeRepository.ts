import { dataRuntime } from '../dataRuntime'
import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'
import { selectCurrentWeek, selectProgram, type AthleteHomeData, type AthleteHomeSession, type AthleteProgram, type TrainingWeek } from './athleteHome'

type ProgramRow = AthleteProgram
type WeekRow = { id: string; week_number: number; block_name: string | null; phase: string | null; start_date: string | null; status: string }
type SessionRow = { id: string; session_order: number; scheduled_day: number; title: string; objective: string | null; duration_minutes: number | null }
type SessionLogRow = { session_id: string; status: string; session_rpe: number | string | null }
type SessionExerciseRow = { session_id: string }

const demoProgram: AthleteProgram = {
  id: 'demo-program',
  name: 'Forza dita',
  goal: 'Costruzione forza massima',
}

const demoWeeks: TrainingWeek[] = [
  { id: 'demo-week-1', weekNumber: 1, blockName: 'Ingresso', phase: 'Forza', startDate: '2026-08-17', status: 'completed' },
  { id: 'demo-week-2', weekNumber: 2, blockName: 'Carico', phase: 'Forza', startDate: '2026-08-24', status: 'completed' },
  { id: 'demo-week', weekNumber: 3, blockName: 'Carico', phase: 'Forza', startDate: '2026-08-31', status: 'current' },
  { id: 'demo-week-4', weekNumber: 4, blockName: 'Carico', phase: 'Forza', startDate: '2026-09-07', status: 'planned' },
]

const demo: AthleteHomeData = {
  source: 'demo',
  program: demoProgram,
  programs: [demoProgram],
  week: demoWeeks[2],
  weeks: demoWeeks,
  sessions: [
    { id: 'demo-1', order: 1, scheduledDay: 1, title: 'Trazioni + core', objective: null, durationMinutes: 50, exerciseCount: 4, status: 'completed', sessionRpe: 7 },
    { id: 'demo-2', order: 2, scheduledDay: 4, title: 'Max hangs + trazioni', objective: 'Forza dita', durationMinutes: 55, exerciseCount: 5, status: 'in_progress', sessionRpe: null },
    { id: 'demo-3', order: 3, scheduledDay: 6, title: 'Volume parete', objective: 'Tecnica', durationMinutes: 75, exerciseCount: 3, status: 'planned', sessionRpe: null },
  ],
}

export async function loadAthleteHome(
  profile: AppProfile,
  requestedWeekId?: string | null,
  requestedProgramId?: string | null,
): Promise<AthleteHomeData | null> {
  if (!supabase || profile.userId.startsWith('00000000-') || dataRuntime.backendSchema !== 'legacy-v1') {
    if (!requestedWeekId) return demo
    const requestedWeek = demoWeeks.find(week => week.id === requestedWeekId)
    return requestedWeek ? { ...demo, week: requestedWeek } : demo
  }
  if (!profile.athleteId) throw new Error('Identità atleta non disponibile.')

  const { data: programData, error: programError } = await supabase
    .from('programs')
    .select('id,name,goal')
    .eq('athlete_id', profile.athleteId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (programError) throw programError

  const programs = (programData ?? []) as ProgramRow[]
  const program = selectProgram(programs, requestedProgramId)
  if (!program) return null

  const { data: weekData, error: weekError } = await supabase
    .from('training_weeks')
    .select('id,week_number,block_name,phase,start_date,status')
    .eq('program_id', program.id)
    .order('week_number')
  if (weekError) throw weekError

  const weeks: TrainingWeek[] = ((weekData ?? []) as WeekRow[]).map(week => ({
    id: week.id,
    weekNumber: week.week_number,
    blockName: week.block_name,
    phase: week.phase,
    startDate: week.start_date,
    status: week.status,
  }))
  const currentWeek = selectCurrentWeek(weeks)
  if (!currentWeek) return null
  const week = requestedWeekId
    ? weeks.find(item => item.id === requestedWeekId) ?? currentWeek
    : currentWeek

  const { data: sessionData, error: sessionError } = await supabase
    .from('sessions')
    .select('id,session_order,scheduled_day,title,objective,duration_minutes')
    .eq('training_week_id', week.id)
    .order('session_order')
  if (sessionError) throw sessionError
  const sessionRows = (sessionData ?? []) as SessionRow[]
  const sessionIds = sessionRows.map(session => session.id)

  let logRows: SessionLogRow[] = []
  let exerciseRows: SessionExerciseRow[] = []
  if (sessionIds.length > 0) {
    const [logs, exercises] = await Promise.all([
      supabase.from('session_logs').select('session_id,status,session_rpe').eq('athlete_id', profile.athleteId).in('session_id', sessionIds),
      supabase.from('session_exercises').select('session_id').in('session_id', sessionIds),
    ])
    if (logs.error) throw logs.error
    if (exercises.error) throw exercises.error
    logRows = (logs.data ?? []) as SessionLogRow[]
    exerciseRows = (exercises.data ?? []) as SessionExerciseRow[]
  }

  const logBySession = new Map(logRows.map(log => [log.session_id, log]))
  const exerciseCounts = new Map<string, number>()
  for (const exercise of exerciseRows) exerciseCounts.set(exercise.session_id, (exerciseCounts.get(exercise.session_id) ?? 0) + 1)

  const sessions: AthleteHomeSession[] = sessionRows.map(session => {
    const log = logBySession.get(session.id)
    return {
      id: session.id,
      order: session.session_order,
      scheduledDay: session.scheduled_day,
      title: session.title,
      objective: session.objective,
      durationMinutes: session.duration_minutes,
      exerciseCount: exerciseCounts.get(session.id) ?? 0,
      status: log?.status ?? 'planned',
      sessionRpe: log?.session_rpe === null || log?.session_rpe === undefined ? null : Number(log.session_rpe),
    }
  })

  return { source: 'legacy-v1', program, programs, week, weeks, sessions }
}
