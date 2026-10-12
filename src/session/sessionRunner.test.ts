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
  advanceExerciseTimer,
  skipExerciseTimerPhase,
  toggleExerciseTimerState,
  type RunnerExercise,
  type ExerciseTimerState,
} from './sessionRunner'
import { buildTimerSeriesSequence, buildTimerProtocolSequence, timerSettingsFromPrescription } from '../prescriptions/timerConfiguration'

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

  it('mostra serie, ripetizioni e carico dal formato strutturato del builder', () => {
    const item = exercise({ prescription: { sets: 5, reps: 8, loadKg: 24.5 }, restSeconds: 120 })
    expect(formatPrescription(item)).toBe('5 serie · 8 ripetizioni · 24.5 kg')
  })

  it('non mostra valori legacy in conflitto con i campi moderni espliciti', () => {
    const item = exercise({ prescription: { sets: 3, reps: 8, seconds: 0, loadKg: 24.5, dose: '5 sec', load_value: '40', unit: 'kg' } })
    expect(formatPrescription(item)).toBe('3 serie · 8 ripetizioni · 24.5 kg')
  })

  it('preserva le indicazioni descrittive legacy non rappresentate dai campi moderni', () => {
    const item = exercise({ prescription: { sets: 3, reps: 6, seconds: 0, loadKg: 20, dose: '6 ripetizioni · tenuta 5 s a 90°', unit: 'kg' } })
    expect(formatPrescription(item)).toBe('3 serie · 6 ripetizioni · Nota: tenuta 5 s a 90° · 20 kg')
  })

  it('non duplica le righe strutturate ma conserva una nota legacy separata', () => {
    const item = exercise({ prescription: { sets: 2, dose: '20 kg × 8 · 25 kg × 5 · mantenere spalle attive', steps: [
      { label: 'Set 1', loadKg: 20, reps: 8 },
      { label: 'Set 2', loadKg: 25, reps: 5 },
    ] } })
    expect(formatPrescription(item)).toBe('2 serie · Nota: mantenere spalle attive')
    expect(getVariableSeries(item)).toEqual(['20 kg × 8 rep', '25 kg × 5 rep'])
  })

  it('usa le righe strutturate come dettaglio senza ripetere un riepilogo incompatibile', () => {
    const item = exercise({ prescription: { sets: 2, reps: 10, loadKg: 30, dose: '3 rep', load_value: '50', unit: 'kg', steps: [
      { label: 'Set 1', loadKg: 20, reps: 8 },
      { label: 'Set 2', loadKg: 25, reps: 5 },
    ] } })
    expect(formatPrescription(item)).toBe('2 serie')
    expect(getVariableSeries(item)).toEqual(['20 kg × 8 rep', '25 kg × 5 rep'])
  })

  it('non trasforma loadKg nullo in 0 kg nelle progressioni', () => {
    expect(getVariableSeries(exercise({ prescription: { sets: 2, steps: [
      { label: 'Corpo libero', loadKg: null, reps: 5 },
      { label: 'Tenuta', seconds: 10 },
    ] } }))).toEqual(['5 rep', '10 sec'])
  })

  it('mantiene distinte le semantiche di kg, corpo libero, carico aggiunto e grado', () => {
    expect(formatPrescription(exercise({ prescription: { sets: 3, load_type: 'bodyweight', load_value: '70', unit: 'kg' } }))).toBe('3 serie · bodyweight')
    expect(formatPrescription(exercise({ prescription: { sets: 3, load_type: 'added_weight', load_value: '20', unit: 'kg' } }))).toBe('3 serie · 20 kg')
    expect(formatPrescription(exercise({ prescription: { sets: 3, load_type: 'climbing_grade', load_value: '7a', unit: 'french' } }))).toBe('3 serie · 7a french')
    expect(formatPrescription(exercise({ prescription: { sets: 3, load_type: 'external', loadKg: 18, unit: 'kg' } }))).toBe('3 serie · 18 kg')
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
    expect(getVariableSeries(exercise({ prescription: { sets: 3, steps: [
      { label: 'Set 1', loadKg: 32.5, reps: 10 },
      { label: 'Set 2', loadKg: 35, reps: 8 },
      { label: 'Set 3', loadKg: 37.5, reps: 6 },
    ] } }))).toEqual(['32.5 kg × 10 rep', '35 kg × 8 rep', '37.5 kg × 6 rep'])
    expect(getVariableSeries(exercise({ prescription: { sets: 3, dose: '20 kg × 8 · 25 kg × 5 · 30 kg × 3' } }))).toEqual([
      '20 kg × 8',
      '25 kg × 5',
      '30 kg × 3',
    ])
    expect(getVariableSeries(exercise({ prescription: { sets: 4, dose: '6 ripetizioni · tenuta 5 s a 90°' } }))).toEqual([])
  })

  it('mostra il carico manuale salvato nell’ultima riga anche con un target da test collegato', () => {
    const item = exercise({
      prescription: {
        sets: 5,
        steps: [
          { label: 'Set 1', loadKg: 32, reps: 8 },
          { label: 'Set 2', loadKg: 34, reps: 6 },
          { label: 'Set 3', loadKg: 36, reps: 5 },
          { label: 'Set 4', loadKg: 38, reps: 4 },
          { label: 'Set 5', loadKg: 46.5, reps: 3 },
        ],
      },
      calculationContext: {
        test_target: {
          set_targets: [32, 34, 36, 38, 40].map((calculatedTarget, index) => ({
            set_number: index + 1,
            percentage: 80,
            calculated_target: calculatedTarget,
            target_unit: 'kg_external',
          })),
        },
      },
    })

    expect(getVariableSeries(item)).toEqual([
      '32 kg · 8 rep',
      '34 kg · 6 rep',
      '36 kg · 5 rep',
      '38 kg · 4 rep',
      '46.5 kg · 3 rep',
    ])
  })

  it('continua a mostrare il target derivato nelle righe senza carico manuale', () => {
    const item = exercise({
      prescription: { sets: 2, steps: [
        { label: 'Set 1', loadKg: null, reps: 8 },
        { label: 'Set 2', loadKg: 46.5, reps: 3 },
      ] },
      calculationContext: { test_target: { set_targets: [
        { set_number: 1, percentage: 80, calculated_target: 32, target_unit: 'kg_external' },
        { set_number: 2, percentage: 80, calculated_target: 40, target_unit: 'kg_external' },
      ] } },
    })

    expect(getVariableSeries(item)).toEqual([
      '80% = 32 kg_external · 8 rep',
      '46.5 kg · 3 rep',
    ])
  })

  it('attende la fine della serie e crea un recupero uniforme per gli esercizi a ripetizioni', () => {
    const item = exercise({
      prescription: { sets: 4, reps: 6, dose: '6 ripetizioni' },
      restSeconds: 120,
    })
    const initial = createExerciseTimerState(item)!

    expect(initial.config.mode).toBe('recovery_only')
    expect(initial.phase).toBe('awaiting_set')
    expect(initial.remaining).toBe(0)
    expect(exerciseTimerProgressLabel(initial)).toBe('SERIE 1/4')

    const recovery = { ...advanceExerciseTimer(initial), running: true }
    const completed = elapseExerciseTimer(
      recovery,
      120,
    )
    const next = advanceExerciseTimer(completed)

    expect(completed.phase).toBe('awaiting_set')
    expect(next.phase).toBe('set_rest')
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
    expect(exerciseTimerPhaseLabel(state)).toBe('CAMBIO MANO')
    state = elapseExerciseTimer(state, 2)
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

    expect(restored?.remaining).toBe(6)
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

    expect(restored?.remaining).toBe(10)
    expect(restored?.running).toBe(false)
  })

})

describe('timer V2 runtime acceptance', () => {
  const configured = (prescription: Record<string, unknown>, restSeconds: number | null = 90) => exercise({ prescription, restSeconds })

  it('esegue bilateralmente 4 serie × 5 ripetizioni', () => {
    const item = configured({ sets: 4, reps: 5, seconds: 7, timer: { mode: 'guided' } }, 30)
    const state = createExerciseTimerState(item)!
    const works = state.sequence.filter(step => step.kind === 'work')
    expect(works).toHaveLength(20)
    expect(works.every(step => step.hand === undefined)).toBe(true)
    expect(works.map(step => step.setNumber)).toEqual([...Array(5).fill(1), ...Array(5).fill(2), ...Array(5).fill(3), ...Array(5).fill(4)])
  })

  it('alterna DX/SX per 3 × 6, con 18 esecuzioni per lato e pause nei due sensi', () => {
    const item = configured({ sets: 3, reps: 6, seconds: 7, timer: { mode: 'guided', execution_mode: 'alternate_hands', hand_change_seconds: 2 } }, 45)
    const state = createExerciseTimerState(item)!
    const works = state.sequence.filter(step => step.kind === 'work')
    expect(works.filter(step => step.hand === 'DX')).toHaveLength(18)
    expect(works.filter(step => step.hand === 'SX')).toHaveLength(18)
    expect(state.sequence.slice(0, 4).map(step => [step.kind, step.hand])).toEqual([
      ['work', 'DX'], ['hand_change', undefined], ['work', 'SX'], ['hand_change', undefined],
    ])
    const firstSetEnd = state.sequence.findIndex(step => step.kind === 'set_rest')
    expect(state.sequence[firstSetEnd - 1]).toMatchObject({ kind: 'work', hand: 'SX', repetition: 6 })
    expect(state.sequence[firstSetEnd - 1].kind).not.toBe('hand_change')
    expect(state.sequence.at(-1)?.kind).toBe('work')
  })

  it.each([
    ['right_only', 'right'],
    ['left_only', 'left'],
  ] as const)('supporta la modalità %s senza fasi dell’altro lato', (executionMode, expectedHand) => {
    const item = configured({ sets: 1, reps: 3, seconds: 5, timer: { mode: 'guided', execution_mode: executionMode } }, 0)
    const state = createExerciseTimerState(item)!
    expect(state.sequence.filter(step => step.kind === 'work')).toHaveLength(3)
    expect(state.sequence.filter(step => step.kind === 'work').every(step => step.hand === (expectedHand === 'right' ? 'DX' : 'SX'))).toBe(true)
    expect(state.sequence.some(step => step.kind === 'hand_change')).toBe(false)
  })

  it('rispetta 3 × 6 Repeaters con 7 secondi di lavoro e 3 di recupero', () => {
    const item = configured({ sets: 3, reps: 6, seconds: 7, timer: { mode: 'guided', interval_rest_seconds: 3 } }, 60)
    const state = createExerciseTimerState(item)!
    expect(state.sequence.filter(step => step.kind === 'work')).toHaveLength(18)
    expect(state.sequence.filter(step => step.kind === 'interval_rest')).toHaveLength(15)
    expect(state.sequence.filter(step => step.kind === 'work').every(step => step.durationSeconds === 7)).toBe(true)
    expect(state.sequence.filter(step => step.kind === 'interval_rest').every(step => step.durationSeconds === 3)).toBe(true)
    expect(state.sequence.filter(step => step.kind === 'set_rest').map(step => step.durationSeconds)).toEqual([60, 60])
  })

  it('attende conferma manuale a ogni serie e non programma il recupero finale', () => {
    const item = configured({ sets: 3, reps: 6, seconds: 0, timer: { mode: 'recovery_only' } }, 40)
    const state = createExerciseTimerState(item)!
    expect(state.phase).toBe('awaiting_set')
    const started = toggleExerciseTimerState(item, state)
    expect(started).toMatchObject({ phase: 'set_rest', running: true, set: 1 })
    expect(toggleExerciseTimerState(item, null)).toMatchObject({ phase: 'set_rest', running: true, set: 1 })
    expect(toggleExerciseTimerState(item, started)).toMatchObject({ phase: 'set_rest', running: false, set: 1 })
    expect(state.sequence.filter(step => step.kind === 'awaiting_set')).toHaveLength(3)
    expect(state.sequence.filter(step => step.kind === 'set_rest')).toHaveLength(2)
    const rest = advanceExerciseTimer(state)
    expect(rest.phase).toBe('set_rest')
    expect(rest.running).toBe(false)
    const afterRest = elapseExerciseTimer({ ...rest, running: true }, 40)
    expect(afterRest.phase).toBe('awaiting_set')
    const lastRest = advanceExerciseTimer(afterRest)
    expect(lastRest.phase).toBe('set_rest')
    const complete = elapseExerciseTimer({ ...lastRest, running: true }, 40)
    expect(complete.phase).toBe('awaiting_set')
    expect(advanceExerciseTimer(complete).phase).toBe('complete')
    expect(createExerciseTimerState(configured({ sets: 1, reps: 6, seconds: 0, timer: { mode: 'recovery_only' } }, null))).toBeNull()
  })

  it('nessun timer prevale su durata e recupero, senza creare stato attivo', () => {
    expect(createExerciseTimerState(configured({ sets: 3, reps: 5, seconds: 7, timer: { mode: 'none' } }, 90))).toBeNull()
  })

  it('usa i valori differenti di ogni serie senza appiattirli', () => {
    const item = configured({
      sets: 3,
      reps: 10,
      seconds: 7,
      timer: { mode: 'guided', interval_rest_seconds: 3 },
      steps: [{ reps: 10, seconds: 7 }, { reps: 8, seconds: 6 }, { reps: 6, seconds: 5 }],
    }, 30)
    const works = createExerciseTimerState(item)!.sequence.filter(step => step.kind === 'work')
    expect(works.map(step => [step.setNumber, step.repetition, step.durationSeconds])).toEqual([
      [1, 1, 7], [1, 2, 7], [1, 3, 7], [1, 4, 7], [1, 5, 7], [1, 6, 7], [1, 7, 7], [1, 8, 7], [1, 9, 7], [1, 10, 7],
      [2, 1, 6], [2, 2, 6], [2, 3, 6], [2, 4, 6], [2, 5, 6], [2, 6, 6], [2, 7, 6], [2, 8, 6],
      [3, 1, 5], [3, 2, 5], [3, 3, 5], [3, 4, 5], [3, 5, 5], [3, 6, 5],
    ])
    const state = createExerciseTimerState(item)!
    const secondSetStart = state.sequence.findIndex(step => step.kind === 'work' && step.setNumber === 2)
    const secondSetState = { ...state, sequenceIndex: secondSetStart, set: 2, repetition: 1, phase: 'work' as const, remaining: 6 }
    expect(exerciseTimerProgressLabel(secondSetState)).toContain('RIPETIZIONE 1/8')
  })

  it('segue i campi canonici rispetto alle chiavi timer legacy e non inventa recuperi espliciti', () => {
    const item = configured({ sets: 2, reps: 3, seconds: 5, timer: { mode: 'guided', repetitions: 8, work_seconds: 9, set_rest_seconds: 90 } }, 0)
    const state = createExerciseTimerState(item)!
    expect(state.config.repetitions).toBe(3)
    expect(state.config.workSeconds).toBe(5)
    expect(state.config.setRestSeconds).toBe(0)
    expect(state.sequence.filter(step => step.kind === 'set_rest')).toHaveLength(0)
  })

  it('mantiene compatibilità legacy single_hand e timer guided storici', () => {
    const item = configured({ sets: 1, reps: 2, seconds: 5, timer: { execution_mode: 'single_hand', work_seconds: 5, repetitions: 2, hand_change_seconds: 1 } }, 0)
    const state = createExerciseTimerState(item)!
    expect(state.sequence.filter(step => step.kind === 'work').map(step => step.hand)).toEqual(['DX', 'SX', 'DX', 'SX'])
  })

  it('ripristina snapshot legacy single_hand in pausa e rifiuta snapshot incompatibili senza crash', () => {
    const legacyState = {
      exerciseId: 'exercise-1',
      config: { mode: 'guided', executionMode: 'single_hand', preparationSeconds: 0, workSeconds: 5, handChangeSeconds: 2, intervalRestSeconds: 0, repetitions: 2, sets: 1, setRestSeconds: 0 },
      phase: 'work', set: 1, repetition: 1, hand: 'right', remaining: 3, running: false,
    } as unknown as ExerciseTimerState
    const restored = restoreExerciseTimerSnapshot({ state: legacyState, savedAt: 1000 }, 9000)
    expect(restored).toMatchObject({ phase: 'work', hand: 'right', remaining: 3, running: false })
    expect(restored?.sequence.filter(step => step.kind === 'work').map(step => step.hand)).toEqual(['DX', 'SX', 'DX', 'SX'])
    expect(restoreExerciseTimerSnapshot({ state: { ...legacyState, config: null } as unknown as ExerciseTimerState, savedAt: 1000 }, 9000)).toBeNull()
  })

  it('la sequenza runtime usa lo stesso generatore della preview, incluse alternanza e recuperi', () => {
    const prescription = { sets: 2, reps: 2, seconds: 4, timer: { mode: 'guided', execution_mode: 'alternate_hands', hand_change_seconds: 1, interval_rest_seconds: 2 } }
    const editorValues = timerSettingsFromPrescription(prescription, 10)
    const previewSteps = buildTimerSeriesSequence(editorValues)
    const runtime = createExerciseTimerState(configured(prescription, 10))!
    const firstRuntimeSet = runtime.sequence.filter(step => step.setNumber === 1 && step.kind !== 'preparation' && step.kind !== 'set_rest')
    expect(firstRuntimeSet.map(step => step.kind === 'work' ? `${step.hand}${step.repetition} ${step.durationSeconds}s` : `${step.kind === 'hand_change' ? 'cambio' : 'pausa'} ${step.durationSeconds}s`)).toEqual(previewSteps.map(step => step.label))
    expect(runtime.sequence.filter(step => step.kind === 'set_rest')).toHaveLength(1)
    expect(buildTimerProtocolSequence(editorValues).map(step => step.kind)).toEqual(runtime.sequence.map(step => step.kind))
  })

  it('la pausa SX→DX somma cambio mano e intervallo una volta e non aggiunge pause finali', () => {
    const item = configured({ sets: 1, reps: 2, seconds: 1, timer: { mode: 'guided', execution_mode: 'alternate_hands', hand_change_seconds: 2, interval_rest_seconds: 3 } }, 30)
    const state = createExerciseTimerState(item)!
    const sxIndex = state.sequence.findIndex(step => step.kind === 'work' && step.hand === 'SX' && step.repetition === 1)
    expect(state.sequence.slice(sxIndex + 1, sxIndex + 3).map(step => [step.kind, step.durationSeconds])).toEqual([['hand_change', 2], ['interval_rest', 3]])
    expect(state.sequence.slice(-1)[0]).toMatchObject({ kind: 'work', hand: 'SX', repetition: 2 })
  })

  it('non modifica prescrizioni, carichi o stato di completamento mentre il timer avanza', () => {
    const item = configured({ sets: 2, reps: 2, seconds: 3, loadKg: 42.5, steps: [
      { reps: 2, seconds: 3, loadKg: 40 }, { reps: 1, seconds: 2, loadKg: 42.5 },
    ], timer: { mode: 'guided', interval_rest_seconds: 1 } }, 30)
    const beforePrescription = structuredClone(item.prescription)
    const beforeProgress = item.progress
    let state = createExerciseTimerState(item)!
    for (let tick = 0; tick < 50 && state.phase !== 'complete'; tick += 1) {
      state = elapseExerciseTimer({ ...state, running: true }, 1)
    }
    expect(state.phase).toBe('complete')
    expect(item.prescription).toEqual(beforePrescription)
    expect(item.progress).toBe(beforeProgress)
  })

  it('salta fasi e recuperi a durata zero senza loop e mantiene in pausa il timer', () => {
    const item = configured({ sets: 2, reps: 2, seconds: 1, timer: { mode: 'guided', preparation_seconds: 0, interval_rest_seconds: 0 } }, 0)
    const initial = createExerciseTimerState(item)!
    expect(initial.phase).toBe('work')
    const skipped = skipExerciseTimerPhase(initial)
    expect(skipped.phase).toBe('work')
    expect(skipped.repetition).toBe(2)
    const paused = restoreExerciseTimerSnapshot({ state: { ...initial, running: false }, savedAt: 1000 }, 100000)
    expect(paused?.phase).toBe('work')
    expect(paused?.remaining).toBe(1)
    const longRun = elapseExerciseTimer({ ...initial, running: true }, 100000)
    expect(longRun.phase).toBe('complete')
  })
})
