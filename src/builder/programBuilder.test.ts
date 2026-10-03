import { describe, expect, it } from 'vitest'
import { canPublishProgram, getPrescriptionSteps, latestWeek, nextSequence, prescriptionSummary, type ProgramBuilderData } from './programBuilder'

describe('program builder', () => {
  it('calcola il prossimo ordine senza sovrascrivere elementi esistenti', () => expect(nextSequence([1, 3, 2])).toBe(4))
  it('individua la settimana più recente anche se non è ordinata', () => expect(latestWeek([
    { id: 'w3', programId: 'p', weekNumber: 3, blockName: null, phase: null, status: 'planned', loadType: 'load', notes: null },
    { id: 'w1', programId: 'p', weekNumber: 1, blockName: null, phase: null, status: 'planned', loadType: 'load', notes: null },
  ])?.id).toBe('w3'))
  it('riassume una prescrizione', () => expect(prescriptionSummary({ id: 'e', sessionId: 's', exerciseId: null, order: 1, name: 'Hang', prescription: { sets: 4, seconds: 5, loadKg: 20 }, targetRpeMin: 7, targetRpeMax: 8, restSeconds: 120, instructions: null })).toBe('4 serie · 5 sec · 20 kg · RPE 8'))
  it('legge prescrizioni strutturate senza dipendere dal nome esercizio', () => expect(getPrescriptionSteps({ steps: [{ label: 'Salita', loadKg: 32.5, reps: 10 }, { label: 'Picco', loadKg: 45, reps: 3 }] })).toEqual([{ label: 'Salita', loadKg: 32.5, reps: 10, seconds: 0 }, { label: 'Picco', loadKg: 45, reps: 3, seconds: 0 }]))
  it('pubblica solo strutture complete', () => {
    const data: ProgramBuilderData = { source: 'demo', athletes: [], programs: [], library: [], weeks: [{ id: 'w', programId: 'p', weekNumber: 1, blockName: null, phase: null, status: 'planned', loadType: 'load', notes: null }], sessions: [{ id: 's', weekId: 'w', order: 1, title: 'S', objective: null, durationMinutes: null, scheduledDay: 1 }], exercises: [], calendarEvents: [] }
    expect(canPublishProgram('p', data)).toBe(false)
    data.exercises.push({ id: 'e', sessionId: 's', exerciseId: null, order: 1, name: 'Hang', prescription: {}, targetRpeMin: null, targetRpeMax: null, restSeconds: null, instructions: null })
    expect(canPublishProgram('p', data)).toBe(true)
  })
})
