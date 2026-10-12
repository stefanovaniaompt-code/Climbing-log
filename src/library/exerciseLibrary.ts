import { mergeTimerSettings, timerSettingsFromPrescription, type TimerEditorValues } from '../prescriptions/timerConfiguration'

export type ExercisePrescription = { sets: number; reps: number; seconds: number; loadKg: number; [key: string]: unknown }

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

export function readExerciseLibraryPrescription(value: unknown): ExercisePrescription {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const timer = row.timer && typeof row.timer === 'object' && !Array.isArray(row.timer) ? row.timer as Record<string, unknown> : {}
  return {
    ...row,
    sets: Number(row.sets) || Number(timer.sets) || 1,
    reps: Object.hasOwn(row, 'reps') ? Number(row.reps) || 0 : Number(timer.repetitions) || 0,
    seconds: Object.hasOwn(row, 'seconds') ? Number(row.seconds) || 0 : Number(timer.work_seconds) || 0,
    loadKg: Number(row.loadKg) || 0,
  } as ExercisePrescription
}

export function updateExerciseLibraryTimerConfiguration(current: ExercisePrescription, values: TimerEditorValues): ExercisePrescription {
  const next: ExercisePrescription = { ...current, sets: values.sets, reps: values.reps, seconds: values.seconds }
  const previous = timerSettingsFromLibrary(current)
  if (Array.isArray(current.steps) && (values.reps !== previous.reps || values.seconds !== previous.seconds)) {
    next.steps = current.steps.map(value => {
      const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
      return {
        ...row,
        ...(values.reps !== previous.reps ? { reps: values.reps } : {}),
        ...(values.seconds !== previous.seconds ? { seconds: values.seconds } : {}),
      }
    })
  }
  if (values.restSeconds === null) delete next.restSeconds
  else next.restSeconds = values.restSeconds
  return mergeTimerSettings(next, values) as ExercisePrescription
}

function timerSettingsFromLibrary(prescription: ExercisePrescription): TimerEditorValues {
  const restSeconds = typeof prescription.restSeconds === 'number' ? prescription.restSeconds : null
  return timerSettingsFromPrescription(prescription, restSeconds)
}

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
  defaultPrescription: {
    sets: 3, reps: 5, seconds: 0, loadKg: 0, restSeconds: 120,
    timer: { mode: 'none', execution_mode: 'bilateral', preparation_seconds: 0, hand_change_seconds: 0, interval_rest_seconds: 0 },
  },
})
