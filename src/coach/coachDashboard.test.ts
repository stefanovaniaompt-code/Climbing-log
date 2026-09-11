import { describe, expect, it } from 'vitest'
import { buildCoachDashboard, type CoachDashboardRows } from './coachDashboard'

const rows: CoachDashboardRows = {
  relationships: [{ athlete_id: 'athlete-1', status: 'active' }],
  profiles: [{ id: 'athlete-1', full_name: 'Marta Rossi', first_name: 'Marta', last_name: 'Rossi' }],
  programs: [{ id: 'program-1', athlete_id: 'athlete-1', name: 'Forza dita', status: 'active', created_at: '2026-09-01' }],
  weeks: [{ id: 'week-1', program_id: 'program-1', week_number: 3, status: 'current', start_date: '2026-09-01' }],
  sessions: [{ id: 'session-1', training_week_id: 'week-1' }, { id: 'session-2', training_week_id: 'week-1' }],
  logs: [{ id: 'log-1', session_id: 'session-1', athlete_id: 'athlete-1', status: 'completed', session_rpe: 9, started_at: '2026-09-02T09:00:00Z', completed_at: '2026-09-02T10:00:00Z', created_at: '2026-09-02T09:00:00Z' }],
  tests: [{ id: 'test-1', athlete_id: 'athlete-1', tested_at: '2026-09-03' }],
}

describe('buildCoachDashboard', () => {
  it('calcola aderenza e segnala RPE alto dai dati reali', () => {
    const result = buildCoachDashboard(rows, 'legacy-v1')
    expect(result.activeAthletes).toBe(1)
    expect(result.averageAdherence).toBe(50)
    expect(result.needsReview).toBe(1)
    expect(result.athletes[0]).toMatchObject({ name: 'Marta Rossi', adherence: 50, averageRpe: 9, programLabel: 'Forza dita · W03' })
    expect(result.alerts.some(alert => alert.id === 'rpe-athlete-1')).toBe(true)
  })

  it('non inventa una percentuale quando non esistono sessioni pianificate', () => {
    const result = buildCoachDashboard({ ...rows, sessions: [], logs: [] }, 'legacy-v1')
    expect(result.athletes[0].adherence).toBeNull()
    expect(result.averageAdherence).toBeNull()
  })

  it('mantiene visibili le relazioni inattive senza conteggiarle nel portafoglio attivo', () => {
    const result = buildCoachDashboard({ ...rows, relationships: [{ athlete_id: 'athlete-1', status: 'inactive' }] }, 'legacy-v1')
    expect(result.activeAthletes).toBe(0)
    expect(result.relationshipDistribution.inactive).toBe(1)
    expect(result.needsReview).toBe(0)
  })
})
