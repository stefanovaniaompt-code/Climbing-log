import { describe, expect, it } from 'vitest'
import { canPublishProgram, nextSequence, prescriptionSummary, type ProgramBuilderData } from './programBuilder'

describe('program builder', () => {
  it('calcola il prossimo ordine senza sovrascrivere elementi esistenti', () => expect(nextSequence([1, 3, 2])).toBe(4))
  it('riassume una prescrizione', () => expect(prescriptionSummary({ id: 'e', sessionId: 's', exerciseId: null, order: 1, name: 'Hang', prescription: { sets: 4, seconds: 5, loadKg: 20 }, targetRpeMin: 7, targetRpeMax: 8, restSeconds: 120, instructions: null })).toBe('4 serie · 5 sec · 20 kg · RPE 8'))
  it('pubblica solo strutture complete', () => {
    const data: ProgramBuilderData = { source: 'demo', athletes: [], programs: [], library: [], weeks: [{ id: 'w', programId: 'p', weekNumber: 1, blockName: null, phase: null, status: 'planned' }], sessions: [{ id: 's', weekId: 'w', order: 1, title: 'S', objective: null, durationMinutes: null, scheduledDay: 1 }], exercises: [] }
    expect(canPublishProgram('p', data)).toBe(false)
    data.exercises.push({ id: 'e', sessionId: 's', exerciseId: null, order: 1, name: 'Hang', prescription: {}, targetRpeMin: null, targetRpeMax: null, restSeconds: null, instructions: null })
    expect(canPublishProgram('p', data)).toBe(true)
  })
})
