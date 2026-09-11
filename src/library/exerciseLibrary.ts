export type ExercisePrescription = { sets: number; reps: number; seconds: number; loadKg: number }

export type ExerciseLibraryItem = {
  id: string
  name: string
  category: string
  modality: string
  description: string
  defaultInstructions: string
  defaultPrescription: ExercisePrescription
  archived: boolean
  usageCount: number
}

export type ExerciseLibraryInput = Omit<ExerciseLibraryItem, 'id' | 'archived' | 'usageCount'>
export type LibraryStatusFilter = 'active' | 'archived' | 'all'

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT').trim()

export function filterExercises(items: ExerciseLibraryItem[], search: string, category: string, status: LibraryStatusFilter) {
  const query = normalize(search)
  return items.filter(item => {
    if (status === 'active' && item.archived) return false
    if (status === 'archived' && !item.archived) return false
    if (category && item.category !== category) return false
    if (!query) return true
    return normalize([item.name, item.category, item.modality, item.description].join(' ')).includes(query)
  })
}

export function validateExercise(input: ExerciseLibraryInput) {
  if (input.name.trim().length < 2) return 'Inserisci un nome di almeno 2 caratteri.'
  if (!Number.isInteger(input.defaultPrescription.sets) || input.defaultPrescription.sets < 1) return 'Le serie devono essere un numero intero maggiore di zero.'
  if (input.defaultPrescription.reps < 0 || input.defaultPrescription.seconds < 0 || input.defaultPrescription.loadKg < 0) return 'Ripetizioni, durata e carico non possono essere negativi.'
  if (input.defaultPrescription.reps === 0 && input.defaultPrescription.seconds === 0) return 'Indica almeno ripetizioni o durata.'
  return null
}

export const emptyExercise = (): ExerciseLibraryInput => ({
  name: '', category: '', modality: '', description: '', defaultInstructions: '',
  defaultPrescription: { sets: 3, reps: 5, seconds: 0, loadKg: 0 },
})
