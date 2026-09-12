import { describe, expect, it } from 'vitest'
import { selectCurrentWeek, selectProgram, summarizeWeek, type AthleteHomeSession, type AthleteProgram, type TrainingWeek } from './athleteHome'

const weeks: TrainingWeek[] = [
  { id: 'w1', weekNumber: 1, blockName: null, phase: null, startDate: '2026-08-24', status: 'completed' },
  { id: 'w2', weekNumber: 2, blockName: null, phase: null, startDate: '2026-08-31', status: 'current' },
]

describe('athlete home selectors', () => {
  it('selects the requested active program and falls back safely', () => {
    const programs: AthleteProgram[] = [
      { id: 'p2', name: 'Program B', goal: null },
      { id: 'p1', name: 'Program A', goal: null },
    ]

    expect(selectProgram(programs, 'p1')?.id).toBe('p1')
    expect(selectProgram(programs, 'missing')?.id).toBe('p2')
    expect(selectProgram([], 'p1')).toBeNull()
  })

  it('preferisce la settimana marcata current', () => {
    expect(selectCurrentWeek(weeks, new Date('2026-09-01T12:00:00Z'))?.id).toBe('w2')
  })

  it('usa la settimana iniziata più recente se current manca', () => {
    const withoutCurrent = weeks.map(week => ({ ...week, status: 'planned' }))
    expect(selectCurrentWeek(withoutCurrent, new Date('2026-09-01T12:00:00Z'))?.id).toBe('w2')
  })

  it('calcola avanzamento e prossima sessione dai log reali', () => {
    const sessions: AthleteHomeSession[] = [
      { id: 's1', order: 1, scheduledDay: 1, title: 'A', objective: null, durationMinutes: 50, exerciseCount: 4, status: 'completed', sessionRpe: 8 },
      { id: 's2', order: 2, scheduledDay: 3, title: 'B', objective: null, durationMinutes: 40, exerciseCount: 3, status: 'in_progress', sessionRpe: null },
    ]
    expect(summarizeWeek(sessions)).toMatchObject({ completed: 1, total: 2, exerciseCount: 7, plannedMinutes: 90, averageRpe: 8, nextSession: sessions[1] })
  })
})

