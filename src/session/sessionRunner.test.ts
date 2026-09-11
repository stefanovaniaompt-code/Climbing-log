import { describe, expect, it } from 'vitest'
import {
  buildActualFromPrescription,
  createExerciseTimerState,
  exerciseTimerPhaseLabel,
  getExerciseTimerConfig,
  firstOpenExerciseIndex,
  formatPrescription,
  getRestSeconds,
  getSetCount,
  getVariableSeries,
  summarizeRunner,
  tickExerciseTimer,
  type RunnerExercise,
} from './sessionRunner'

function exercise(overrides: Partial<RunnerExercise> = {}): RunnerExercise {
  return {
    id: 'exercise-1',
    order: 1,
    name: 'Block lift',
    prescription: { sets: 4, dose: '5 sec', load_type: 'external', load_value: '32.5', unit: 'kg', timer: { set_rest_seconds: 120 } },
    calculationContext: {},
    targetRpeMin: 7,
    targetRpeMax: 8,
    restSeconds: null,
    instructions: null,
    progress: null,
    ...overrides,
  }
}

describe('session runner selectors', () => {
  it('legge serie, recupero e prescrizione dal formato V1', () => {
    const item = exercise()
    expect(getSetCount(item)).toBe(4)
    expect(getRestSeconds(item)).toBe(120)
    expect(formatPrescription(item)).toBe('4 serie · 5 sec · 32.5 kg')
  })

  it('mantiene il formato actual storico della V1', () => {
    expect(buildActualFromPrescription(exercise().prescription)).toEqual({
      dose: '5 sec',
      load_type: 'external',
      load_value: '32.5',
      unit: 'kg',
    })
  })

  it('espande solo le progressioni con serie differenti', () => {
    expect(getVariableSeries(exercise())).toEqual([])
    expect(getVariableSeries(exercise({ prescription: { sets: 3, dose: '20 kg × 8 · 25 kg × 5 · 30 kg × 3' } }))).toEqual([
      '20 kg × 8',
      '25 kg × 5',
      '30 kg × 3',
    ])
  })

  it('riprende dal primo esercizio non completato', () => {
    const done = exercise({ progress: { completed: true, actual: {}, rpe: 8, notes: '', completedAt: '2026-09-06T10:00:00Z' } })
    const open = exercise({ id: 'exercise-2', order: 2 })
    expect(firstOpenExerciseIndex([done, open])).toBe(1)
    expect(summarizeRunner([done, open])).toMatchObject({ completed: 1, queued: 0, total: 2, percentage: 50, allCompleted: false, allSyncedCompleted: false })
  })

  it('non considera chiudibile una sessione con esercizi ancora in coda', () => {
    const queued = exercise({ progress: { completed: true, actual: {}, rpe: 8, notes: '', completedAt: '2026-09-06T10:00:00Z', syncState: 'queued' } })
    expect(summarizeRunner([queued])).toMatchObject({ allCompleted: true, allSyncedCompleted: false, queued: 1 })
  })

  it('esegue il ciclo monobraccio lavoro DX, cambio e lavoro SX', () => {
    const item = exercise({ prescription: { sets: 1, timer: { type: 'isometric', execution_mode: 'single_hand', preparation_seconds: 0, work_seconds: 2, hand_change_seconds: 5, repetitions: 1, set_rest_seconds: 0 } } })
    const initial = createExerciseTimerState(item)!
    expect(getExerciseTimerConfig(item)?.handChangeSeconds).toBe(5)
    expect(exerciseTimerPhaseLabel(initial)).toBe('LAVORO DX')
    const rightDone = tickExerciseTimer(tickExerciseTimer({ ...initial, running: true }))
    expect(exerciseTimerPhaseLabel(rightDone)).toBe('CAMBIO MANO')
    let changed = rightDone
    for (let second = 0; second < 5; second += 1) changed = tickExerciseTimer({ ...changed, running: true })
    expect(exerciseTimerPhaseLabel(changed)).toBe('LAVORO SX')
  })

  it('alterna lavoro e pausa negli esercizi bilaterali', () => {
    const item = exercise({ prescription: { sets: 1, timer: { type: 'isometric', execution_mode: 'bilateral', preparation_seconds: 0, work_seconds: 1, interval_rest_seconds: 3, repetitions: 2, set_rest_seconds: 0 } } })
    const initial = createExerciseTimerState(item)!
    expect(exerciseTimerPhaseLabel(initial)).toBe('LAVORO')
    const resting = tickExerciseTimer({ ...initial, running: true })
    expect(exerciseTimerPhaseLabel(resting)).toBe('PAUSA')
    let secondWork = resting
    for (let second = 0; second < 3; second += 1) secondWork = tickExerciseTimer({ ...secondWork, running: true })
    expect(exerciseTimerPhaseLabel(secondWork)).toBe('LAVORO')
    expect(secondWork.repetition).toBe(2)
  })
})
