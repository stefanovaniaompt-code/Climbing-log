import { describe, expect, it } from 'vitest'
import {
  buildActualFromPrescription,
  createExerciseTimerState,
  exerciseTimerPhaseLabel,
  exerciseTimerProgressLabel,
  getExerciseTimerConfig,
  firstOpenExerciseIndex,
  formatPrescription,
  getRestSeconds,
  getSetCount,
  getVariableSeries,
  summarizeRunner,
  tickExerciseTimer,
  elapseExerciseTimer,
  restoreExerciseTimerSnapshot,
  restartExerciseTimerState,
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
    expect(getVariableSeries(exercise({ prescription: { sets: 4, dose: '6 ripetizioni · tenuta 5 s a 90°' } }))).toEqual([])
  })

  it('crea un recupero uniforme per gli esercizi a ripetizioni', () => {
    const item = exercise({
      prescription: { sets: 4, reps: 6, dose: '6 ripetizioni' },
      restSeconds: 120,
    })
    const initial = createExerciseTimerState(item)!

    expect(initial.config.mode).toBe('recovery')
    expect(initial.phase).toBe('set_rest')
    expect(initial.remaining).toBe(120)
    expect(exerciseTimerProgressLabel(initial)).toBe('RECUPERO 1/3')

    const completed = elapseExerciseTimer(
      { ...initial, running: true },
      120,
    )
    const next = restartExerciseTimerState(item, completed)!

    expect(completed.phase).toBe('complete')
    expect(next.set).toBe(2)
    expect(next.remaining).toBe(120)
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

  it('separa ogni lato e ripetizione prima del recupero lungo', () => {
    const item = exercise({ prescription: { sets: 2, timer: { type: 'isometric', execution_mode: 'single_hand', preparation_seconds: 0, work_seconds: 1, hand_change_seconds: 2, interval_rest_seconds: 3, repetitions: 2, set_rest_seconds: 90 } } })
    let state = { ...createExerciseTimerState(item)!, running: true }

    expect(exerciseTimerPhaseLabel(state)).toBe('LAVORO DX')
    state = elapseExerciseTimer(state, 1)
    expect(exerciseTimerPhaseLabel(state)).toBe('CAMBIO MANO')
    state = elapseExerciseTimer(state, 2)
    expect(exerciseTimerPhaseLabel(state)).toBe('LAVORO SX')
    state = elapseExerciseTimer(state, 1)
    expect(exerciseTimerPhaseLabel(state)).toBe('PAUSA')
    state = elapseExerciseTimer(state, 3)
    expect(exerciseTimerPhaseLabel(state)).toBe('LAVORO DX')
    expect(state.repetition).toBe(2)
    state = elapseExerciseTimer(state, 1 + 2 + 1)
    expect(exerciseTimerPhaseLabel(state)).toBe('RECUPERO SERIE')
    expect(state.remaining).toBe(90)
  })

  it('alterna lavoro e pausa negli esercizi bilaterali', () => {
    const item = exercise({ prescription: { sets: 2, timer: { type: 'isometric', execution_mode: 'bilateral', preparation_seconds: 0, work_seconds: 1, interval_rest_seconds: 3, repetitions: 2, set_rest_seconds: 90 } } })
    let state = { ...createExerciseTimerState(item)!, running: true }

    expect(exerciseTimerPhaseLabel(state)).toBe('LAVORO')
    state = elapseExerciseTimer(state, 1)
    expect(exerciseTimerPhaseLabel(state)).toBe('PAUSA')
    state = elapseExerciseTimer(state, 3)
    expect(exerciseTimerPhaseLabel(state)).toBe('LAVORO')
    expect(state.repetition).toBe(2)
    state = elapseExerciseTimer(state, 1)
    expect(exerciseTimerPhaseLabel(state)).toBe('RECUPERO SERIE')
    expect(state.remaining).toBe(90)
  })
  it('advances a running timer using real elapsed time', () => {
    const item = exercise({
      prescription: {
        sets: 1,
        timer: {
          execution_mode: 'bilateral',
          preparation_seconds: 0,
          work_seconds: 10,
          repetitions: 1,
          set_rest_seconds: 0,
        },
      },
    })

    const initial = {
      ...createExerciseTimerState(item)!,
      running: true,
    }

    const advanced = elapseExerciseTimer(initial, 4)

    expect(advanced.phase).toBe('work')
    expect(advanced.remaining).toBe(6)
  })

  it('restores a running timer after leaving the app', () => {
    const item = exercise({
      prescription: {
        sets: 1,
        timer: {
          execution_mode: 'bilateral',
          preparation_seconds: 0,
          work_seconds: 10,
          repetitions: 1,
          set_rest_seconds: 0,
        },
      },
    })

    const state = {
      ...createExerciseTimerState(item)!,
      running: true,
    }

    const restored = restoreExerciseTimerSnapshot(
      {
        state,
        savedAt: 1000,
      },
      5000,
    )

    expect(restored.remaining).toBe(6)
  })

  it('does not advance a paused persisted timer', () => {
    const item = exercise({
      prescription: {
        sets: 1,
        timer: {
          execution_mode: 'bilateral',
          preparation_seconds: 0,
          work_seconds: 10,
          repetitions: 1,
          set_rest_seconds: 0,
        },
      },
    })

    const state = {
      ...createExerciseTimerState(item)!,
      running: false,
    }

    const restored = restoreExerciseTimerSnapshot(
      {
        state,
        savedAt: 1000,
      },
      9000,
    )

    expect(restored.remaining).toBe(10)
    expect(restored.running).toBe(false)
  })

})
