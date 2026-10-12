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
  series?: TimerSeriesPrescription[]
}

export type TimerSequenceStep = {
  kind: 'preparation' | 'work' | 'hand_change' | 'interval_rest' | 'set_rest' | 'awaiting_set'
  label: string
  durationSeconds: number
  setNumber: number
  hand?: 'DX' | 'SX'
  repetition?: number
}

export type TimerSeriesPrescription = Pick<TimerEditorValues, 'reps' | 'seconds'>
export type TimerSequenceIssue = 'missing_reps_or_duration' | 'sequence_too_large' | 'missing_set_recovery'

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

export function readTimerSettings(prescription: Record<string, unknown>, restSeconds?: number | null): TimerSettings {
  const timer = record(prescription.timer)
  const prescribedRest = resolveTimerRestSeconds(prescription, restSeconds)
  const sets = nonNegativeInteger(prescription.sets, nonNegativeInteger(timer.sets, Array.isArray(prescription.steps) ? prescription.steps.length : 1)) || 1
  const mode: TimerMode = timer.mode === 'guided' || timer.mode === 'recovery_only' || timer.mode === 'none'
    ? timer.mode
    : nonNegativeInteger(timer.work_seconds) > 0 ? 'guided' : sets > 1 && prescribedRest !== null && prescribedRest > 0 ? 'recovery_only' : 'none'
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

export function resolveTimerRestSeconds(
  prescription: Record<string, unknown>,
  canonicalRestSeconds?: number | null,
  legacyFallback: number | null = null,
): number | null {
  const timer = record(prescription.timer)
  const canonical = typeof canonicalRestSeconds === 'number'
    ? canonicalRestSeconds
    : typeof prescription.restSeconds === 'number' ? prescription.restSeconds : null
  if (canonical !== null) return nonNegativeInteger(canonical, 0)
  if (Object.hasOwn(timer, 'set_rest_seconds')) return nonNegativeInteger(timer.set_rest_seconds, 0)
  if (hasExplicitTimerMode(prescription)) return null
  return legacyFallback
}

export function timerSettingsFromPrescription(prescription: Record<string, unknown>, restSeconds: number | null = null): TimerEditorValues {
  const timer = record(prescription.timer)
  const stepRows = Array.isArray(prescription.steps) ? prescription.steps : []
  const reps = Object.hasOwn(prescription, 'reps') ? nonNegativeInteger(prescription.reps) : nonNegativeInteger(timer.repetitions)
  const seconds = Object.hasOwn(prescription, 'seconds') ? nonNegativeInteger(prescription.seconds) : nonNegativeInteger(timer.work_seconds)
  const series = stepRows.length
    ? stepRows.map(value => {
        const row = record(value)
        return {
          reps: Object.hasOwn(row, 'reps') ? nonNegativeInteger(row.reps) : reps,
          seconds: Object.hasOwn(row, 'seconds') ? nonNegativeInteger(row.seconds) : seconds,
        }
      })
    : undefined
  return {
    ...readTimerSettings(prescription, restSeconds),
    sets: nonNegativeInteger(prescription.sets, nonNegativeInteger(timer.sets, stepRows.length || 1)) || 1,
    reps,
    seconds,
    restSeconds,
    series,
  }
}

export function hasExplicitTimerMode(prescription: Record<string, unknown>): boolean {
  const timer = record(prescription.timer)
  return timer.mode === 'guided' || timer.mode === 'recovery_only' || timer.mode === 'none'
}

export function timerSettingsEqual(left: TimerSettings, right: TimerSettings): boolean {
  return left.mode === right.mode
    && left.executionMode === right.executionMode
    && left.preparationSeconds === right.preparationSeconds
    && left.handChangeSeconds === right.handChangeSeconds
    && left.intervalRestSeconds === right.intervalRestSeconds
}

export function mergeTimerSettings(prescription: Record<string, unknown>, settings: TimerSettings, restSeconds?: number | null): Record<string, unknown> {
  const currentTimer = record(prescription.timer)
  if (timerSettingsEqual(readTimerSettings(prescription, restSeconds), settings)) return { ...prescription }

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

function boundedCount(value: number, fallback = 0): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback
}

function makeStep(
  kind: TimerSequenceStep['kind'],
  label: string,
  durationSeconds: number,
  setNumber: number,
  extras: Pick<TimerSequenceStep, 'hand' | 'repetition'> = {},
): TimerSequenceStep {
  return { kind, label, durationSeconds, setNumber, ...extras }
}

function buildOneSeries(
  values: TimerEditorValues,
  setNumber: number,
  reps: number,
  seconds: number,
  includePreparation: boolean,
): TimerSequenceStep[] {
  const steps: TimerSequenceStep[] = []
  if (values.mode === 'guided' && includePreparation && values.preparationSeconds > 0) {
    steps.push(makeStep('preparation', `preparazione ${values.preparationSeconds}s`, values.preparationSeconds, setNumber))
  }

  if (values.mode === 'guided') {
    for (let repetition = 1; repetition <= reps; repetition += 1) {
      if (values.executionMode === 'alternate_hands') {
        steps.push(makeStep('work', `DX${repetition} ${seconds}s`, seconds, setNumber, { hand: 'DX', repetition }))
        if (values.handChangeSeconds > 0) steps.push(makeStep('hand_change', `cambio ${values.handChangeSeconds}s`, values.handChangeSeconds, setNumber))
        steps.push(makeStep('work', `SX${repetition} ${seconds}s`, seconds, setNumber, { hand: 'SX', repetition }))
        if (repetition < reps) {
          if (values.handChangeSeconds > 0) steps.push(makeStep('hand_change', `cambio ${values.handChangeSeconds}s`, values.handChangeSeconds, setNumber))
          if (values.intervalRestSeconds > 0) steps.push(makeStep('interval_rest', `pausa ${values.intervalRestSeconds}s`, values.intervalRestSeconds, setNumber))
        }
      } else {
        const hand = values.executionMode === 'right_only' ? 'DX' : values.executionMode === 'left_only' ? 'SX' : undefined
        steps.push(makeStep('work', `${hand ? `${hand}${repetition}` : `ripetizione ${repetition}`} ${seconds}s`, seconds, setNumber, { ...(hand ? { hand } : {}), repetition }))
        if (repetition < reps && values.intervalRestSeconds > 0) {
          steps.push(makeStep('interval_rest', `pausa ${values.intervalRestSeconds}s`, values.intervalRestSeconds, setNumber))
        }
      }
    }
  }
  return steps
}

export function buildTimerSeriesSequence(values: TimerEditorValues, setNumber = 1): TimerSequenceStep[] {
  if (values.mode === 'none') return []
  if (values.mode === 'recovery_only') {
    return [makeStep('awaiting_set', `conferma fine serie ${setNumber}`, 0, setNumber)]
  }
  const series = values.series?.[setNumber - 1]
  const reps = boundedCount(series?.reps ?? values.reps)
  if (reps > 500) return []
  return buildOneSeries(values, setNumber, reps, boundedCount(series?.seconds ?? values.seconds), setNumber === 1)
}

export function timerProtocolSequenceIssue(
  values: TimerEditorValues,
  perSeries: readonly TimerSeriesPrescription[] | undefined = values.series,
): TimerSequenceIssue | null {
  if (values.mode === 'none') return null
  const sets = Math.max(1, boundedCount(values.sets, 1))
  if (sets > 500) return 'sequence_too_large'
  const rows = Array.from({ length: sets }, (_, index) => ({
    reps: boundedCount(perSeries?.[index]?.reps ?? values.reps),
    seconds: boundedCount(perSeries?.[index]?.seconds ?? values.seconds),
  }))
  if (rows.some(row => row.reps > 500)) return 'sequence_too_large'
  if (values.mode === 'recovery_only' && (sets <= 1 || values.restSeconds === null || values.restSeconds <= 0)) return 'missing_set_recovery'
  if (values.mode === 'guided' && rows.some(row => row.reps <= 0 || row.seconds <= 0)) return 'missing_reps_or_duration'
  if (values.mode === 'guided' && rows.reduce((sum, row) => sum + row.reps * (values.executionMode === 'alternate_hands' ? 2 : 1), 0) > 20_000) return 'sequence_too_large'
  return null
}

export function buildTimerProtocolSequence(
  values: TimerEditorValues,
  perSeries: readonly TimerSeriesPrescription[] | undefined = values.series,
): TimerSequenceStep[] {
  if (values.mode === 'none') return []
  if (timerProtocolSequenceIssue(values, perSeries)) return []
  const sets = Math.max(1, boundedCount(values.sets, 1))
  const rows = Array.from({ length: sets }, (_, index) => ({
    reps: boundedCount(perSeries?.[index]?.reps ?? values.reps),
    seconds: boundedCount(perSeries?.[index]?.seconds ?? values.seconds),
  }))

  const steps: TimerSequenceStep[] = []
  for (let set = 1; set <= sets; set += 1) {
    if (values.mode === 'recovery_only') {
      steps.push(makeStep('awaiting_set', `conferma fine serie ${set}`, 0, set))
    } else {
      steps.push(...buildOneSeries(values, set, rows[set - 1].reps, rows[set - 1].seconds, set === 1))
    }

    if (set < sets && values.restSeconds !== null && values.restSeconds > 0) {
      steps.push(makeStep('set_rest', `recupero ${values.restSeconds}s`, values.restSeconds, set))
    }
  }
  return steps
}

export function formatTimerPreview(values: TimerEditorValues): string {
  if (values.mode === 'none') return 'Nessun timer: esecuzione libera.'

  const sets = Math.max(1, Math.min(500, Math.trunc(values.sets) || 1))
  const protocol = buildTimerProtocolSequence(values)
  if (!protocol.length) {
    return values.mode === 'guided'
      ? 'Timer non avviabile: specificare ripetizioni e durata per ogni serie.'
      : 'Timer non avviabile: specificare il recupero tra le serie.'
  }
  const series = protocol.filter(step => step.setNumber === 1 && step.kind !== 'set_rest')
  const preview = series.slice(0, 8).map(step => step.label)
  if (series.length > preview.length) preview.push('…')

  const perHand = values.executionMode === 'alternate_hands'
  const totalPerSide = Array.from({ length: sets }, (_, index) => boundedCount(values.series?.[index]?.reps ?? values.reps)).reduce((sum, reps) => sum + reps, 0)
  const total = perHand ? ` · ${totalPerSide} per mano (${totalPerSide} DX + ${totalPerSide} SX)` : ''
  const sequence = values.mode === 'guided' ? preview.join(' → ') : 'lavoro libero; conferma serie e recupero avviato dall’atleta'
  const recovery = sets > 1 && values.restSeconds !== null && values.restSeconds > 0
    ? ` → recupero ${values.restSeconds}s → serie 2/${sets}`
    : ''
  return `Serie 1/${sets}: ${sequence}${recovery}${total}`
}
