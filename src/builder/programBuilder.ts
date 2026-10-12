import type { ProgramType } from '../programs/programType'
import { hasPrescriptionField, legacyDoseDescription, optionalNonNegativeNumber, usesKilogramLoads } from '../prescriptions/prescriptionConsistency'
import { mergeTimerSettings, readTimerSettings, timerSettingsEqual, type TimerSettings } from '../prescriptions/timerConfiguration'

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

export async function saveBeforeSelectingExercise(hasUnsavedChanges: boolean, save: () => Promise<boolean>, select: () => void) {
  if (hasUnsavedChanges && !(await save())) return false
  select()
  return true
}

export function latestWeek(weeks: BuilderWeek[]) {
  return weeks.reduce<BuilderWeek | null>((latest, week) => !latest || week.weekNumber > latest.weekNumber ? week : latest, null)
}

export function prescriptionSummary(exercise: BuilderSessionExercise) {
  const steps = getPrescriptionSteps(exercise.prescription)
  const description = legacyDoseDescription(exercise.prescription)
  const note = description ? `Nota: ${description}` : null
  if (steps.length) return [steps.map(formatPrescriptionStep).join(' · '), note].filter(Boolean).join(' · ')
  const { sets, reps, seconds, loadKg: load } = readPrescriptionEditorValues(exercise.prescription)
  const effort = exercise.targetRpeMax ? `RPE ${exercise.targetRpeMax}` : null
  return [
    `${sets} serie`,
    reps > 0 ? `${reps} rep` : seconds > 0 ? `${seconds} sec` : null,
    load > 0 ? `${load} kg` : null,
    note,
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
  const legacyLoad = optionalNonNegativeNumber(prescription.load_value)
  const modernLoad = optionalNonNegativeNumber(prescription.loadKg)
  const firstStep = steps[0]
  const timer = prescription.timer && typeof prescription.timer === 'object' && !Array.isArray(prescription.timer)
    ? prescription.timer as Record<string, unknown>
    : {}
  return {
    sets: Math.max(1, optionalNonNegativeNumber(prescription.sets) ?? (steps.length || 1)),
    reps: Math.max(0, hasPrescriptionField(prescription, 'reps')
      ? modernValue(prescription.reps)
      : (firstStep?.reps ?? (Number(repsFromDose?.[1]?.replace(',', '.')) || Number(timer.repetitions) || 0))),
    seconds: Math.max(0, hasPrescriptionField(prescription, 'seconds')
      ? modernValue(prescription.seconds)
      : (firstStep?.seconds ?? (Number(secondsFromDose?.[1]?.replace(',', '.')) || 0))),
    loadKg: usesKilogramLoads(prescription)
      ? hasPrescriptionField(prescription, 'loadKg')
        ? modernLoad ?? 0
        : firstStep?.loadKg ?? (legacyLoad !== null && legacyLoad > 0 ? legacyLoad : 0)
      : 0,
    steps,
  }
}

function modernValue(value: unknown) {
  return optionalNonNegativeNumber(value) ?? 0
}

export function resizePrescriptionSteps(steps: PrescriptionStep[], setCount: number, fallback: Pick<PrescriptionEditorValues, 'reps' | 'seconds' | 'loadKg'>): PrescriptionStep[] {
  if (!steps.length) return []
  const targetCount = Math.max(1, Math.trunc(setCount) || 1)
  if (targetCount <= steps.length) return steps.slice(0, targetCount).map(step => ({ ...step }))
  const result = steps.map(step => ({ ...step }))
  while (result.length < targetCount) {
    const previous = result.at(-1)
    result.push({
      label: `Set ${result.length + 1}`,
      reps: previous?.reps ?? fallback.reps,
      seconds: previous?.seconds ?? fallback.seconds,
      loadKg: previous?.loadKg ?? (fallback.loadKg > 0 ? fallback.loadKg : null),
    })
  }
  return result
}

export function scalePrescriptionLoads(values: PrescriptionEditorValues, percentage: number): PrescriptionEditorValues {
  if (!Number.isFinite(percentage) || percentage < -100) throw new Error('La variazione del carico non può essere inferiore a -100%.')
  const scale = (load: number) => Math.round(load * (1 + percentage / 100) * 2) / 2
  return {
    ...values,
    loadKg: values.loadKg > 0 ? scale(values.loadKg) : values.loadKg,
    steps: values.steps.map(step => ({ ...step, loadKg: step.loadKg !== null && step.loadKg > 0 ? scale(step.loadKg) : step.loadKg })),
  }
}

export function describePrescriptionLoadAdjustment(prescription: Record<string, unknown>) {
  if (!usesKilogramLoads(prescription)) return { scalableValues: 0, unscalableValues: 0 }

  let scalableValues = 0
  let unscalableValues = 0
  const countLoad = (value: unknown) => {
    const numeric = optionalNonNegativeNumber(value)
    if (numeric !== null && numeric > 0) scalableValues += 1
    else if (value !== null && value !== undefined && String(value).trim()) unscalableValues += 1
  }

  for (const key of ['loadKg', 'load_kg', 'load_value']) {
    if (hasPrescriptionField(prescription, key)) countLoad(prescription[key])
  }

  const structuredSteps = getPrescriptionSteps(prescription)
  const legacySteps = structuredSteps.length ? [] : parseDoseSteps(typeof prescription.dose === 'string' ? prescription.dose : '')
  for (const step of structuredSteps.length ? structuredSteps : legacySteps) countLoad(step.loadKg)

  const dose = typeof prescription.dose === 'string' ? prescription.dose.trim() : ''
  if (dose && /(?:^|\s)kg(?:s)?(?:\s|$|[×x,.;])/i.test(dose) && !legacySteps.length) unscalableValues += 1

  return { scalableValues, unscalableValues }
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

export function mergePrescriptionForUpdate(current: Record<string, unknown>, next: PrescriptionEditorValues & { timerSettings?: TimerSettings; restSeconds?: number }) {
  const previous = readPrescriptionEditorValues(current)
  const doseChanged = previous.reps !== next.reps || previous.seconds !== next.seconds
  const loadChanged = previous.loadKg !== next.loadKg
  const timer = current.timer && typeof current.timer === 'object' && !Array.isArray(current.timer)
    ? { ...(current.timer as Record<string, unknown>) }
    : null
  if (timer && previous.seconds !== next.seconds && Object.hasOwn(timer, 'work_seconds')) timer.work_seconds = next.seconds
  if (timer && previous.reps !== next.reps && Object.hasOwn(timer, 'repetitions')) timer.repetitions = next.reps
  const mergedTimer = next.timerSettings && !timerSettingsEqual(readTimerSettings(current, next.restSeconds), next.timerSettings)
    ? mergeTimerSettings({ ...current, timer: timer ?? current.timer }, next.timerSettings, next.restSeconds).timer as Record<string, unknown>
    : timer
  if (mergedTimer && typeof next.restSeconds === 'number' && Object.hasOwn(mergedTimer, 'set_rest_seconds')) {
    mergedTimer.set_rest_seconds = next.restSeconds
  }
  const dose = [next.reps > 0 ? `${next.reps} ripetizioni` : '', next.seconds > 0 ? `${next.seconds} sec` : ''].filter(Boolean).join(' · ')
  const steps = resizePrescriptionSteps(next.steps, next.sets, next)
  const legacyDoseSteps = Array.isArray(current.steps) ? [] : parseDoseSteps(String(current.dose ?? ''))
  const legacyStepsChanged = steps.length > 0
    && legacyDoseSteps.some(step => step.loadKg !== null)
    && JSON.stringify(legacyDoseSteps) !== JSON.stringify(steps)
  const persistedDose = legacyStepsChanged
    ? steps.map(formatPrescriptionStep).join(' · ')
    : doseChanged ? dose || null : current.dose
  return {
    ...current,
    sets: Math.max(1, Math.trunc(next.sets) || 1),
    reps: next.reps,
    seconds: next.seconds,
    loadKg: next.loadKg,
    steps: steps.length ? steps : undefined,
    dose: persistedDose,
    load_value: loadChanged ? next.loadKg > 0 ? String(next.loadKg) : null : current.load_value,
    unit: loadChanged ? next.loadKg > 0 ? 'kg' : null : current.unit,
    timer: mergedTimer ?? current.timer,
  }
}

export function sessionExerciseDefaultsFromLibrary(defaultPrescription: Record<string, unknown>) {
  const { restSeconds: configuredRest, ...prescription } = defaultPrescription
  const timer = prescription.timer && typeof prescription.timer === 'object' && !Array.isArray(prescription.timer)
    ? prescription.timer as Record<string, unknown>
    : null
  const restSeconds = optionalNonNegativeNumber(configuredRest)
    ?? optionalNonNegativeNumber(timer?.set_rest_seconds)
    ?? 120
  if (timer && Object.hasOwn(timer, 'set_rest_seconds')) timer.set_rest_seconds = restSeconds
  return { prescription, restSeconds }
}

export function getPrescriptionSteps(prescription: Record<string, unknown>): PrescriptionStep[] {
  if (!Array.isArray(prescription.steps)) return []
  return prescription.steps.map((value, index) => {
    const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
    const load = optionalNonNegativeNumber(row.loadKg)
    return { label: String(row.label ?? `Set ${index + 1}`), reps: Math.max(0, Number(row.reps) || 0), seconds: Math.max(0, Number(row.seconds) || 0), loadKg: load }
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
