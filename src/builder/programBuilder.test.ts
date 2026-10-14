import { describe, expect, it, vi } from 'vitest'
import { formatPrescription, getRestSeconds, getVariableSeries, type RunnerExercise } from '../session/sessionRunner'
import { canPublishProgram, describePrescriptionLoadAdjustment, getPrescriptionSteps, latestWeek, mergePrescriptionForUpdate, nextSequence, prescriptionSummary, readPrescriptionEditorValues, saveBeforeSelectingExercise, scalePrescriptionLoads, sessionExerciseDefaultsFromLibrary, type ProgramBuilderData } from './programBuilder'

function runnerExercise(prescription: Record<string, unknown>, restSeconds: number): RunnerExercise {
  return { id: 'e', order: 1, name: 'Hang', prescription, calculationContext: {}, targetRpeMin: 7, targetRpeMax: 8, restSeconds, instructions: null, progress: null }
}

describe('program builder', () => {
  it('salva la nuova modalità per singolo esercizio senza riscrivere istruzioni e campi storici', () => {
    const current = { sets: 1, dose: 'testo storico', custom_legacy_field: { keep: true }, timer: { mode: 'recovery_only', set_rest_seconds: 120 } }
    const saved = mergePrescriptionForUpdate(current, {
      sets: 2, reps: 0, seconds: 0, loadKg: 0,
      intentionalLoad: { version: 1, mode: 'percentage', source: { type: 'manual_max', maxKg: 27 } },
      steps: [
        { label: 'Set 1', reps: 10, seconds: 0, loadKg: null, percentage: 60 },
        { label: 'Set 2', reps: 3, seconds: 0, loadKg: null, percentage: 86 },
      ],
    })
    expect(saved).toMatchObject({
      sets: 2,
      load_type: 'percentage',
      dose: 'testo storico',
      custom_legacy_field: { keep: true },
      timer: current.timer,
      steps: [{ reps: 10, percentage: 60 }, { reps: 3, percentage: 86 }],
    })
    expect(readPrescriptionEditorValues(saved).intentionalLoad).toMatchObject({ mode: 'percentage' })
    expect(getVariableSeries(runnerExercise(saved, 120))).toEqual(['60% = 16 kg · 10 rep', '86% = 23 kg · 3 rep'])
    expect(current.sets).toBe(1)
  })

  it('calcola il prossimo ordine senza sovrascrivere elementi esistenti', () => expect(nextSequence([1, 3, 2])).toBe(4))
  it('salva le modifiche all’esercizio prima di selezionarne un altro', async () => {
    const sequence: string[] = []
    await expect(saveBeforeSelectingExercise(true, async () => { sequence.push('save'); return true }, () => sequence.push('select'))).resolves.toBe(true)
    expect(sequence).toEqual(['save', 'select'])
  })
  it('non cambia esercizio se il salvataggio esplicito fallisce', async () => {
    const select = vi.fn()
    await expect(saveBeforeSelectingExercise(true, async () => false, select)).resolves.toBe(false)
    expect(select).not.toHaveBeenCalled()
  })
  it('individua la settimana più recente anche se non è ordinata', () => expect(latestWeek([
    { id: 'w3', programId: 'p', weekNumber: 3, blockName: null, phase: null, status: 'planned', loadType: 'load', notes: null },
    { id: 'w1', programId: 'p', weekNumber: 1, blockName: null, phase: null, status: 'planned', loadType: 'load', notes: null },
  ])?.id).toBe('w3'))
  it('riassume una prescrizione', () => expect(prescriptionSummary({ id: 'e', sessionId: 's', exerciseId: null, order: 1, name: 'Hang', prescription: { sets: 4, seconds: 5, loadKg: 20 }, targetRpeMin: 7, targetRpeMax: 8, restSeconds: 120, instructions: null })).toBe('4 serie · 5 sec · 20 kg · RPE 8'))
  it('mostra nel riepilogo coach le ripetizioni della riga corretta senza modificare i dati', () => {
    const base = { id: 'e', sessionId: 's', exerciseId: null, order: 1, name: 'Hang', targetRpeMin: null, targetRpeMax: null, restSeconds: 120, instructions: null }
    const structured = { sets: 2, reps: 6, steps: [{ loadKg: 20 }, { loadKg: 25 }] }
    expect(prescriptionSummary({ ...base, prescription: structured })).toBe('20 kg × 6 rep · 25 kg × 6 rep')
    expect(structured.steps[0]).toEqual({ loadKg: 20 })
    expect(prescriptionSummary({ ...base, prescription: { sets: 2, dose: '20 kg × 8 · 25 kg × 5' } })).toBe('2 serie · 20 kg × 8 rep · 25 kg × 5 rep')
  })
  it('mantiene nel riepilogo coach le indicazioni legacy ancora descrittive', () => expect(prescriptionSummary({ id: 'e', sessionId: 's', exerciseId: null, order: 1, name: 'Hang', prescription: { sets: 3, reps: 6, seconds: 0, loadKg: 20, dose: '6 ripetizioni · tenuta 5 s a 90°' }, targetRpeMin: 7, targetRpeMax: 8, restSeconds: 120, instructions: null })).toBe('3 serie · 6 rep · 20 kg · Nota: tenuta 5 s a 90° · RPE 8'))
  it('legge prescrizioni strutturate senza dipendere dal nome esercizio', () => expect(getPrescriptionSteps({ steps: [{ label: 'Salita', loadKg: 32.5, reps: 10 }, { label: 'Picco', loadKg: 45, reps: 3 }] })).toEqual([{ label: 'Salita', loadKg: 32.5, reps: 10, seconds: 0 }, { label: 'Picco', loadKg: 45, reps: 3, seconds: 0 }]))
  it('legge carichi, serie e ripetizioni delle programmazioni storiche', () => expect(readPrescriptionEditorValues({ sets: 5, dose: '3 rep', load_value: '27.5', unit: 'kg' })).toEqual({ sets: 5, reps: 3, seconds: 0, loadKg: 27.5, steps: [] }))
  it('recupera progressioni variabili dalle prescrizioni storiche salvate in dose', () => {
    const values = readPrescriptionEditorValues({ sets: 5, dose: '32,5 kg × 10 · 35 kg × 8 · 37,5 kg × 6 · 40 kg × 4 · 45 kg × 3', load_value: 'carichi calcolati su 1RM 50,4 kg' })
    expect(values).toEqual({
      sets: 5,
      reps: 10,
      seconds: 0,
      loadKg: 32.5,
      steps: [
        { label: 'Set 1', loadKg: 32.5, reps: 10, seconds: 0 },
        { label: 'Set 2', loadKg: 35, reps: 8, seconds: 0 },
        { label: 'Set 3', loadKg: 37.5, reps: 6, seconds: 0 },
        { label: 'Set 4', loadKg: 40, reps: 4, seconds: 0 },
        { label: 'Set 5', loadKg: 45, reps: 3, seconds: 0 },
      ],
    })
  })
  it('recupera ripetizioni/tenute dal timer e le piramidi legacy', () => {
    expect(readPrescriptionEditorValues({ sets: 6, dose: '1 × 16 sec', load_value: '26', timer: { repetitions: 1, work_seconds: 16 } })).toMatchObject({ sets: 6, reps: 1, seconds: 16, loadKg: 26 })
    expect(readPrescriptionEditorValues({ sets: 6, dose: '4–2–1–1–2–4 blocchi' })).toMatchObject({ sets: 6, reps: 4, steps: [
      { label: 'Set 1', reps: 4 }, { label: 'Set 2', reps: 2 }, { label: 'Set 3', reps: 1 },
      { label: 'Set 4', reps: 1 }, { label: 'Set 5', reps: 2 }, { label: 'Set 6', reps: 4 },
    ] })
  })
  it('non altera una prescrizione storica al solo caricamento', () => {
    const current = { sets: 4, dose: '6 ripetizioni · tenuta 5 s a 90°', load_type: 'bodyweight', timer: { work_seconds: 5, repetitions: 6 } }
    const values = readPrescriptionEditorValues(current)
    expect(mergePrescriptionForUpdate(current, values)).toMatchObject({ sets: 4, dose: current.dose, load_type: 'bodyweight', timer: current.timer })
  })
  it('sincronizza i campi builder e atleta quando il coach modifica la prescrizione', () => {
    const current = { sets: 4, dose: '5 sec', load_value: '30', unit: 'kg', timer: { work_seconds: 5, repetitions: 1 } }
    expect(mergePrescriptionForUpdate(current, { sets: 5, reps: 0, seconds: 7, loadKg: 32.5, steps: [] })).toMatchObject({ sets: 5, seconds: 7, loadKg: 32.5, dose: '7 sec', load_value: '32.5', unit: 'kg', timer: { work_seconds: 7, repetitions: 0 } })
  })
  it('considera i campi moderni espliciti prima dei fallback legacy, inclusi gli zeri', () => {
    expect(readPrescriptionEditorValues({
      sets: 4,
      reps: 8,
      seconds: 0,
      loadKg: 25,
      dose: '5 sec',
      load_value: '40',
      unit: 'kg',
      timer: { work_seconds: 5, repetitions: 3 },
    })).toMatchObject({ sets: 4, reps: 8, seconds: 0, loadKg: 25 })
  })
  it('propaga al timer anche la rimozione esplicita di durata e ripetizioni', () => {
    const saved = mergePrescriptionForUpdate(
      { sets: 4, reps: 6, seconds: 5, dose: '6 ripetizioni · 5 sec', timer: { work_seconds: 5, repetitions: 6 } },
      { sets: 4, reps: 0, seconds: 0, loadKg: 0, steps: [] },
    )
    expect(saved).toMatchObject({ reps: 0, seconds: 0, dose: null, timer: { work_seconds: 0, repetitions: 0 } })
  })
  it('allinea il recupero tra serie alla prescrizione della seduta senza creare un nuovo campo timer', () => {
    const saved = mergePrescriptionForUpdate(
      { sets: 3, reps: 6, seconds: 7, timer: { mode: 'guided', set_rest_seconds: 90, custom: 'keep' } },
      { sets: 3, reps: 6, seconds: 7, loadKg: 0, steps: [], restSeconds: 120 },
    )
    expect(saved.timer).toEqual({ mode: 'guided', set_rest_seconds: 120, custom: 'keep' })
    expect(saved).not.toHaveProperty('restSeconds')
  })
  it('mantiene timer e campi avanzati quando converte un preset libreria in esercizio di sessione', () => {
    const defaults = sessionExerciseDefaultsFromLibrary({
      sets: 3, reps: 6, seconds: 7, restSeconds: 90,
      timer: { mode: 'guided', execution_mode: 'single_hand', preparation_seconds: 5, vendorOption: 'keep' },
      unknownPrescriptionField: { key: 'keep' },
    })
    expect(defaults).toEqual({
      restSeconds: 90,
      prescription: {
        sets: 3, reps: 6, seconds: 7,
        timer: { mode: 'guided', execution_mode: 'single_hand', preparation_seconds: 5, vendorOption: 'keep' },
        unknownPrescriptionField: { key: 'keep' },
      },
    })
    expect(sessionExerciseDefaultsFromLibrary({ sets: 2, reps: 3, timer: { set_rest_seconds: 75 } }).restSeconds).toBe(75)
  })
  it('mantiene coerenti il contatore serie e le righe strutturate', () => {
    const saved = mergePrescriptionForUpdate(
      { sets: 3, steps: [
        { label: 'Set 1', loadKg: 20, reps: 8 },
        { label: 'Set 2', loadKg: 22, reps: 6 },
        { label: 'Set 3', loadKg: 24, reps: 4 },
      ] },
      { sets: 2, reps: 8, seconds: 0, loadKg: 20, steps: [
        { label: 'Set 1', loadKg: 20, reps: 8, seconds: 0 },
        { label: 'Set 2', loadKg: 22, reps: 6, seconds: 0 },
        { label: 'Set 3', loadKg: 24, reps: 4, seconds: 0 },
      ] },
    )
    expect(saved.sets).toBe(2)
    expect(saved.steps).toHaveLength(2)
  })
  it('non converte carichi assenti, corpo libero o gradi in chilogrammi', () => {
    expect(getPrescriptionSteps({ steps: [{ label: 'Corpo libero', loadKg: null, reps: 5 }] })[0].loadKg).toBeNull()
    expect(readPrescriptionEditorValues({ sets: 3, load_type: 'bodyweight', load_value: '70', unit: 'kg' }).loadKg).toBe(0)
    expect(readPrescriptionEditorValues({ sets: 3, load_type: 'climbing_grade', load_value: '7a', unit: 'french' }).loadKg).toBe(0)
    expect(readPrescriptionEditorValues({ sets: 3, load_type: 'added_weight', load_value: '20', unit: 'kg' }).loadKg).toBe(20)
  })
  it('conserva la stessa prescrizione tra editor coach, persistenza e vista atleta', () => {
    const original = { sets: 3, reps: 5, seconds: 0, loadKg: 20, dose: '9 ripetizioni', load_value: '35', unit: 'kg' }
    const editor = readPrescriptionEditorValues(original)
    const saved = mergePrescriptionForUpdate(original, { ...editor, sets: 2, reps: 0, seconds: 12, loadKg: 22.5 })
    expect(readPrescriptionEditorValues(saved)).toMatchObject({ sets: 2, reps: 0, seconds: 12, loadKg: 22.5 })
    expect(formatPrescription(runnerExercise(saved, 120))).toBe('2 serie · 12 sec · 22.5 kg')
  })
  it('mostra nell’area atleta i valori moderni persistiti dal builder', () => {
    const saved = mergePrescriptionForUpdate({ sets: 3, reps: 5 }, { sets: 4, reps: 8, seconds: 0, loadKg: 25, steps: [] })
    const exercise = runnerExercise(saved, 150)
    expect(formatPrescription(exercise)).toBe('4 serie · 8 ripetizioni · 25 kg')
    expect(getRestSeconds(exercise)).toBe(150)
  })
  it('mostra nell’area atleta le righe strutturate senza normalizzare la prescrizione legacy', () => {
    const current = { sets: 5, dose: '3 rep', load_value: '27.5', unit: 'kg', custom_legacy_field: 'preserva' }
    const saved = mergePrescriptionForUpdate(current, {
      sets: 2,
      reps: 10,
      seconds: 0,
      loadKg: 32.5,
      steps: [
        { label: 'Set 1', loadKg: 32.5, reps: 10, seconds: 0 },
        { label: 'Set 2', loadKg: 35, reps: 8, seconds: 0 },
      ],
    })
    expect((saved as Record<string, unknown>).custom_legacy_field).toBe('preserva')
    expect(getVariableSeries(runnerExercise(saved, 180))).toEqual(['32.5 kg × 10 rep', '35 kg × 8 rep'])
  })
  it('varia solo i carichi numerici, mantenendo ripetizioni, tempi e righe senza carico', () => {
    const values = { sets: 3, reps: 8, seconds: 0, loadKg: 20, steps: [
      { label: 'Set 1', loadKg: 20, reps: 8, seconds: 0 },
      { label: 'Set 2', loadKg: 25, reps: 5, seconds: 0 },
      { label: 'Tenuta', loadKg: null, reps: 0, seconds: 10 },
    ] }
    expect(scalePrescriptionLoads(values, 5)).toEqual({
      ...values,
      loadKg: 21,
      steps: [
        { label: 'Set 1', loadKg: 21, reps: 8, seconds: 0 },
        { label: 'Set 2', loadKg: 26.5, reps: 5, seconds: 0 },
        { label: 'Tenuta', loadKg: null, reps: 0, seconds: 10 },
      ],
    })
  })
  it('mantiene coerenti carico principale, stringa legacy e righe scalabili', () => {
    const current = { sets: 2, dose: '20 kg × 8 · 25 kg × 5', load_value: '20', unit: 'kg' }
    const scaled = scalePrescriptionLoads(readPrescriptionEditorValues(current), 10)
    const saved = mergePrescriptionForUpdate(current, scaled)
    expect(saved).toMatchObject({
      loadKg: 22,
      load_value: '22',
      dose: '22 kg × 8 rep · 27.5 kg × 5 rep',
      steps: [
        { loadKg: 22, reps: 8 },
        { loadKg: 27.5, reps: 5 },
      ],
    })
  })
  it('distingue carichi scalabili, testi legacy e unità che non rappresentano kg', () => {
    expect(describePrescriptionLoadAdjustment({ loadKg: 20, unit: 'kg' })).toEqual({ scalableValues: 1, unscalableValues: 0 })
    expect(describePrescriptionLoadAdjustment({ load_value: '32.5', unit: 'kg' })).toEqual({ scalableValues: 1, unscalableValues: 0 })
    expect(describePrescriptionLoadAdjustment({ loadKg: 20, dose: '20 kg nella prima serie, poi aumentare progressivamente', unit: 'kg' })).toEqual({ scalableValues: 1, unscalableValues: 1 })
    expect(describePrescriptionLoadAdjustment({ load_type: 'test_percentage', load_value: '85', unit: '%' })).toEqual({ scalableValues: 0, unscalableValues: 0 })
    expect(describePrescriptionLoadAdjustment({ load_type: 'bodyweight', load_value: '70', unit: 'kg' })).toEqual({ scalableValues: 0, unscalableValues: 0 })
    expect(describePrescriptionLoadAdjustment({ load_type: 'climbing_grade', load_value: '7a', unit: 'french' })).toEqual({ scalableValues: 0, unscalableValues: 0 })
  })
  it('rifiuta variazioni sotto -100%', () => expect(() => scalePrescriptionLoads({ sets: 1, reps: 1, seconds: 0, loadKg: 10, steps: [] }, -101)).toThrow('-100%'))
  it('pubblica solo strutture complete', () => {
    const data: ProgramBuilderData = { source: 'demo', athletes: [], programs: [], library: [], weeks: [{ id: 'w', programId: 'p', weekNumber: 1, blockName: null, phase: null, status: 'planned', loadType: 'load', notes: null }], sessions: [{ id: 's', weekId: 'w', order: 1, title: 'S', objective: null, durationMinutes: null, scheduledDay: 1 }], exercises: [], calendarEvents: [] }
    expect(canPublishProgram('p', data)).toBe(false)
    data.exercises.push({ id: 'e', sessionId: 's', exerciseId: null, order: 1, name: 'Hang', prescription: {}, targetRpeMin: null, targetRpeMax: null, restSeconds: null, instructions: null })
    expect(canPublishProgram('p', data)).toBe(true)
  })
})
