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
export type PrescriptionEditorValues = { sets: number; reps: number; seconds: number; loadKg: number; steps: PrescriptionStep[] }
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
  const { sets, reps, seconds, loadKg: load } = readPrescriptionEditorValues(exercise.prescription)
  const effort = exercise.targetRpeMax ? `RPE ${exercise.targetRpeMax}` : null
  return [
    `${sets} serie`,
    reps > 0 ? `${reps} rep` : seconds > 0 ? `${seconds} sec` : null,
    load > 0 ? `${load} kg` : null,
    effort,
  ].filter(Boolean).join(' · ')
}

export function readPrescriptionEditorValues(prescription: Record<string, unknown>) {
  const dose = String(prescription.dose ?? '')
  // Older imports store variable prescriptions as prose in `dose` (for example
  // "32,5 kg × 10 · 35 kg × 8 …") rather than in the structured `steps` array.
  // Recover those rows for the coach editor without changing the stored record.
  const structuredSteps = getPrescriptionSteps(prescription)
  const steps = structuredSteps.length ? structuredSteps : parseDoseSteps(dose)
  const repsFromDose = dose.match(/(\d+(?:[.,]\d+)?)\s*(?:rep|ripetizion)/i)
  const secondsFromDose = dose.match(/(\d+(?:[.,]\d+)?)\s*(?:s|sec|second)/i)
  const legacyLoad = Number(String(prescription.load_value ?? '').replace(',', '.'))
  const modernLoad = Number(prescription.loadKg)
  const firstStep = steps[0]
  const timer = prescription.timer && typeof prescription.timer === 'object' && !Array.isArray(prescription.timer)
    ? prescription.timer as Record<string, unknown>
    : {}
  return {
    sets: steps.length || Math.max(1, Number(prescription.sets) || 1),
    reps: Math.max(0, Number(prescription.reps) || firstStep?.reps || Number(repsFromDose?.[1]?.replace(',', '.')) || Number(timer.repetitions) || 0),
    seconds: Math.max(0, Number(prescription.seconds) || firstStep?.seconds || Number(secondsFromDose?.[1]?.replace(',', '.')) || 0),
    loadKg: Number.isFinite(modernLoad) && modernLoad > 0 ? modernLoad : firstStep?.loadKg ?? (Number.isFinite(legacyLoad) && legacyLoad > 0 ? legacyLoad : 0),
    steps,
  }
}

function parseDoseSteps(dose: string): PrescriptionStep[] {
  const sequence = dose.match(/^\s*(\d+(?:\s*[-–→]\s*\d+){1,})(?:\s*(?:blocchi|rep(?:etizioni)?))?\s*$/i)
  if (sequence) {
    return sequence[1].split(/\s*[-–→]\s*/).map((value, index) => ({
      label: `Set ${index + 1}`,
      reps: Number(value),
      seconds: 0,
      loadKg: null,
    }))
  }
  const rows = dose.split(/\s*[·•;]\s*/).map(value => value.trim()).filter(Boolean)
  if (rows.length < 2) return []
  const parsed = rows.map((row, index): PrescriptionStep | null => {
    const match = row.match(/^(?:(\d+(?:[.,]\d+)?)\s*(kg|kgs)?\s*[×x]\s*)?(\d+(?:[.,]\d+)?)\s*(rep(?:etizioni)?|ripetizioni|sec(?:ondi)?|s)?$/i)
    if (!match) return null
    const first = match[1] ? Number(match[1].replace(',', '.')) : null
    const quantity = Number((match[3] ?? '').replace(',', '.'))
    const unit = (match[4] ?? '').toLowerCase()
    if (!Number.isFinite(quantity)) return null
    const isSeconds = unit.startsWith('s')
    return {
      label: `Set ${index + 1}`,
      reps: isSeconds ? 0 : quantity,
      seconds: isSeconds ? quantity : 0,
      loadKg: first,
    }
  })
  return parsed.every((step): step is PrescriptionStep => step !== null) ? parsed : []
}

export function mergePrescriptionForUpdate(current: Record<string, unknown>, next: PrescriptionEditorValues) {
  const previous = readPrescriptionEditorValues(current)
  const doseChanged = previous.reps !== next.reps || previous.seconds !== next.seconds
  const loadChanged = previous.loadKg !== next.loadKg
  const timer = current.timer && typeof current.timer === 'object' && !Array.isArray(current.timer)
    ? { ...(current.timer as Record<string, unknown>) }
    : null
  if (timer && previous.seconds !== next.seconds && next.seconds > 0) timer.work_seconds = next.seconds
  if (timer && previous.reps !== next.reps && next.reps > 0) timer.repetitions = next.reps
  const dose = [next.reps > 0 ? `${next.reps} ripetizioni` : '', next.seconds > 0 ? `${next.seconds} sec` : ''].filter(Boolean).join(' · ')
  return {
    ...current,
    sets: next.steps.length || next.sets,
    reps: next.reps,
    seconds: next.seconds,
    loadKg: next.loadKg,
    steps: next.steps.length ? next.steps : undefined,
    dose: doseChanged ? dose || null : current.dose,
    load_value: loadChanged ? next.loadKg > 0 ? String(next.loadKg) : null : current.load_value,
    unit: loadChanged ? next.loadKg > 0 ? 'kg' : null : current.unit,
    timer: timer ?? current.timer,
  }
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
