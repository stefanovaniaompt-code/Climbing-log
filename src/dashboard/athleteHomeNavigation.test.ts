import { describe, expect, it } from 'vitest'
import type { TrainingWeek } from './athleteHome'
import {
  blockForWeek,
  buildAthleteWeekBlocks,
  statusLabel,
} from './athleteHomeNavigation'

const week = (
  id: string,
  weekNumber: number,
  blockName: string | null,
): TrainingWeek => ({
  id,
  weekNumber,
  blockName,
  phase: null,
  startDate: null,
  status: 'planned',
})

describe('athlete home navigation', () => {
  it('raggruppa settimane consecutive nello stesso blocco', () => {
    const blocks = buildAthleteWeekBlocks([
      week('w1', 1, 'Forza'),
      week('w2', 2, 'Forza'),
      week('w3', 3, 'Power endurance'),
    ])

    expect(blocks).toHaveLength(2)
    expect(blocks[0].weeks.map(item => item.id)).toEqual(['w1', 'w2'])
    expect(blocks[1].weeks.map(item => item.id)).toEqual(['w3'])
  })

  it('mantiene separati blocchi con lo stesso nome se non sono consecutivi', () => {
    const blocks = buildAthleteWeekBlocks([
      week('w1', 1, 'Forza'),
      week('w2', 2, 'Volume'),
      week('w3', 3, 'Forza'),
    ])

    expect(blocks).toHaveLength(3)
    expect(blocks[0].key).not.toBe(blocks[2].key)
  })

  it('trova il blocco della settimana selezionata', () => {
    const blocks = buildAthleteWeekBlocks([
      week('w1', 1, 'Forza'),
      week('w2', 2, 'Forza'),
    ])

    expect(blockForWeek(blocks, 'w2')?.label).toBe('Forza')
    expect(blockForWeek(blocks, 'missing')).toBeNull()
  })

  it('traduce gli stati delle sessioni', () => {
    expect(statusLabel('completed')).toBe('COMPLETATA')
    expect(statusLabel('in_progress')).toBe('IN CORSO')
    expect(statusLabel('skipped')).toBe('SALTATA')
    expect(statusLabel('planned')).toBe('PIANIFICATA')
  })
})
