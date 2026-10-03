import type { ProgramType } from '../programs/programType'

export type BuilderAthlete = { id: string; name: string }
export type BuilderProgram = { id: string; athleteId: string; name: string; goal: string | null; programType: ProgramType; status: 'draft' | 'active' | 'completed' | 'archived'; startDate: string | null; endDate: string | null }
export type WeekLoadType = 'load' | 'deload'
export type BuilderWeek = { id: string; programId: string; weekNumber: number; blockName: string | null; phase: string | null; status: string; loadType: WeekLoadType; notes: string | null }
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
export type PrescriptionStep = { label: string; reps: number; seconds: number; loadKg: number | null }
export type ProgramCalendarEvent = { id: string; programId: string; eventType: 'travel' | 'off' | 'unavailable' | 'note'; startDate: string; endDate: string; note: string }

export type ProgramBuilderData = {
  source: 'demo' | 'legacy-v1'
  athletes: BuilderAthlete[]
  programs: BuilderProgram[]
  weeks: BuilderWeek[]
  sessions: BuilderSession[]
  library: BuilderLibraryExercise[]
  exercises: BuilderSessionExercise[]
  calendarEvents: ProgramCalendarEvent[]
}

export const nextSequence = (values: number[]) => Math.max(0, ...values) + 1

export function latestWeek(weeks: BuilderWeek[]) {
  return weeks.reduce<BuilderWeek | null>((latest, week) => !latest || week.weekNumber > latest.weekNumber ? week : latest, null)
}

export function prescriptionSummary(exercise: BuilderSessionExercise) {
  const steps = getPrescriptionSteps(exercise.prescription)
  if (steps.length) return steps.map(formatPrescriptionStep).join(' · ')
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

export function getPrescriptionSteps(prescription: Record<string, unknown>): PrescriptionStep[] {
  if (!Array.isArray(prescription.steps)) return []
  return prescription.steps.map((value, index) => {
    const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
    const load = Number(row.loadKg)
    return { label: String(row.label ?? `Set ${index + 1}`), reps: Math.max(0, Number(row.reps) || 0), seconds: Math.max(0, Number(row.seconds) || 0), loadKg: Number.isFinite(load) && load >= 0 ? load : null }
  })
}

export function formatPrescriptionStep(step: PrescriptionStep) {
  const dose = step.reps > 0 ? `${step.reps} rep` : step.seconds > 0 ? `${step.seconds} sec` : ''
  return [step.loadKg !== null ? `${step.loadKg} kg` : '', dose].filter(Boolean).join(' × ') || step.label
}

export function canPublishProgram(programId: string, data: ProgramBuilderData) {
  const weekIds = data.weeks.filter(week => week.programId === programId).map(week => week.id)
  const sessionIds = data.sessions.filter(session => weekIds.includes(session.weekId)).map(session => session.id)
  return weekIds.length > 0 && sessionIds.length > 0 && data.exercises.some(exercise => sessionIds.includes(exercise.sessionId))
}
