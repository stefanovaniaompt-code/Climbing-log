import { describe, expect, it } from 'vitest'
import { painExerciseFrequency, summarizeFeedback, type FeedbackEntry } from './coachFeedback'

const entry = (patch: Partial<FeedbackEntry>): FeedbackEntry => ({ id: crypto.randomUUID(), athleteId: 'a1', athleteName: 'Sara', programType: 'athlete', sessionTitle: 'Sessione', submittedAt: '2026-09-20T10:00:00Z', completionOutcome: 'completed', sessionRpe: 8, notes: '', painPresent: false, painVas: null, painExerciseId: null, painExerciseName: null, painPersistsPostSession: null, ...patch })

describe('coach feedback summaries', () => {
  const rows = [
    entry({ programType: 'athlete', completionOutcome: 'completed', sessionRpe: 8, painPresent: true }),
    entry({ programType: 'athlete', submittedAt: '2026-09-19T10:00:00Z', completionOutcome: 'not_completed', sessionRpe: 6 }),
    entry({ programType: 'patient', painPresent: true, painVas: 7, painExerciseId: 'e1', painExerciseName: 'Bloccaggio', painPersistsPostSession: true }),
    entry({ programType: 'patient', submittedAt: '2026-09-18T10:00:00Z', painPresent: false, painVas: null }),
  ]

  it('separa programmi athlete e patient mantenendo la stessa persona in entrambe le tab', () => {
    expect(summarizeFeedback(rows, 'athlete', new Date('2026-09-24')).map(item => item.athleteId)).toEqual(['a1'])
    expect(summarizeFeedback(rows, 'patient', new Date('2026-09-24')).map(item => item.athleteId)).toEqual(['a1'])
  })

  it('calcola correttamente le statistiche athlete degli ultimi 30 giorni', () => expect(summarizeFeedback(rows, 'athlete', new Date('2026-09-24'))[0]).toMatchObject({ feedbackCount: 2, completedCount: 1, notCompletedCount: 1, averageRpe: 7, painCount: 1 }))

  it('calcola correttamente le statistiche patient', () => expect(summarizeFeedback(rows, 'patient', new Date('2026-09-24'))[0]).toMatchObject({ feedbackCount: 2, painCount: 1, noPainCount: 1, latestVas: 7, averageVas: 7, maxVas: 7, persistentPainCount: 1 }))

  it('conta gli esercizi associati al dolore', () => expect(painExerciseFrequency([...rows, entry({ programType: 'patient', painPresent: true, painVas: 4, painExerciseName: 'Bloccaggio' })])).toEqual([{ name: 'Bloccaggio', count: 2 }]))
})
