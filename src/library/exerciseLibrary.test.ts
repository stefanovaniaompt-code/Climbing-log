import { describe, expect, it } from 'vitest'
import { emptyExercise, filterExercises, validateExercise, type ExerciseLibraryItem } from './exerciseLibrary'

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
})
