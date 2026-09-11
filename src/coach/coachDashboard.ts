export type CoachRelationshipStatus = 'active' | 'inactive' | 'pending'

export type CoachDashboardAthlete = {
  id: string
  name: string
  initials: string
  relationshipStatus: CoachRelationshipStatus
  programLabel: string
  adherence: number | null
  completedSessions: number
  plannedSessions: number
  averageRpe: number | null
  latestActivity: string | null
  needsAttention: boolean
}

export type CoachAlert = {
  id: string
  athleteId: string
  tone: 'warning' | 'neutral'
  title: string
  detail: string
}

export type CoachDashboardData = {
  source: 'demo' | 'legacy-v1'
  athletes: CoachDashboardAthlete[]
  alerts: CoachAlert[]
  activeAthletes: number
  averageAdherence: number | null
  needsReview: number
  adherenceTrend: number[]
  relationshipDistribution: { active: number; inactive: number; pending: number }
}

export type CoachDashboardRows = {
  relationships: Array<{ athlete_id: string; status: CoachRelationshipStatus }>
  profiles: Array<{ id: string; full_name: string | null; first_name: string | null; last_name: string | null }>
  programs: Array<{ id: string; athlete_id: string; name: string; status: string; created_at: string }>
  weeks: Array<{ id: string; program_id: string; week_number: number; status: string; start_date: string | null }>
  sessions: Array<{ id: string; training_week_id: string }>
  logs: Array<{ id: string; session_id: string; athlete_id: string; status: string; session_rpe: number | string | null; started_at: string | null; completed_at: string | null; created_at: string }>
  tests: Array<{ id: string; athlete_id: string; tested_at: string }>
}

function displayName(profile: CoachDashboardRows['profiles'][number] | undefined) {
  if (!profile) return 'Atleta'
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.full_name?.trim() || 'Atleta'
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AT'
}

function latestIso(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
}

function currentWeek(weeks: CoachDashboardRows['weeks']) {
  return [...weeks].sort((a, b) => {
    const rank = (status: string) => status === 'current' ? 3 : status === 'planned' ? 2 : 1
    return rank(b.status) - rank(a.status) || b.week_number - a.week_number
  })[0]
}

export function buildCoachDashboard(rows: CoachDashboardRows, source: CoachDashboardData['source']): CoachDashboardData {
  const profiles = new Map(rows.profiles.map(profile => [profile.id, profile]))
  const athletes = rows.relationships.map(relationship => {
    const name = displayName(profiles.get(relationship.athlete_id))
    const program = rows.programs
      .filter(item => item.athlete_id === relationship.athlete_id && item.status === 'active')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    const week = program ? currentWeek(rows.weeks.filter(item => item.program_id === program.id)) : undefined
    const sessionIds = new Set(week ? rows.sessions.filter(item => item.training_week_id === week.id).map(item => item.id) : [])
    const currentLogs = rows.logs.filter(log => log.athlete_id === relationship.athlete_id && sessionIds.has(log.session_id))
    const completedSessions = currentLogs.filter(log => log.status === 'completed').length
    const plannedSessions = sessionIds.size
    const adherence = plannedSessions ? Math.round(completedSessions / plannedSessions * 100) : null
    const numericRpes = currentLogs.map(log => log.session_rpe === null ? NaN : Number(log.session_rpe)).filter(Number.isFinite)
    const averageRpe = numericRpes.length ? Math.round(numericRpes.reduce((sum, value) => sum + value, 0) / numericRpes.length * 10) / 10 : null
    const athleteLogs = rows.logs.filter(log => log.athlete_id === relationship.athlete_id)
    const latestActivity = latestIso(athleteLogs.flatMap(log => [log.completed_at, log.started_at, log.created_at]))
    const hasHighRpe = numericRpes.some(rpe => rpe >= 9)
    const hasOpenSession = currentLogs.some(log => log.status === 'in_progress')
    const needsAttention = relationship.status === 'active' && (!program || hasHighRpe || hasOpenSession || (adherence !== null && adherence < 70))

    return {
      id: relationship.athlete_id,
      name,
      initials: initials(name),
      relationshipStatus: relationship.status,
      programLabel: program ? `${program.name}${week ? ` · W${String(week.week_number).padStart(2, '0')}` : ''}` : 'Nessun programma attivo',
      adherence,
      completedSessions,
      plannedSessions,
      averageRpe,
      latestActivity,
      needsAttention,
    }
  }).sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention) || a.name.localeCompare(b.name))

  const alerts: CoachAlert[] = []
  for (const athlete of athletes.filter(item => item.relationshipStatus === 'active')) {
    if (!rows.programs.some(program => program.athlete_id === athlete.id && program.status === 'active')) {
      alerts.push({ id: `program-${athlete.id}`, athleteId: athlete.id, tone: 'warning', title: `${athlete.name} · programma`, detail: 'Nessun programma attivo assegnato.' })
    } else if (athlete.averageRpe !== null && athlete.averageRpe >= 9) {
      alerts.push({ id: `rpe-${athlete.id}`, athleteId: athlete.id, tone: 'warning', title: `${athlete.name} · RPE alto`, detail: `Media RPE ${athlete.averageRpe} nella settimana corrente.` })
    } else if (athlete.adherence !== null && athlete.adherence < 70) {
      alerts.push({ id: `adherence-${athlete.id}`, athleteId: athlete.id, tone: 'warning', title: `${athlete.name} · aderenza`, detail: `${athlete.completedSessions}/${athlete.plannedSessions} sessioni completate.` })
    }
  }
  const recentTests = [...rows.tests].sort((a, b) => b.tested_at.localeCompare(a.tested_at)).slice(0, 2)
  for (const test of recentTests) {
    const athlete = athletes.find(item => item.id === test.athlete_id)
    if (athlete) alerts.push({ id: `test-${test.id}`, athleteId: athlete.id, tone: 'neutral', title: `${athlete.name} · test registrato`, detail: `Dato del ${new Intl.DateTimeFormat('it-IT').format(new Date(`${test.tested_at}T12:00:00`))} pronto per il confronto.` })
  }

  const active = athletes.filter(athlete => athlete.relationshipStatus === 'active')
  const adherenceValues = active.map(athlete => athlete.adherence).filter((value): value is number => value !== null)
  const sixWeeks = [...rows.weeks].sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? '') || a.week_number - b.week_number).slice(-6)
  const adherenceTrend = sixWeeks.map(week => {
    const sessionIds = new Set(rows.sessions.filter(session => session.training_week_id === week.id).map(session => session.id))
    if (!sessionIds.size) return 0
    const completed = new Set(rows.logs.filter(log => log.status === 'completed' && sessionIds.has(log.session_id)).map(log => log.session_id)).size
    return Math.round(completed / sessionIds.size * 100)
  })

  return {
    source,
    athletes,
    alerts: alerts.slice(0, 5),
    activeAthletes: active.length,
    averageAdherence: adherenceValues.length ? Math.round(adherenceValues.reduce((sum, value) => sum + value, 0) / adherenceValues.length) : null,
    needsReview: active.filter(athlete => athlete.needsAttention).length,
    adherenceTrend,
    relationshipDistribution: {
      active: athletes.filter(athlete => athlete.relationshipStatus === 'active').length,
      inactive: athletes.filter(athlete => athlete.relationshipStatus === 'inactive').length,
      pending: athletes.filter(athlete => athlete.relationshipStatus === 'pending').length,
    },
  }
}
