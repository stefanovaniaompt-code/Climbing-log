export type TimerMode = 'guided' | 'recovery_only' | 'none'
export type TimerExecutionMode = 'bilateral' | 'alternate_hands' | 'right_only' | 'left_only'

export type TimerSettings = {
  mode: TimerMode
  executionMode: TimerExecutionMode
  preparationSeconds: number
  handChangeSeconds: number
  intervalRestSeconds: number
}

export type TimerEditorValues = TimerSettings & {
  sets: number
  reps: number
  seconds: number
  restSeconds: number | null
}

export type TimerSequenceStep = {
  kind: 'preparation' | 'work' | 'hand_change' | 'interval_rest' | 'set_rest'
  label: string
  hand?: 'DX' | 'SX'
  repetition?: number
}

const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  mode: 'none',
  executionMode: 'bilateral',
  preparationSeconds: 0,
  handChangeSeconds: 0,
  intervalRestSeconds: 0,
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : fallback
}

export function readTimerSettings(prescription: Record<string, unknown>): TimerSettings {
  const timer = record(prescription.timer)
  const mode: TimerMode = timer.mode === 'guided' || timer.mode === 'recovery_only' || timer.mode === 'none'
    ? timer.mode
    : nonNegativeInteger(timer.work_seconds) > 0 ? 'guided' : 'none'
  const executionMode: TimerExecutionMode = timer.execution_mode === 'single_hand' || timer.execution_mode === 'alternate_hands'
    ? 'alternate_hands'
    : timer.execution_mode === 'right_only' || timer.execution_mode === 'left_only'
      ? timer.execution_mode
      : 'bilateral'

  return {
    mode,
    executionMode,
    preparationSeconds: nonNegativeInteger(timer.preparation_seconds, DEFAULT_TIMER_SETTINGS.preparationSeconds),
    handChangeSeconds: nonNegativeInteger(timer.hand_change_seconds, DEFAULT_TIMER_SETTINGS.handChangeSeconds),
    intervalRestSeconds: nonNegativeInteger(timer.interval_rest_seconds, DEFAULT_TIMER_SETTINGS.intervalRestSeconds),
  }
}

export function timerSettingsFromPrescription(prescription: Record<string, unknown>, restSeconds: number | null = null): TimerEditorValues {
  const timer = record(prescription.timer)
  const stepRows = Array.isArray(prescription.steps) ? prescription.steps : []
  const reps = Object.hasOwn(prescription, 'reps') ? nonNegativeInteger(prescription.reps) : nonNegativeInteger(timer.repetitions)
  const seconds = Object.hasOwn(prescription, 'seconds') ? nonNegativeInteger(prescription.seconds) : nonNegativeInteger(timer.work_seconds)
  return {
    ...readTimerSettings(prescription),
    sets: nonNegativeInteger(prescription.sets, nonNegativeInteger(timer.sets, stepRows.length || 1)) || 1,
    reps,
    seconds,
    restSeconds,
  }
}

export function timerSettingsEqual(left: TimerSettings, right: TimerSettings): boolean {
  return left.mode === right.mode
    && left.executionMode === right.executionMode
    && left.preparationSeconds === right.preparationSeconds
    && left.handChangeSeconds === right.handChangeSeconds
    && left.intervalRestSeconds === right.intervalRestSeconds
}

export function mergeTimerSettings(prescription: Record<string, unknown>, settings: TimerSettings): Record<string, unknown> {
  const currentTimer = record(prescription.timer)
  if (timerSettingsEqual(readTimerSettings(prescription), settings)) return { ...prescription }

  return {
    ...prescription,
    timer: {
      ...currentTimer,
      mode: settings.mode,
      execution_mode: settings.executionMode === 'alternate_hands' ? 'single_hand' : settings.executionMode,
      preparation_seconds: settings.preparationSeconds,
      hand_change_seconds: settings.handChangeSeconds,
      interval_rest_seconds: settings.intervalRestSeconds,
      ...(currentTimer.repetitions !== undefined && prescription.reps !== undefined ? { repetitions: prescription.reps } : {}),
      ...(currentTimer.work_seconds !== undefined && prescription.seconds !== undefined ? { work_seconds: prescription.seconds } : {}),
    },
  }
}

export function buildTimerSeriesSequence(values: TimerEditorValues, setNumber = 1): TimerSequenceStep[] {
  if (values.mode === 'none') return []
  const steps: TimerSequenceStep[] = []
  if (values.mode === 'guided' && setNumber === 1 && values.preparationSeconds > 0) {
    steps.push({ kind: 'preparation', label: `preparazione ${values.preparationSeconds}s` })
  }

  if (values.mode === 'guided') {
    const repetitions = Math.max(0, Math.min(500, Math.trunc(values.reps)))
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      if (values.executionMode === 'alternate_hands') {
        steps.push({ kind: 'work', hand: 'DX', repetition, label: `DX${repetition} ${values.seconds}s` })
        if (values.handChangeSeconds > 0) steps.push({ kind: 'hand_change', label: `cambio ${values.handChangeSeconds}s` })
        steps.push({ kind: 'work', hand: 'SX', repetition, label: `SX${repetition} ${values.seconds}s` })
        if (repetition < repetitions) {
          if (values.handChangeSeconds > 0) steps.push({ kind: 'hand_change', label: `cambio ${values.handChangeSeconds}s` })
          if (values.intervalRestSeconds > 0) steps.push({ kind: 'interval_rest', label: `pausa ${values.intervalRestSeconds}s` })
        }
      } else {
        const hand = values.executionMode === 'right_only' ? 'DX' : values.executionMode === 'left_only' ? 'SX' : undefined
        steps.push({ kind: 'work', ...(hand ? { hand } : {}), repetition, label: `${hand ? `${hand}${repetition}` : `ripetizione ${repetition}`} ${values.seconds}s` })
        if (repetition < repetitions && values.intervalRestSeconds > 0) {
          steps.push({ kind: 'interval_rest', label: `pausa ${values.intervalRestSeconds}s` })
        }
      }
    }
  } else {
    steps.push({ kind: 'work', label: 'lavoro libero' })
  }

  return steps
}

export function formatTimerPreview(values: TimerEditorValues): string {
  if (values.mode === 'none') return 'Nessun timer: esecuzione libera.'

  const sets = Math.max(1, Math.min(500, Math.trunc(values.sets) || 1))
  const series = buildTimerSeriesSequence(values, 1)
  const preview = series.slice(0, 8).map(step => step.label)
  if (series.length > preview.length) preview.push('…')

  const perHand = values.executionMode === 'alternate_hands'
  const count = Math.max(0, Math.trunc(values.reps))
  const total = perHand ? ` · ${count} per mano (${count * sets} DX + ${count * sets} SX)` : ''
  const sequence = values.mode === 'guided' ? preview.join(' → ') : 'lavoro libero; recupero avviato dall’atleta'
  const recovery = sets > 1 && values.restSeconds !== null && values.restSeconds > 0
    ? ` → recupero ${values.restSeconds}s → serie 2/${sets}`
    : ''
  return `Serie 1/${sets}: ${sequence}${recovery}${total}`
}
