export type JsonRecord = Record<string, unknown>
import type { ProgramType } from '../programs/programType'
import { hasPrescriptionField, legacyDoseDescription, optionalNonNegativeNumber, usesKilogramLoads } from '../prescriptions/prescriptionConsistency'
import { buildTimerProtocolSequence, hasExplicitTimerMode, resolveExerciseTimerValues, timerProtocolSequenceIssue, type TimerSequenceStep, type TimerSeriesPrescription } from '../prescriptions/timerConfiguration'
import type { CompletionOutcome } from './sessionFeedback'

export type ExerciseProgress = {
  completed: boolean
  actual: JsonRecord
  rpe: number | null
  notes: string
  completedAt: string | null
  syncState?: 'synced' | 'queued'
}

export type ExerciseSyncPayload = {
  ownerUserId: string
  sessionLogId: string
  sessionExerciseId: string
  actual: JsonRecord
  rpe: number | null
  notes: string
  completedAt: string
}

export type RunnerExercise = {
  id: string
  order: number
  name: string
  prescription: JsonRecord
  calculationContext: JsonRecord
  targetRpeMin: number | null
  targetRpeMax: number | null
  restSeconds: number | null
  instructions: string | null
  progress: ExerciseProgress | null
}

export type SessionRunnerData = {
  source: 'demo' | 'legacy-v1'
  session: {
    id: string
    title: string
    objective: string | null
    durationMinutes: number | null
    coachNotes: string | null
    programType: ProgramType
    logId: string | null
    status: string
    completionOutcome: CompletionOutcome | null
    startedAt: string | null
    completedAt: string | null
    sessionRpe: number | null
    notes: string
    painPresent: boolean | null
    painVas: number | null
    painExerciseId: string | null
    painPersistsPostSession: boolean | null
    feedbackSubmittedAt: string | null
    feedbackUpdatedAt: string | null
  }
  exercises: RunnerExercise[]
}

export type ExerciseTimerConfig = {
  mode: 'guided' | 'recovery_only'
  executionMode: 'bilateral' | 'alternate_hands' | 'right_only' | 'left_only'
  preparationSeconds: number
  workSeconds: number
  handChangeSeconds: number
  intervalRestSeconds: number
  repetitions: number
  sets: number
  setRestSeconds: number
  series?: TimerSeriesPrescription[]
  workPhases?: { label: string; seconds: number }[]
  maxSetRestSeconds?: number
}

export type ExerciseTimerPhase = 'preparation' | 'work' | 'hand_rest' | 'interval_rest' | 'set_rest' | 'awaiting_set' | 'complete'

export type ExerciseTimerState = {
  exerciseId: string
  config: ExerciseTimerConfig
  phase: ExerciseTimerPhase
  set: number
  repetition: number
  hand: 'right' | 'left'
  remaining: number
  running: boolean
  sequence: TimerSequenceStep[]
  sequenceIndex: number
  restExtensionSeconds?: number
}

export type ExerciseTimerSnapshot = {
  state: ExerciseTimerState
  savedAt: number
}

function positiveInteger(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null
}

function textValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : fallback
}

export function getExerciseTimerConfig(exercise: RunnerExercise): ExerciseTimerConfig | null {
  const timer = exercise.prescription.timer && typeof exercise.prescription.timer === 'object' && !Array.isArray(exercise.prescription.timer)
    ? exercise.prescription.timer as JsonRecord
    : {}
  const settings = resolveExerciseTimerValues(exercise.name, exercise.prescription, resolveTimerRest(exercise, timer), exercise.instructions)
  const legacyWorkSeconds = positiveInteger(timer.work_seconds)
  const hasCanonicalSeconds = Object.hasOwn(exercise.prescription, 'seconds')
  const hasCanonicalReps = Object.hasOwn(exercise.prescription, 'reps')
  const mode = settings.mode

  if (mode === 'none') return null

  // Keep old timer payloads usable, while explicit V2 prescriptions never
  // receive an invented work duration or repetition count.
  const repetitions = !hasCanonicalReps && !positiveInteger(timer.repetitions) && mode === 'guided' && !settings.reps
    ? 1
    : settings.reps
  const workSeconds = hasCanonicalSeconds && !settings.workPhases ? settings.seconds : legacyWorkSeconds ?? settings.seconds
  const setRestSeconds = settings.restSeconds ?? 0
  const seriesRows = Array.isArray(exercise.prescription.steps)
    ? exercise.prescription.steps.map(value => {
        const row = value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
        return {
          reps: Object.hasOwn(row, 'reps') ? nonNegativeInteger(row.reps, 0) : repetitions,
          seconds: Object.hasOwn(row, 'seconds') ? nonNegativeInteger(row.seconds, 0) : workSeconds,
        }
      })
    : undefined
  const config: ExerciseTimerConfig = {
    mode,
    executionMode: settings.executionMode,
    preparationSeconds: settings.preparationSeconds,
    workSeconds,
    handChangeSeconds: settings.handChangeSeconds,
    intervalRestSeconds: settings.intervalRestSeconds,
    repetitions,
    sets: settings.sets,
    setRestSeconds,
    workPhases: settings.workPhases,
    maxSetRestSeconds: settings.maxSetRestSeconds,
    series: seriesRows ?? Array.from({ length: settings.sets }, () => ({ reps: repetitions, seconds: workSeconds })),
  }
  if (timerProtocolSequenceIssue({ ...settings, mode, reps: repetitions, seconds: workSeconds }, seriesRows)) return null
  return config
}

function resolveTimerRest(exercise: RunnerExercise, timer: JsonRecord): number | null {
  if (exercise.restSeconds !== null && Number.isSafeInteger(exercise.restSeconds) && exercise.restSeconds >= 0) return exercise.restSeconds
  if (Object.hasOwn(timer, 'set_rest_seconds')) {
    const value = nonNegativeInteger(timer.set_rest_seconds, 0)
    return value
  }
  return null
}

function timerSequenceForConfig(config: ExerciseTimerConfig): TimerSequenceStep[] {
  return buildTimerProtocolSequence({
    mode: config.mode,
    executionMode: config.executionMode,
    preparationSeconds: config.preparationSeconds,
    handChangeSeconds: config.handChangeSeconds,
    intervalRestSeconds: config.intervalRestSeconds,
    reps: config.repetitions,
    seconds: config.workSeconds,
    sets: config.sets,
    restSeconds: config.setRestSeconds,
    workPhases: config.workPhases,
    maxSetRestSeconds: config.maxSetRestSeconds,
  }, config.series)
}

export function timerPhaseDuration(state: ExerciseTimerState): number {
  const step = state.sequence?.[state.sequenceIndex]
  if (step) return step.durationSeconds + (step.kind === 'set_rest' ? state.restExtensionSeconds ?? 0 : 0)
  const durations: Record<ExerciseTimerPhase, number> = {
    preparation: state.config.preparationSeconds,
    work: state.config.workSeconds,
    hand_rest: state.config.handChangeSeconds,
    interval_rest: state.config.intervalRestSeconds,
    set_rest: state.config.setRestSeconds + (state.restExtensionSeconds ?? 0),
    awaiting_set: 0,
    complete: 0,
  }
  return durations[state.phase]
}

export function createExerciseTimerState(exercise: RunnerExercise): ExerciseTimerState | null {
  const config = getExerciseTimerConfig(exercise)
  if (!config) return null
  const sequence = timerSequenceForConfig(config)
  if (!sequence.length) return null
  return timerStateAt(exercise.id, config, sequence, 0, false)
}

export function restartExerciseTimerState(
  exercise: RunnerExercise,
  previous: ExerciseTimerState | null,
): ExerciseTimerState | null {
  void previous
  return createExerciseTimerState(exercise)
}

export function toggleExerciseTimerState(
  exercise: RunnerExercise,
  current: ExerciseTimerState | null,
): ExerciseTimerState | null {
  if (current?.exerciseId === exercise.id) {
    if (current.phase === 'awaiting_set') return current
    if (current.phase === 'complete') {
      const restarted = restartExerciseTimerState(exercise, current)
      return restarted ? startExerciseTimerFromState(restarted) : null
    }
    return { ...current, running: !current.running }
  }
  const created = createExerciseTimerState(exercise)
  if (!created) return null
  return startExerciseTimerFromState(created)
}

export function confirmExerciseTimerSet(
  state: ExerciseTimerState,
): ExerciseTimerState {
  if (state.phase !== 'awaiting_set') return state
  const next = advanceExerciseTimer(state)
  return next.phase === 'set_rest' ? { ...next, running: true } : next
}

function startExerciseTimerFromState(initial: ExerciseTimerState): ExerciseTimerState {
  if (initial.phase === 'awaiting_set') return initial
  return { ...initial, running: true }
}

export function advanceExerciseTimer(state: ExerciseTimerState): ExerciseTimerState {
  if (state.phase === 'complete') return state
  return timerStateAt(state.exerciseId, state.config, state.sequence, state.sequenceIndex + 1, state.running)
}

export function skipExerciseTimerPhase(state: ExerciseTimerState): ExerciseTimerState {
  return advanceExerciseTimer(state)
}

function timerStateAt(
  exerciseId: string,
  config: ExerciseTimerConfig,
  sequence: TimerSequenceStep[],
  sequenceIndex: number,
  running: boolean,
): ExerciseTimerState {
  const step = sequence[sequenceIndex]
  if (!step) {
    return { exerciseId, config, sequence, sequenceIndex, phase: 'complete', set: config.sets, repetition: config.repetitions, hand: 'right', remaining: 0, running: false }
  }
  const phase: ExerciseTimerPhase = step.kind === 'hand_change' ? 'hand_rest' : step.kind
  return {
    exerciseId,
    config,
    sequence,
    sequenceIndex,
    phase,
    set: step.setNumber,
    repetition: step.repetition ?? 1,
    hand: step.hand === 'SX' ? 'left' : 'right',
    remaining: step.durationSeconds,
    running: step.kind === 'awaiting_set' ? false : running,
    restExtensionSeconds: 0,
  }
}

export function tickExerciseTimer(state: ExerciseTimerState): ExerciseTimerState {
  if (!state.running || state.phase === 'complete') return state
  return state.remaining <= 1 ? advanceExerciseTimer(state) : { ...state, remaining: state.remaining - 1 }
}

export function elapseExerciseTimer(
  state: ExerciseTimerState,
  elapsedSeconds: number,
): ExerciseTimerState {
  let next = { ...state }
  let elapsed = Math.max(0, Math.floor(elapsedSeconds))

  while (
    elapsed > 0 &&
    next.running &&
    next.phase !== 'complete'
  ) {
    if (next.remaining <= 0) {
      next = advanceExerciseTimer(next)
      continue
    }

    if (elapsed < next.remaining) {
      return {
        ...next,
        remaining: next.remaining - elapsed,
      }
    }

    elapsed -= next.remaining
    next = advanceExerciseTimer(next)
  }

  return next
}

export function restoreExerciseTimerSnapshot(
  snapshot: ExerciseTimerSnapshot,
  now = Date.now(),
): ExerciseTimerState | null {
  if (!snapshot || !Number.isFinite(snapshot.savedAt) || !snapshot.state || typeof snapshot.state.exerciseId !== 'string') return null
  const state = normalizeTimerSnapshotState(snapshot.state)
  if (!state || !state.running || state.phase === 'complete') return state

  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - snapshot.savedAt) / 1000),
  )

  return elapseExerciseTimer(
    state,
    elapsedSeconds,
  )
}

function normalizeTimerSnapshotState(candidate: ExerciseTimerState): ExerciseTimerState | null {
  const validPhases: ExerciseTimerPhase[] = ['preparation', 'work', 'hand_rest', 'interval_rest', 'set_rest', 'awaiting_set', 'complete']
  if (!candidate || typeof candidate !== 'object' || typeof candidate.exerciseId !== 'string' || !validPhases.includes(candidate.phase)) return null
  if (Array.isArray(candidate.sequence)) {
    const sequenceIsValid = candidate.sequence.every(step => step && typeof step.label === 'string'
      && Number.isSafeInteger(step.durationSeconds) && step.durationSeconds >= 0
      && Number.isSafeInteger(step.setNumber) && step.setNumber > 0
      && ['preparation', 'work', 'hand_change', 'interval_rest', 'set_rest', 'awaiting_set'].includes(step.kind)
      && (step.hand === undefined || step.hand === 'DX' || step.hand === 'SX')
      && (step.repetition === undefined || Number.isSafeInteger(step.repetition) && step.repetition > 0))
    const configIsValid = candidate.config && (candidate.config.mode === 'guided' || candidate.config.mode === 'recovery_only')
      && ['bilateral', 'alternate_hands', 'right_only', 'left_only'].includes(candidate.config.executionMode)
      && Number.isSafeInteger(candidate.config.sets) && candidate.config.sets > 0
      && Number.isSafeInteger(candidate.config.repetitions) && candidate.config.repetitions >= 0
      && Number.isSafeInteger(candidate.config.workSeconds) && candidate.config.workSeconds >= 0
      && (candidate.config.maxSetRestSeconds === undefined || Number.isSafeInteger(candidate.config.maxSetRestSeconds) && candidate.config.maxSetRestSeconds >= candidate.config.setRestSeconds)
      && (candidate.config.workPhases === undefined || Array.isArray(candidate.config.workPhases)
        && candidate.config.workPhases.every(phase => typeof phase.label === 'string' && Number.isSafeInteger(phase.seconds) && phase.seconds > 0))
      && (candidate.config.series === undefined || Array.isArray(candidate.config.series)
        && candidate.config.series.every(row => Number.isSafeInteger(row.reps) && row.reps >= 0 && Number.isSafeInteger(row.seconds) && row.seconds >= 0))
    const stateIsValid = Number.isSafeInteger(candidate.sequenceIndex) && candidate.sequenceIndex >= 0
      && (candidate.phase === 'complete' ? candidate.sequenceIndex === candidate.sequence.length : candidate.sequenceIndex < candidate.sequence.length)
      && Number.isSafeInteger(candidate.set) && candidate.set > 0
      && Number.isSafeInteger(candidate.repetition) && candidate.repetition > 0
      && (candidate.hand === 'right' || candidate.hand === 'left')
      && Number.isSafeInteger(candidate.remaining) && candidate.remaining >= 0
      && (candidate.restExtensionSeconds === undefined || Number.isSafeInteger(candidate.restExtensionSeconds) && candidate.restExtensionSeconds >= 0
        && (candidate.config.maxSetRestSeconds === undefined || candidate.restExtensionSeconds <= candidate.config.maxSetRestSeconds - candidate.config.setRestSeconds))
      && typeof candidate.running === 'boolean'
    return sequenceIsValid && configIsValid && stateIsValid ? candidate : null
  }

  // Version-one local snapshots predate explicit sequences. Rebuild their
  // finite sequence from the saved timer config, including the legacy hand mode.
  const legacy = candidate as Omit<ExerciseTimerState, 'config'> & {
    config: Omit<ExerciseTimerConfig, 'mode' | 'executionMode'> & { mode: 'guided' | 'recovery'; executionMode: string }
  }
  if (!legacy.config
    || (legacy.config.mode !== 'guided' && legacy.config.mode !== 'recovery')
    || !['bilateral', 'alternate_hands', 'right_only', 'left_only', 'single_hand'].includes(legacy.config.executionMode)
    || !Number.isSafeInteger(legacy.config.sets) || legacy.config.sets <= 0
    || !Number.isSafeInteger(legacy.config.repetitions) || legacy.config.repetitions < 0
    || !Number.isSafeInteger(legacy.config.workSeconds) || legacy.config.workSeconds < 0
    || !Number.isSafeInteger(legacy.set) || legacy.set <= 0
    || !Number.isSafeInteger(legacy.repetition) || legacy.repetition <= 0
    || !Number.isSafeInteger(legacy.remaining) || legacy.remaining < 0
    || typeof legacy.running !== 'boolean'
    || (legacy.hand !== 'right' && legacy.hand !== 'left')) return null
  const config: ExerciseTimerConfig = {
    ...legacy.config,
    mode: legacy.config.mode === 'recovery' ? 'recovery_only' : 'guided',
    executionMode: legacy.config.executionMode === 'single_hand' ? 'alternate_hands' : legacy.config.executionMode as ExerciseTimerConfig['executionMode'],
  }
  const sequence = timerSequenceForConfig(config)
  if (!sequence.length) return null
  const wantedKind = legacy.phase === 'hand_rest' ? 'hand_change' : legacy.phase === 'awaiting_set' ? 'awaiting_set' : legacy.phase
  let sequenceIndex = sequence.findIndex(step => step.kind === wantedKind && step.setNumber === legacy.set && (step.repetition ?? 1) === legacy.repetition && (step.hand === undefined || step.hand === (legacy.hand === 'right' ? 'DX' : 'SX')))
  if (sequenceIndex < 0 && legacy.phase === 'set_rest' && config.mode === 'recovery_only') sequenceIndex = sequence.findIndex(step => step.kind === 'set_rest' && step.setNumber === legacy.set)
  if (legacy.phase === 'complete') sequenceIndex = sequence.length
  if (sequenceIndex < 0) return null
  return { ...timerStateAt(legacy.exerciseId, config, sequence, sequenceIndex, legacy.running), remaining: Math.max(0, legacy.remaining), running: legacy.running && wantedKind !== 'awaiting_set' }
}

export function exerciseTimerPhaseLabel(state: ExerciseTimerState): string {
  if (state.phase === 'awaiting_set') return `CONFERMA FINE SERIE ${state.set}`
  if (state.phase === 'work') return state.sequence?.[state.sequenceIndex]?.workPhase
    ? `LAVORO ${state.sequence[state.sequenceIndex].workPhase}`
    : state.config.executionMode === 'alternate_hands' || state.config.executionMode === 'right_only' || state.config.executionMode === 'left_only' ? `LAVORO ${state.hand === 'right' ? 'DX' : 'SX'}` : 'LAVORO'
  if (state.phase === 'hand_rest') return 'CAMBIO MANO'
  if (state.phase === 'interval_rest') return 'PAUSA'
  if (state.phase === 'set_rest') return 'RECUPERO SERIE'
  if (state.phase === 'complete') return 'PROTOCOLLO TERMINATO'
  return 'PREPARAZIONE'
}

export function exerciseTimerProgressLabel(state: ExerciseTimerState): string {
  if (state.config.mode === 'recovery_only') return `SERIE ${state.set}/${state.config.sets}`

  const setRepetitions = state.config.series?.[state.set - 1]?.reps ?? state.config.repetitions
  const repetition = setRepetitions > 1
    ? ` · RIPETIZIONE ${state.repetition}/${setRepetitions}`
    : ''

  return `SERIE ${state.set}/${state.config.sets}${repetition}`
}

export type DerivedSetPrescription = {
  setNumber: number
  percentage: number
  calculatedTarget: number
  targetUnit: string
}

export function getTestTargetSnapshot(
  exercise: RunnerExercise,
): JsonRecord | null {
  const raw =
    exercise.calculationContext
      .test_target ??
    exercise.calculationContext
      .testTarget

  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw)
  ) {
    return null
  }

  return raw as JsonRecord
}

export function getDerivedSetTargets(
  exercise: RunnerExercise,
): DerivedSetPrescription[] {
  const target =
    getTestTargetSnapshot(
      exercise,
    )

  if (!target) {
    return []
  }

  const rawSets =
    target.set_targets ??
    target.setTargets

  if (
    !Array.isArray(
      rawSets,
    )
  ) {
    return []
  }

  return rawSets.flatMap(
    (
      raw,
      index,
    ) => {
      if (
        !raw ||
        typeof raw !== 'object' ||
        Array.isArray(raw)
      ) {
        return []
      }

      const value =
        raw as JsonRecord

      const percentage =
        Number(
          value.percentage,
        )

      const calculatedTarget =
        Number(
          value.calculatedTarget ??
          value.calculated_target,
        )

      const targetUnit =
        textValue(
          value.targetUnit ??
          value.target_unit,
        )

      if (
        !Number.isFinite(
          percentage,
        ) ||
        !Number.isFinite(
          calculatedTarget,
        ) ||
        !targetUnit
      ) {
        return []
      }

      return [{
        setNumber:
          positiveInteger(
            value.setNumber ??
            value.set_number,
          ) ??
          index + 1,

        percentage,

        calculatedTarget,

        targetUnit,
      }]
    },
  )
}

export function getSetCount(exercise: RunnerExercise): number {
  const derived =
    getDerivedSetTargets(
      exercise,
    )

  if (derived.length) {
    return derived.length
  }

  const explicitSets = positiveInteger(exercise.prescription.sets)
  if (explicitSets) return explicitSets

  const steps = exercise.prescription.steps
  if (Array.isArray(steps) && steps.length) return steps.length

  const timer =
    exercise.prescription.timer

  const timerRecord =
    timer &&
    typeof timer === 'object' &&
    !Array.isArray(timer)
      ? timer as JsonRecord
      : {}

  return (
    positiveInteger(
      exercise.prescription
        .sets,
    ) ??
    positiveInteger(
      timerRecord.sets,
    ) ??
    1
  )
}

export function getRestSeconds(exercise: RunnerExercise): number | null {
  if (exercise.restSeconds !== null && exercise.restSeconds >= 0) return exercise.restSeconds
  const timer = exercise.prescription.timer
  const timerRecord = timer && typeof timer === 'object' && !Array.isArray(timer) ? timer as JsonRecord : {}
  if (Object.hasOwn(timerRecord, 'set_rest_seconds')) return nonNegativeInteger(timerRecord.set_rest_seconds, 0)
  if (hasExplicitTimerMode(exercise.prescription)) return null
  return positiveInteger(timerRecord.set_rest_seconds)
    ?? positiveInteger(timerRecord.interval_rest_seconds)
    ?? positiveInteger(timerRecord.hand_change_seconds)
    ?? 90
}

export function getPrescriptionDose(exercise: RunnerExercise): string | null {
  const description = legacyDoseDescription(exercise.prescription)
  const note = description ? `Nota: ${description}` : null
  if (Array.isArray(exercise.prescription.steps) && exercise.prescription.steps.length) return note
  const hasModernDose = hasPrescriptionField(exercise.prescription, 'reps') || hasPrescriptionField(exercise.prescription, 'seconds')
  const reps = positiveInteger(exercise.prescription.reps)
  const seconds = positiveInteger(exercise.prescription.seconds)
  const modernDose = [reps ? `${reps} ripetizioni` : null, seconds ? `${seconds} sec` : null].filter(Boolean).join(' · ')
  if (modernDose) return [modernDose, note].filter(Boolean).join(' · ')
  if (hasModernDose) return note
  const legacyDose = textValue(exercise.prescription.dose)
  if (legacyDose) return legacyDose
  return null
}

export function getPrescriptionLoad(exercise: RunnerExercise): string | null {
  if (Array.isArray(exercise.prescription.steps) && exercise.prescription.steps.length) return null
  const legacyLoad = textValue(exercise.prescription.load_value)
  const unit = textValue(exercise.prescription.unit)
  const loadType = textValue(exercise.prescription.load_type)
  if (!usesKilogramLoads(exercise.prescription)) {
    if (loadType?.toLowerCase().replace(/[\s-]+/g, '_').includes('grade') && legacyLoad) return `${legacyLoad}${unit ? ` ${unit}` : ''}`
    return loadType && loadType !== 'none' ? loadType : legacyLoad ? `${legacyLoad}${unit ? ` ${unit}` : ''}` : null
  }

  if (hasPrescriptionField(exercise.prescription, 'loadKg')) {
    const loadKg = optionalNonNegativeNumber(exercise.prescription.loadKg)
    return loadKg !== null && loadKg > 0 ? `${loadKg} kg` : null
  }
  if (legacyLoad) return `${legacyLoad}${unit ? ` ${unit}` : ''}`
  return loadType && loadType !== 'none' ? loadType : null
}

export function formatPrescription(exercise: RunnerExercise): string {
  const sets = getSetCount(exercise)
  const dose = getPrescriptionDose(exercise)
  const load = getPrescriptionLoad(exercise)
  const parts = [`${sets} serie`]
  if (dose) parts.push(dose)
  if (load) parts.push(load)
  return parts.join(' · ')
}

export function getVariableSeries(
  exercise: RunnerExercise,
): string[] {
  const steps = exercise.prescription.steps
  const derived = getDerivedSetTargets(exercise)

  if (derived.length) {
    const prescriptionSteps = Array.isArray(steps) ? steps : []
    const fallbackReps = positiveInteger(exercise.prescription.reps)
    const fallbackSeconds = positiveInteger(exercise.prescription.seconds)
    const seriesCount = Math.max(getSetCount(exercise), derived.length, prescriptionSteps.length)

    return Array.from({ length: seriesCount }, (_, index) => {
      const target = derived[index]
      const value = prescriptionSteps[index]
      const row = value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
      const reps = positiveInteger(row.reps) || fallbackReps
      const seconds = positiveInteger(row.seconds) || fallbackSeconds
      const dose = reps ? `${reps} rep` : seconds ? `${seconds} sec` : ''
      const manualLoad = usesKilogramLoads(exercise.prescription)
        ? optionalNonNegativeNumber(row.loadKg)
        : null
      const load = manualLoad !== null
        ? `${manualLoad} kg`
        : target
          ? `${target.percentage}% = ${Number(target.calculatedTarget.toFixed(2))} ${target.targetUnit}`
          : ''
      return [load, dose].filter(Boolean).join(' · ') || textValue(row.label) || `Set ${index + 1}`
    })
  }

  if (Array.isArray(steps) && steps.length) {
    return steps.map((value, index) => {
      const row = value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
      const load = optionalNonNegativeNumber(row.loadKg)
      const reps = positiveInteger(row.reps)
      const seconds = positiveInteger(row.seconds)
      const label = textValue(row.label) || `Set ${index + 1}`
      const dose = reps ? `${reps} rep` : seconds ? `${seconds} sec` : ''
      return [usesKilogramLoads(exercise.prescription) && load !== null ? `${load} kg` : '', dose].filter(Boolean).join(' × ') || label
    })
  }
  const dose =
    textValue(
      exercise.prescription
        .dose,
    )

  if (!dose) {
    return []
  }

  const series =
    dose
      .split(
        /\s*[\u00B7\u2022]\s*/,
      )
      .map(
        item =>
          item.trim(),
      )
      .filter(Boolean)

  return series.length > 1 && series.length === getSetCount(exercise)
    ? series
    : []
}

export function buildActualFromPrescription(
  prescription: JsonRecord,
  calculationContext: JsonRecord = {},
): JsonRecord {
  const target =
    calculationContext
      .test_target ??
    calculationContext
      .testTarget

  const actual:
    JsonRecord = {
      dose:
        prescription.dose ??
        null,

      load_type:
        prescription.load_type ??
        'none',

      load_value:
        prescription.load_value ??
        null,

      unit:
        prescription.unit ??
        null,
    }

  /*
   * Preserve the historical V1 payload exactly when
   * the exercise has no test-derived prescription.
   */
  if (
    target &&
    typeof target ===
      'object' &&
    !Array.isArray(target)
  ) {
    actual.test_target_snapshot =
      target
  }

  return actual
}

export function firstOpenExerciseIndex(exercises: RunnerExercise[]): number {
  const index = exercises.findIndex(exercise => !exercise.progress?.completed)
  return index >= 0 ? index : Math.max(0, exercises.length - 1)
}

export function summarizeRunner(exercises: RunnerExercise[]) {
  const completed = exercises.filter(exercise => exercise.progress?.completed).length
  const queued = exercises.filter(exercise => exercise.progress?.syncState === 'queued').length
  return {
    completed,
    queued,
    total: exercises.length,
    percentage: exercises.length > 0 ? Math.round((completed / exercises.length) * 100) : 0,
    allCompleted: exercises.length > 0 && completed === exercises.length,
    allSyncedCompleted: exercises.length > 0 && completed === exercises.length && queued === 0,
  }
}
