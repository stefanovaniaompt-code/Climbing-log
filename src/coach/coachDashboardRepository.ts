import { dataRuntime } from '../dataRuntime'
import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'
import { buildCoachDashboard, type CoachDashboardData, type CoachDashboardRows } from './coachDashboard'

const demoRows: CoachDashboardRows = {
  relationships: [
    { athlete_id: 'demo-a', status: 'active' },
    { athlete_id: 'demo-b', status: 'active' },
    { athlete_id: 'demo-c', status: 'inactive' },
  ],
  profiles: [
    { id: 'demo-a', full_name: 'Sara Monti', first_name: 'Sara', last_name: 'Monti' },
    { id: 'demo-b', full_name: 'Luca Grandi', first_name: 'Luca', last_name: 'Grandi' },
    { id: 'demo-c', full_name: 'Anna Pini', first_name: 'Anna', last_name: 'Pini' },
  ],
  programs: [
    { id: 'p-a', athlete_id: 'demo-a', name: 'Forza dita', status: 'active', created_at: '2026-08-01' },
    { id: 'p-b', athlete_id: 'demo-b', name: 'Power endurance', status: 'active', created_at: '2026-08-01' },
  ],
  weeks: [
    { id: 'w-a', program_id: 'p-a', week_number: 3, status: 'current', start_date: '2026-08-31' },
    { id: 'w-b', program_id: 'p-b', week_number: 5, status: 'current', start_date: '2026-08-31' },
  ],
  sessions: [{ id: 's-a1', training_week_id: 'w-a' }, { id: 's-a2', training_week_id: 'w-a' }, { id: 's-b1', training_week_id: 'w-b' }, { id: 's-b2', training_week_id: 'w-b' }, { id: 's-b3', training_week_id: 'w-b' }],
  logs: [
    { id: 'l-a1', session_id: 's-a1', athlete_id: 'demo-a', status: 'completed', session_rpe: 7, started_at: '2026-09-02T10:00:00Z', completed_at: '2026-09-02T11:00:00Z', created_at: '2026-09-02T10:00:00Z' },
    { id: 'l-b1', session_id: 's-b1', athlete_id: 'demo-b', status: 'completed', session_rpe: 9.2, started_at: '2026-09-03T10:00:00Z', completed_at: '2026-09-03T11:00:00Z', created_at: '2026-09-03T10:00:00Z' },
  ],
  tests: [{ id: 't-a', athlete_id: 'demo-a', tested_at: '2026-09-01' }],
}

export async function loadCoachDashboard(profile: AppProfile): Promise<CoachDashboardData> {
  if (!supabase || profile.userId.startsWith('00000000-') || dataRuntime.backendSchema !== 'legacy-v1') return buildCoachDashboard(demoRows, 'demo')
  if (profile.role !== 'coach') throw new Error('La dashboard è riservata al coach.')

  const relationshipsResult = await supabase.from('coach_athletes').select('athlete_id,status').eq('coach_id', profile.userId)
  if (relationshipsResult.error) throw relationshipsResult.error
  const relationships = (relationshipsResult.data ?? []) as CoachDashboardRows['relationships']
  const athleteIds = relationships.map(item => item.athlete_id)
  if (!athleteIds.length) return buildCoachDashboard({ relationships, profiles: [], programs: [], weeks: [], sessions: [], logs: [], tests: [] }, 'legacy-v1')

  const [profilesResult, programsResult, logsResult, testsResult] = await Promise.all([
    supabase.from('athletes').select('id,first_name,last_name').in('id', athleteIds),
    supabase.from('programs').select('id,athlete_id,name,status,created_at').eq('coach_id', profile.userId).in('athlete_id', athleteIds),
    supabase.from('session_logs').select('id,session_id,athlete_id,status,session_rpe,started_at,completed_at,created_at').in('athlete_id', athleteIds),
    supabase.from('test_sessions').select('id,athlete_id,tested_at').in('athlete_id', athleteIds).order('tested_at', { ascending: false }).limit(30),
  ])
  for (const result of [profilesResult, programsResult, logsResult, testsResult]) if (result.error) throw result.error

  const programs = (programsResult.data ?? []) as CoachDashboardRows['programs']
  const programIds = programs.map(item => item.id)
  let weeks: CoachDashboardRows['weeks'] = []
  let sessions: CoachDashboardRows['sessions'] = []
  if (programIds.length) {
    const weeksResult = await supabase.from('training_weeks').select('id,program_id,week_number,status,start_date').in('program_id', programIds)
    if (weeksResult.error) throw weeksResult.error
    weeks = (weeksResult.data ?? []) as CoachDashboardRows['weeks']
    const weekIds = weeks.map(item => item.id)
    if (weekIds.length) {
      const sessionsResult = await supabase.from('sessions').select('id,training_week_id').in('training_week_id', weekIds)
      if (sessionsResult.error) throw sessionsResult.error
      sessions = (sessionsResult.data ?? []) as CoachDashboardRows['sessions']
    }
  }

  return buildCoachDashboard({
    relationships,
    profiles: (profilesResult.data ?? []).map(row => ({ ...row, full_name: null })) as CoachDashboardRows['profiles'],
    programs,
    weeks,
    sessions,
    logs: (logsResult.data ?? []) as CoachDashboardRows['logs'],
    tests: (testsResult.data ?? []) as CoachDashboardRows['tests'],
  }, 'legacy-v1')
}
