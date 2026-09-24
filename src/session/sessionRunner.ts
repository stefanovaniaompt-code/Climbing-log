export type JsonRecord = Record<string, unknown>
import type { ProgramType } from '../programs/programType'
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
  mode: 'guided' | 'recovery'
  executionMode: 'bilateral' | 'single_hand'
  preparationSeconds: number
  workSeconds: number
  handChangeSeconds: number
  intervalRestSeconds: number
  repetitions: number
  sets: number
  setRestSeconds: number
}

export type ExerciseTimerPhase = 'preparation' | 'work' | 'hand_rest' | 'interval_rest' | 'set_rest' | 'complete'

export type ExerciseTimerState = {
  exerciseId: string
  config: ExerciseTimerConfig
  phase: ExerciseTimerPhase
  set: number
  repetition: number
  hand: 'right' | 'left'
  remaining: number
  running: boolean
}

export type ExerciseTimerSnapshot = {
  state: ExerciseTimerState
  savedAt: number
}

function positiveInteger(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

function textValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback
}

export function getExerciseTimerConfig(exercise: RunnerExercise): ExerciseTimerConfig | null {
  const source = exercise.prescription.timer
  const timer = source && typeof source === 'object' && !Array.isArray(source)
    ? source as JsonRecord
    : {}
  const workSeconds = positiveInteger(timer.work_seconds)
  const sets = positiveInteger(exercise.prescription.sets) ?? positiveInteger(timer.sets) ?? 1

  if (!workSeconds) {
    const setRestSeconds = getRestSeconds(exercise)
    if (sets <= 1 || setRestSeconds <= 0) return null

    return {
      mode: 'recovery',
      executionMode: 'bilateral',
      preparationSeconds: 0,
      workSeconds: 0,
      handChangeSeconds: 0,
      intervalRestSeconds: 0,
      repetitions: 1,
      sets,
      setRestSeconds,
    }
  }

  const executionMode = timer.execution_mode === 'single_hand' ? 'single_hand' : 'bilateral'
  return {
    mode: 'guided',
    executionMode,
    preparationSeconds: nonNegativeInteger(timer.preparation_seconds, 5),
    workSeconds,
    handChangeSeconds: executionMode === 'single_hand' ? nonNegativeInteger(timer.hand_change_seconds, 5) : 0,
    intervalRestSeconds: nonNegativeInteger(timer.interval_rest_seconds, 0),
    repetitions: positiveInteger(timer.repetitions) ?? 1,
    sets,
    setRestSeconds: nonNegativeInteger(timer.set_rest_seconds, getRestSeconds(exercise)),
  }
}

export function timerPhaseDuration(state: ExerciseTimerState): number {
  const durations: Record<ExerciseTimerPhase, number> = {
    preparation: state.config.preparationSeconds,
    work: state.config.workSeconds,
    hand_rest: state.config.handChangeSeconds,
    interval_rest: state.config.intervalRestSeconds,
    set_rest: state.config.setRestSeconds,
    complete: 0,
  }
  return durations[state.phase]
}

export function createExerciseTimerState(exercise: RunnerExercise): ExerciseTimerState | null {
  const config = getExerciseTimerConfig(exercise)
  if (!config) return null
  if (config.mode === 'recovery') {
    return {
      exerciseId: exercise.id,
      config,
      phase: 'set_rest',
      set: 1,
      repetition: 1,
      hand: 'right',
      remaining: config.setRestSeconds,
      running: false,
    }
  }
  const state: ExerciseTimerState = { exerciseId: exercise.id, config, phase: 'preparation', set: 1, repetition: 1, hand: 'right', remaining: config.preparationSeconds, running: false }
  return config.preparationSeconds > 0 ? state : advanceExerciseTimer(state)
}

export function restartExerciseTimerState(
  exercise: RunnerExercise,
  previous: ExerciseTimerState | null,
): ExerciseTimerState | null {
  const restarted = createExerciseTimerState(exercise)
  if (
    !restarted ||
    restarted.config.mode !== 'recovery' ||
    previous?.exerciseId !== exercise.id ||
    previous.phase !== 'complete'
  ) {
    return restarted
  }

  const recoveryCount = Math.max(1, restarted.config.sets - 1)
  return {
    ...restarted,
    set: previous.set < recoveryCount
      ? previous.set + 1
      : 1,
  }
}

export function advanceExerciseTimer(state: ExerciseTimerState): ExerciseTimerState {
  const { config } = state
  let next: ExerciseTimerState
  if (state.phase === 'set_rest' && config.mode === 'recovery') {
    next = { ...state, phase: 'complete', remaining: 0, running: false }
  } else if (state.phase === 'preparation') {
    next = { ...state, phase: 'work', remaining: config.workSeconds }
  } else if (state.phase === 'work' && config.executionMode === 'single_hand' && state.hand === 'right') {
    next = { ...state, phase: 'hand_rest', remaining: config.handChangeSeconds }
  } else if (state.phase === 'hand_rest') {
    next = { ...state, phase: 'work', hand: 'left', remaining: config.workSeconds }
  } else if (state.phase === 'interval_rest') {
    next = { ...state, phase: 'work', repetition: state.repetition + 1, hand: 'right', remaining: config.workSeconds }
  } else if (state.phase === 'set_rest') {
    next = { ...state, phase: 'work', set: state.set + 1, repetition: 1, hand: 'right', remaining: config.workSeconds }
  } else if (state.phase === 'work' && state.repetition < config.repetitions) {
    next = config.intervalRestSeconds > 0
      ? { ...state, phase: 'interval_rest', remaining: config.intervalRestSeconds }
      : { ...state, phase: 'work', repetition: state.repetition + 1, hand: 'right', remaining: config.workSeconds }
  } else if (state.phase === 'work' && state.set < config.sets) {
    next = config.setRestSeconds > 0
      ? { ...state, phase: 'set_rest', remaining: config.setRestSeconds }
      : { ...state, phase: 'work', set: state.set + 1, repetition: 1, hand: 'right', remaining: config.workSeconds }
  } else {
    next = { ...state, phase: 'complete', remaining: 0, running: false }
  }
  return next.remaining === 0 && next.phase !== 'complete' ? advanceExerciseTimer(next) : next
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
): ExerciseTimerState {
  if (
    !snapshot.state.running ||
    snapshot.state.phase === 'complete'
  ) {
    return snapshot.state
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - snapshot.savedAt) / 1000),
  )

  return elapseExerciseTimer(
    snapshot.state,
    elapsedSeconds,
  )
}

export function exerciseTimerPhaseLabel(state: ExerciseTimerState): string {
  if (state.config.mode === 'recovery') {
    return state.phase === 'complete' ? 'RECUPERO COMPLETATO' : 'RECUPERO'
  }
  if (state.phase === 'work') return state.config.executionMode === 'single_hand' ? `LAVORO ${state.hand === 'right' ? 'DX' : 'SX'}` : 'LAVORO'
  if (state.phase === 'hand_rest') return 'CAMBIO MANO'
  if (state.phase === 'interval_rest') return 'PAUSA'
  if (state.phase === 'set_rest') return 'RECUPERO SERIE'
  if (state.phase === 'complete') return 'COMPLETATO'
  return 'PREPARAZIONE'
}

export function exerciseTimerProgressLabel(state: ExerciseTimerState): string {
  if (state.config.mode === 'recovery') {
    return `RECUPERO ${state.set}/${Math.max(1, state.config.sets - 1)}`
  }

  const repetition = state.config.repetitions > 1
    ? ` · RIPETIZIONE ${state.repetition}/${state.config.repetitions}`
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

export function getRestSeconds(exercise: RunnerExercise): number {
  if (exercise.restSeconds !== null && exercise.restSeconds >= 0) return exercise.restSeconds
  const timer = exercise.prescription.timer
  const timerRecord = timer && typeof timer === 'object' && !Array.isArray(timer) ? timer as JsonRecord : {}
  return positiveInteger(timerRecord.set_rest_seconds)
    ?? positiveInteger(timerRecord.interval_rest_seconds)
    ?? positiveInteger(timerRecord.hand_change_seconds)
    ?? 90
}

export function formatPrescription(exercise: RunnerExercise): string {
  const sets = getSetCount(exercise)
  const dose = textValue(exercise.prescription.dose)
  const load = textValue(exercise.prescription.load_value)
  const unit = textValue(exercise.prescription.unit)
  const loadType = textValue(exercise.prescription.load_type)
  const parts = [`${sets} serie`]
  if (dose) parts.push(dose)
  if (load) parts.push(`${load}${unit ? ` ${unit}` : ''}`)
  else if (loadType && loadType !== 'none') parts.push(loadType)
  return parts.join(' · ')
}

export function getVariableSeries(
  exercise: RunnerExercise,
): string[] {
  const derived =
    getDerivedSetTargets(
      exercise,
    )

  if (derived.length) {
    return derived.map(
      item =>
        String(
          item.percentage,
        ) +
        '% = ' +
        String(
          Number(
            item
              .calculatedTarget
              .toFixed(2),
          ),
        ) +
        ' ' +
        item.targetUnit,
    )
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
