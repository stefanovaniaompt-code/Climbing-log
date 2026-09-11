export type DataMode = 'demo' | 'supabase-ready'
export type BackendSchema = 'workspace-v2' | 'legacy-v1'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
const backendSchema = import.meta.env.VITE_BACKEND_SCHEMA === 'legacy-v1' ? 'legacy-v1' : 'workspace-v2'

export const dataRuntime = {
  mode: (supabaseUrl && publishableKey ? 'supabase-ready' : 'demo') as DataMode,
  supabaseUrl: supabaseUrl ?? null,
  publishableKey: publishableKey ?? null,
  backendSchema: backendSchema as BackendSchema,
  isConfigured: Boolean(supabaseUrl && publishableKey),
}

export type CompletedExercisePayload = {
  exerciseKey: string
  completedAt: string
  sets: Array<{ position: number; loadKg: number; durationSeconds: number; rpe: number | null }>
  note: string
}

export type SessionRepository = {
  saveCompletedExercise(payload: CompletedExercisePayload): Promise<'saved' | 'queued'>
}
