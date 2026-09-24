import type { ProgramType } from '../programs/programType'

export type BuilderAthlete = { id: string; name: string }
export type BuilderProgram = { id: string; athleteId: string; name: string; goal: string | null; programType: ProgramType; status: 'draft' | 'active' | 'completed' | 'archived'; startDate: string | null; endDate: string | null }
export type BuilderWeek = { id: string; programId: string; weekNumber: number; blockName: string | null; phase: string | null; status: string }
export type BuilderSession = { id: string; weekId: string; order: number; title: string; objective: string | null; durationMinutes: number | null; scheduledDay: number }
export type BuilderLibraryExercise = { id: string; name: string; category: string | null; defaultInstructions: string | null; defaultPrescription: Record<string, unknown> }
export type BuilderSessionExercise = {
  id: string
  sessionId: string
  exerciseId: string | null
  order: number
  name: string
  prescription: Record<string, unknown>
  targetRpeMin: number | null
  targetRpeMax: number | null
  restSeconds: number | null
  instructions: string | null
}

export type ProgramBuilderData = {
  source: 'demo' | 'legacy-v1'
  athletes: BuilderAthlete[]
  programs: BuilderProgram[]
  weeks: BuilderWeek[]
  sessions: BuilderSession[]
  library: BuilderLibraryExercise[]
  exercises: BuilderSessionExercise[]
}

export const nextSequence = (values: number[]) => Math.max(0, ...values) + 1

export function prescriptionSummary(exercise: BuilderSessionExercise) {
  const sets = Number(exercise.prescription.sets) || 1
  const reps = Number(exercise.prescription.reps)
  const seconds = Number(exercise.prescription.seconds)
  const load = Number(exercise.prescription.loadKg)
  const effort = exercise.targetRpeMax ? `RPE ${exercise.targetRpeMax}` : null
  return [
    `${sets} serie`,
    reps > 0 ? `${reps} rep` : seconds > 0 ? `${seconds} sec` : null,
    load > 0 ? `${load} kg` : null,
    effort,
  ].filter(Boolean).join(' · ')
}

export function canPublishProgram(programId: string, data: ProgramBuilderData) {
  const weekIds = data.weeks.filter(week => week.programId === programId).map(week => week.id)
  const sessionIds = data.sessions.filter(session => weekIds.includes(session.weekId)).map(session => session.id)
  return weekIds.length > 0 && sessionIds.length > 0 && data.exercises.some(exercise => sessionIds.includes(exercise.sessionId))
}
