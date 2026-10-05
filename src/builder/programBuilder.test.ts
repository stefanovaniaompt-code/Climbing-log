import { describe, expect, it } from 'vitest'
import { canPublishProgram, getPrescriptionSteps, latestWeek, mergePrescriptionForUpdate, nextSequence, prescriptionSummary, readPrescriptionEditorValues, type ProgramBuilderData } from './programBuilder'

describe('program builder', () => {
  it('calcola il prossimo ordine senza sovrascrivere elementi esistenti', () => expect(nextSequence([1, 3, 2])).toBe(4))
  it('individua la settimana più recente anche se non è ordinata', () => expect(latestWeek([
    { id: 'w3', programId: 'p', weekNumber: 3, blockName: null, phase: null, status: 'planned', loadType: 'load', notes: null },
    { id: 'w1', programId: 'p', weekNumber: 1, blockName: null, phase: null, status: 'planned', loadType: 'load', notes: null },
  ])?.id).toBe('w3'))
  it('riassume una prescrizione', () => expect(prescriptionSummary({ id: 'e', sessionId: 's', exerciseId: null, order: 1, name: 'Hang', prescription: { sets: 4, seconds: 5, loadKg: 20 }, targetRpeMin: 7, targetRpeMax: 8, restSeconds: 120, instructions: null })).toBe('4 serie · 5 sec · 20 kg · RPE 8'))
  it('legge prescrizioni strutturate senza dipendere dal nome esercizio', () => expect(getPrescriptionSteps({ steps: [{ label: 'Salita', loadKg: 32.5, reps: 10 }, { label: 'Picco', loadKg: 45, reps: 3 }] })).toEqual([{ label: 'Salita', loadKg: 32.5, reps: 10, seconds: 0 }, { label: 'Picco', loadKg: 45, reps: 3, seconds: 0 }]))
  it('legge carichi, serie e ripetizioni delle programmazioni storiche', () => expect(readPrescriptionEditorValues({ sets: 5, dose: '3 rep', load_value: '27.5', unit: 'kg' })).toEqual({ sets: 5, reps: 3, seconds: 0, loadKg: 27.5, steps: [] }))
  it('non altera una prescrizione storica al solo caricamento', () => {
    const current = { sets: 4, dose: '6 ripetizioni · tenuta 5 s a 90°', load_type: 'bodyweight', timer: { work_seconds: 5, repetitions: 6 } }
    const values = readPrescriptionEditorValues(current)
    expect(mergePrescriptionForUpdate(current, values)).toMatchObject({ sets: 4, dose: current.dose, load_type: 'bodyweight', timer: current.timer })
  })
  it('sincronizza i campi builder e atleta quando il coach modifica la prescrizione', () => {
    const current = { sets: 4, dose: '5 sec', load_value: '30', unit: 'kg', timer: { work_seconds: 5, repetitions: 1 } }
    expect(mergePrescriptionForUpdate(current, { sets: 5, reps: 0, seconds: 7, loadKg: 32.5, steps: [] })).toMatchObject({ sets: 5, seconds: 7, loadKg: 32.5, dose: '7 sec', load_value: '32.5', unit: 'kg', timer: { work_seconds: 7, repetitions: 1 } })
  })
  it('pubblica solo strutture complete', () => {
    const data: ProgramBuilderData = { source: 'demo', athletes: [], programs: [], library: [], weeks: [{ id: 'w', programId: 'p', weekNumber: 1, blockName: null, phase: null, status: 'planned', loadType: 'load', notes: null }], sessions: [{ id: 's', weekId: 'w', order: 1, title: 'S', objective: null, durationMinutes: null, scheduledDay: 1 }], exercises: [], calendarEvents: [] }
    expect(canPublishProgram('p', data)).toBe(false)
    data.exercises.push({ id: 'e', sessionId: 's', exerciseId: null, order: 1, name: 'Hang', prescription: {}, targetRpeMin: null, targetRpeMax: null, restSeconds: null, instructions: null })
    expect(canPublishProgram('p', data)).toBe(true)
  })
})
