import { describe, expect, it } from 'vitest'
import { emptyExercise, filterExercises, readExerciseLibraryPrescription, updateExerciseLibraryTimerConfiguration, validateExercise, type ExerciseLibraryItem } from './exerciseLibrary'

const items: ExerciseLibraryItem[] = [
  { id: '1', name: 'Trazione zavorrata', category: 'Trazione', modality: 'Forza', description: 'Presa prona', defaultInstructions: '', defaultPrescription: { sets: 5, reps: 3, seconds: 0, loadKg: 20 }, archived: false, usageCount: 4 },
  { id: '2', name: 'Sospensione 20 mm', category: 'Dita', modality: 'Isometrico', description: '', defaultInstructions: '', defaultPrescription: { sets: 4, reps: 0, seconds: 7, loadKg: 10 }, archived: true, usageCount: 2 },
]

describe('exercise library', () => {
  it('filtra per testo senza dipendere dagli accenti', () => expect(filterExercises(items, 'trazione', '', 'all')).toHaveLength(1))
  it('separa attivi e archiviati', () => expect(filterExercises(items, '', '', 'archived').map(item => item.id)).toEqual(['2']))
  it('richiede volume valido', () => {
    const input = emptyExercise()
    input.name = 'Hang'
    input.defaultPrescription.reps = 0
    expect(validateExercise(input)).toContain('ripetizioni o durata')
  })
  it('accetta una prescrizione a tempo', () => {
    const input = emptyExercise()
    input.name = 'Hang'
    input.defaultPrescription.reps = 0
    input.defaultPrescription.seconds = 7
    expect(validateExercise(input)).toBeNull()
  })

  it('preserva timer e proprietà JSON avanzate quando si modifica una prescrizione della libreria', () => {
    const original = readExerciseLibraryPrescription({
      sets: 3, reps: 6, seconds: 7, loadKg: 25, restSeconds: 90,
      customPrescription: { protocol: 'v2' },
      timer: { mode: 'guided', execution_mode: 'single_hand', preparation_seconds: 4, hand_change_seconds: 3, interval_rest_seconds: 2, vendorTimerFlag: 'keep' },
    })
    const changed = updateExerciseLibraryTimerConfiguration(original, {
      sets: 4, reps: 8, seconds: 9, restSeconds: 120,
      mode: 'guided', executionMode: 'alternate_hands', preparationSeconds: 5, handChangeSeconds: 3, intervalRestSeconds: 2,
    })
    expect(changed).toMatchObject({
      sets: 4, reps: 8, seconds: 9, restSeconds: 120,
      customPrescription: { protocol: 'v2' },
      timer: { mode: 'guided', execution_mode: 'single_hand', preparation_seconds: 5, hand_change_seconds: 3, interval_rest_seconds: 2, vendorTimerFlag: 'keep' },
    })
  })

  it('mantiene le chiavi avanzate anche quando si rilegge il JSON già salvato', () => {
    const prescription = readExerciseLibraryPrescription({ sets: 2, reps: 5, seconds: 0, loadKg: 12, timer: { mode: 'recovery_only', futureField: 17 }, custom: 'preserve' })
    expect(prescription).toMatchObject({ timer: { mode: 'recovery_only', futureField: 17 }, custom: 'preserve' })
  })

  it('legge i campi legacy dal timer senza trasformarli in configurazioni indipendenti', () => {
    const prescription = readExerciseLibraryPrescription({ timer: { sets: 4, repetitions: 6, work_seconds: 7, set_rest_seconds: 90, execution_mode: 'single_hand' } })
    expect(prescription).toMatchObject({ sets: 4, reps: 6, seconds: 7, timer: { repetitions: 6, work_seconds: 7, set_rest_seconds: 90 } })
  })

  it('allinea una modifica globale di ripetizioni o durata alle righe strutturate preservandone i campi extra', () => {
    const original = readExerciseLibraryPrescription({
      sets: 2, reps: 10, seconds: 7, loadKg: 20,
      steps: [{ reps: 10, seconds: 7, loadKg: 20, note: 'keep-a' }, { reps: 8, seconds: 6, loadKg: 22, note: 'keep-b' }],
    })
    const changed = updateExerciseLibraryTimerConfiguration(original, {
      sets: 2, reps: 9, seconds: 5, restSeconds: null,
      mode: 'guided', executionMode: 'bilateral', preparationSeconds: 0, handChangeSeconds: 0, intervalRestSeconds: 0,
    })
    expect(changed.steps).toEqual([
      { reps: 9, seconds: 5, loadKg: 20, note: 'keep-a' },
      { reps: 9, seconds: 5, loadKg: 22, note: 'keep-b' },
    ])
  })
})
