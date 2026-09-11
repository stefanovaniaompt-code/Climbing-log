import { dataRuntime } from '../dataRuntime'
import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'
import type { ExerciseLibraryInput, ExerciseLibraryItem, ExercisePrescription } from './exerciseLibrary'

const demo: ExerciseLibraryItem[] = [
  { id: 'demo-1', name: 'Block lift · 20 mm', category: 'Dita', modality: 'Isometrico', description: 'Trazione su blocco con presa semiarcuata.', defaultInstructions: 'Trazione progressiva e spalla attiva.', defaultPrescription: { sets: 4, reps: 0, seconds: 5, loadKg: 32.5 }, archived: false, usageCount: 6 },
  { id: 'demo-2', name: 'Pull-up zavorrato', category: 'Trazione', modality: 'Forza', description: 'Trazione alla sbarra con sovraccarico.', defaultInstructions: 'Partenza a braccia distese, petto verso la sbarra.', defaultPrescription: { sets: 5, reps: 3, seconds: 0, loadKg: 20 }, archived: false, usageCount: 4 },
  { id: 'demo-3', name: 'Scapular pull-up', category: 'Prevenzione', modality: 'Controllo', description: 'Depressione e retrazione scapolare.', defaultInstructions: 'Gomiti estesi per tutta la ripetizione.', defaultPrescription: { sets: 3, reps: 8, seconds: 0, loadKg: 0 }, archived: false, usageCount: 3 },
  { id: 'demo-4', name: 'Repeaters · 20 mm', category: 'Dita', modality: 'Resistenza', description: 'Protocollo repeater su trave.', defaultInstructions: '', defaultPrescription: { sets: 3, reps: 6, seconds: 7, loadKg: 0 }, archived: true, usageCount: 1 },
]

const isDemo = (profile: AppProfile) => !supabase || profile.userId.startsWith('00000000-') || dataRuntime.backendSchema !== 'legacy-v1'
const assertCoach = (profile: AppProfile) => { if (profile.role !== 'coach') throw new Error('La libreria esercizi è riservata al coach.') }

const parsePrescription = (value: unknown): ExercisePrescription => {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return { sets: Number(row.sets) || 1, reps: Number(row.reps) || 0, seconds: Number(row.seconds) || 0, loadKg: Number(row.loadKg) || 0 }
}

export async function loadExerciseLibrary(profile: AppProfile): Promise<{ source: 'demo' | 'legacy-v1'; items: ExerciseLibraryItem[] }> {
  assertCoach(profile)
  if (isDemo(profile)) return { source: 'demo', items: demo }
  const libraryResult = await supabase!.from('exercise_library').select('id,name,category,modality,description,default_instructions,default_prescription,archived').eq('coach_id', profile.userId).order('name')
  if (libraryResult.error) throw libraryResult.error
  const ids = (libraryResult.data ?? []).map(row => row.id as string)
  const usageResult = ids.length ? await supabase!.from('session_exercises').select('exercise_id').in('exercise_id', ids) : { data: [], error: null }
  if (usageResult.error) throw usageResult.error
  const usage = new Map<string, number>()
  for (const row of usageResult.data ?? []) if (row.exercise_id) usage.set(row.exercise_id, (usage.get(row.exercise_id) ?? 0) + 1)
  return {
    source: 'legacy-v1',
    items: (libraryResult.data ?? []).map(row => ({
      id: row.id,
      name: row.name,
      category: row.category ?? '',
      modality: row.modality ?? '',
      description: row.description ?? '',
      defaultInstructions: row.default_instructions ?? '',
      defaultPrescription: parsePrescription(row.default_prescription),
      archived: row.archived,
      usageCount: usage.get(row.id) ?? 0,
    })),
  }
}

const serialize = (input: ExerciseLibraryInput) => ({
  name: input.name.trim(), category: input.category.trim() || null, modality: input.modality.trim() || null,
  description: input.description.trim() || null, default_instructions: input.defaultInstructions.trim() || null,
  default_prescription: input.defaultPrescription,
})

export async function createLibraryExercise(profile: AppProfile, input: ExerciseLibraryInput) {
  assertCoach(profile); if (isDemo(profile)) return 'demo-1'
  const result = await supabase!.from('exercise_library').insert({ coach_id: profile.userId, ...serialize(input) }).select('id').single()
  if (result.error) throw result.error
  return result.data.id as string
}

export async function updateLibraryExercise(profile: AppProfile, exerciseId: string, input: ExerciseLibraryInput) {
  assertCoach(profile); if (isDemo(profile)) return
  const result = await supabase!.from('exercise_library').update(serialize(input)).eq('id', exerciseId).eq('coach_id', profile.userId).select('id').single()
  if (result.error) throw result.error
}

export async function setLibraryExerciseArchived(profile: AppProfile, exerciseId: string, archived: boolean) {
  assertCoach(profile); if (isDemo(profile)) return
  const result = await supabase!.from('exercise_library').update({ archived }).eq('id', exerciseId).eq('coach_id', profile.userId).select('id').single()
  if (result.error) throw result.error
}

export async function deleteLibraryExercise(profile: AppProfile, exerciseId: string) {
  assertCoach(profile); if (isDemo(profile)) return
  const result = await supabase!
    .from('exercise_library')
    .delete()
    .eq('id', exerciseId)
    .eq('coach_id', profile.userId)
    .select('id')
    .single()
  if (result.error) throw result.error
}
