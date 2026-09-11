export type TrainingWeek = {
  id: string
  weekNumber: number
  blockName: string | null
  phase: string | null
  startDate: string | null
  status: string
}

export type AthleteHomeSession = {
  id: string
  order: number
  scheduledDay: number
  title: string
  objective: string | null
  durationMinutes: number | null
  exerciseCount: number
  status: string
  sessionRpe: number | null
}

export type AthleteHomeData = {
  source: 'demo' | 'legacy-v1'
  program: { id: string; name: string; goal: string | null }
  week: TrainingWeek
  weeks: TrainingWeek[]
  sessions: AthleteHomeSession[]
}

export function selectCurrentWeek(weeks: TrainingWeek[], today = new Date()): TrainingWeek | null {
  if (weeks.length === 0) return null
  const explicitlyCurrent = weeks.find(week => week.status === 'current')
  if (explicitlyCurrent) return explicitlyCurrent

  const isoToday = today.toISOString().slice(0, 10)
  const started = weeks
    .filter(week => week.startDate && week.startDate <= isoToday)
    .sort((left, right) => (right.startDate ?? '').localeCompare(left.startDate ?? ''))
  return started[0] ?? [...weeks].sort((left, right) => left.weekNumber - right.weekNumber)[0]
}

export function summarizeWeek(sessions: AthleteHomeSession[]) {
  const completed = sessions.filter(session => session.status === 'completed')
  const sessionsWithRpe = completed.filter(session => session.sessionRpe !== null)
  const averageRpe = sessionsWithRpe.length > 0
    ? sessionsWithRpe.reduce((sum, session) => sum + (session.sessionRpe ?? 0), 0) / sessionsWithRpe.length
    : null
  return {
    completed: completed.length,
    total: sessions.length,
    exerciseCount: sessions.reduce((sum, session) => sum + session.exerciseCount, 0),
    plannedMinutes: sessions.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0),
    averageRpe,
    nextSession: sessions.find(session => session.status !== 'completed' && session.status !== 'skipped') ?? null,
  }
}

