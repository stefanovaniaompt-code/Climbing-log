// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionExerciseCard } from './SessionExerciseCard'
import { confirmExerciseTimerSet, createExerciseTimerState, elapseExerciseTimer, type ExerciseTimerState, type RunnerExercise } from './sessionRunner'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

function makeExercise(prescription: Record<string, unknown> = { sets: 3, reps: 2, seconds: 2, timer: { mode: 'guided' } }): RunnerExercise {
  return {
    id: 'timer-exercise', order: 1, name: 'Repeaters', prescription,
    calculationContext: {}, targetRpeMin: null, targetRpeMax: null,
    restSeconds: 30, instructions: null, progress: null,
  }
}

async function renderTimer(options: {
  exercise?: RunnerExercise
  timerState?: ExerciseTimerState | null
  onConfirmSet?: (exerciseId: string) => void
  onToggleTimer?: (exercise: RunnerExercise) => void
  onRecordExercise?: (exercise: RunnerExercise) => void
  onResetTimer?: (exercise: RunnerExercise) => void
  onAdjustTimer?: (exerciseId: string, seconds: number) => void
  onSkipTimerPhase?: (exerciseId: string) => void
  onToggleSound?: () => void
  onUpdateExerciseInput?: (exerciseId: string, patch: { rpe?: string; notes?: string }) => void
  soundEnabled?: boolean
} = {}) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const exercise = options.exercise ?? makeExercise()
  const timerState = options.timerState === undefined ? createExerciseTimerState(exercise) : options.timerState
  const callbacks = {
    onConfirmSet: options.onConfirmSet ?? vi.fn<(exerciseId: string) => void>(),
    onToggleTimer: options.onToggleTimer ?? vi.fn<(exercise: RunnerExercise) => void>(),
    onRecordExercise: options.onRecordExercise ?? vi.fn<(exercise: RunnerExercise) => void>(),
    onResetTimer: options.onResetTimer ?? vi.fn<(exercise: RunnerExercise) => void>(),
    onAdjustTimer: options.onAdjustTimer ?? vi.fn<(exerciseId: string, seconds: number) => void>(),
    onSkipTimerPhase: options.onSkipTimerPhase ?? vi.fn<(exerciseId: string) => void>(),
    onToggleSound: options.onToggleSound ?? vi.fn<() => void>(),
  }
  const onUpdateExerciseInput = options.onUpdateExerciseInput ?? vi.fn<(exerciseId: string, patch: { rpe?: string; notes?: string }) => void>()
  const render = async (nextState = timerState) => act(async () => root?.render(createElement(SessionExerciseCard, {
    exercise, coachNotes: null, canEdit: true, isNext: true,
    timerState: nextState, exerciseInput: { rpe: '', notes: '' }, exerciseSaveState: 'idle',
    ...callbacks, soundEnabled: options.soundEnabled ?? true,
    onUpdateExerciseInput,
  })))
  await render()
  return { screen: container, callbacks, exercise, timerState, render, onUpdateExerciseInput }
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function openTimer(screen: HTMLElement) {
  await act(async () => (screen.querySelector('.athlete-exercise-timer-button') as HTMLButtonElement).click())
  return document.body.querySelector('[role="dialog"]') as HTMLElement
}

describe('interfaccia Timer V2 atleta', () => {
  it('mostra fase, serie, ripetizione e mano DX/SX alternate senza ambiguità', async () => {
    const exercise = makeExercise({ sets: 2, reps: 3, seconds: 7, timer: { mode: 'guided', execution_mode: 'alternate_hands', hand_change_seconds: 2 } })
    const timerState = createExerciseTimerState(exercise)!
    const { screen } = await renderTimer({ exercise, timerState })
    const dialog = await openTimer(screen!)
    expect(dialog.textContent).toContain('SERIE 1/2')
    expect(dialog.textContent).toContain('RIPETIZIONE 1/3')
    expect(dialog.textContent).toContain('LAVORO DX')
    expect(dialog.textContent).toContain('DX')
  })

  it('durante il cambio mano indica subito che segue SX', async () => {
    const exercise = makeExercise({ sets: 1, reps: 2, seconds: 5, timer: { mode: 'guided', execution_mode: 'alternate_hands', hand_change_seconds: 2 } })
    const initial = createExerciseTimerState(exercise)!
    const change = { ...initial, phase: 'hand_rest', hand: 'right', sequenceIndex: 1, remaining: 2 } as ExerciseTimerState
    const { screen } = await renderTimer({ exercise, timerState: change })
    expect((await openTimer(screen!)).textContent).toContain('CAMBIO MANO · PROSSIMA SX')
  })

  it.each(['right_only', 'left_only'] as const)('indica correttamente la modalità %s', async execution_mode => {
    const exercise = makeExercise({ sets: 1, reps: 2, seconds: 5, timer: { mode: 'guided', execution_mode } })
    const { screen } = await renderTimer({ exercise })
    expect((await openTimer(screen!)).textContent).toContain(execution_mode === 'right_only' ? 'LAVORO DX' : 'LAVORO SX')
  })

  it('indica il lavoro bilaterale senza assegnare una mano singola', async () => {
    const { screen } = await renderTimer({ exercise: makeExercise({ sets: 1, reps: 2, seconds: 5, timer: { mode: 'guided', execution_mode: 'bilateral' } }) })
    expect((await openTimer(screen!)).textContent).toContain('BILATERALE')
  })

  it('usa i parametri della progressione della serie corrente', async () => {
    const exercise = makeExercise({ sets: 2, steps: [{ reps: 3, seconds: 7 }, { reps: 5, seconds: 9 }], timer: { mode: 'guided' } })
    const state = createExerciseTimerState(exercise)!
    const secondSet = { ...state, sequenceIndex: state.sequence.findIndex(step => step.setNumber === 2 && step.kind === 'work'), set: 2, repetition: 1, remaining: 9, phase: 'work' } as ExerciseTimerState
    const { screen } = await renderTimer({ exercise, timerState: secondSet })
    const dialog = await openTimer(screen!)
    expect(dialog.textContent).toContain('SERIE 2/2')
    expect(dialog.textContent).toContain('RIPETIZIONE 1/5')
    expect(dialog.textContent).toContain('00:09')
  })

  it('espone un comando esplicito per confermare la serie in modalità solo recupero', async () => {
    const exercise = makeExercise({ sets: 3, reps: 6, seconds: 0, timer: { mode: 'recovery_only' } })
    const onConfirmSet = vi.fn()
    const { screen, callbacks } = await renderTimer({ exercise, onConfirmSet })
    const dialog = await openTimer(screen!)
    expect((dialog.querySelector('.athlete-timer-focus__ring') as HTMLElement).style.getPropertyValue('--timer-progress')).toBe('0deg')
    expect(dialog.querySelector('button.athlete-timer-focus__confirm-set')?.textContent).toContain('SERIE COMPLETATA')
    expect(dialog.querySelector('.athlete-timer-focus__main')).toBeNull()
    await act(async () => (dialog.querySelector('.athlete-timer-focus__confirm-set') as HTMLButtonElement).click())
    expect(onConfirmSet).toHaveBeenCalledWith(exercise.id)
    expect(callbacks.onRecordExercise).not.toHaveBeenCalled()
  })

  it('integra conferma, recupero, serie successiva e fine senza recupero finale', async () => {
    const exercise = makeExercise({ sets: 2, reps: 6, seconds: 0, timer: { mode: 'recovery_only' } })
    let state = createExerciseTimerState(exercise)!
    const onConfirmSet = vi.fn(() => { state = confirmExerciseTimerSet(state) })
    const { screen, render } = await renderTimer({ exercise, timerState: state, onConfirmSet })
    let dialog = await openTimer(screen!)
    await act(async () => (dialog.querySelector('.athlete-timer-focus__confirm-set') as HTMLButtonElement).click())
    expect(state).toMatchObject({ phase: 'set_rest', running: true, set: 1 })
    state = elapseExerciseTimer(state, 30)
    await render(state)
    dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('ATTESA CONFERMA MANUALE')
    expect(state).toMatchObject({ phase: 'awaiting_set', set: 2 })
    await act(async () => (dialog.querySelector('.athlete-timer-focus__confirm-set') as HTMLButtonElement).click())
    expect(state.phase).toBe('complete')
    expect(state.sequence[state.sequence.length - 1].kind).toBe('awaiting_set')
    expect(state.sequence.some(step => step.setNumber === 2 && step.kind === 'set_rest')).toBe(false)
  })

  it('separa la fine del protocollo dal salvataggio dell esercizio', async () => {
    const exercise = makeExercise({ sets: 1, reps: 1, seconds: 1, timer: { mode: 'guided' } })
    const state = { ...createExerciseTimerState(exercise)!, phase: 'complete', sequenceIndex: createExerciseTimerState(exercise)!.sequence.length, remaining: 0, running: false } as ExerciseTimerState
    const onRecordExercise = vi.fn()
    const { screen } = await renderTimer({ exercise, timerState: state, onRecordExercise })
    const dialog = await openTimer(screen!)
    expect(dialog.textContent).toContain('PROTOCOLLO TERMINATO')
    expect(onRecordExercise).not.toHaveBeenCalled()
    await act(async () => (dialog.querySelector('.athlete-timer-focus__complete') as HTMLButtonElement).click())
    expect(onRecordExercise).toHaveBeenCalledTimes(1)
  })

  it('calcola il progresso usando sequenze lunghe già presenti nello stato', async () => {
    const exercise = { ...makeExercise({ sets: 3, reps: 500, seconds: 1, timer: { mode: 'guided' } }), restSeconds: null }
    const initial = createExerciseTimerState(exercise)!
    const state = { ...initial, sequenceIndex: 600, phase: 'work', set: 2, repetition: 101, hand: 'right', remaining: 1 } as ExerciseTimerState
    const { screen } = await renderTimer({ exercise, timerState: state })
    const dialog = await openTimer(screen!)
    expect(dialog.textContent).toContain('AVANZAMENTO ESERCIZIO')
    expect(dialog.textContent).toContain('40%')
  })

  it('audio ON/OFF è accessibile e invoca la logica della hook', async () => {
    const onToggleSound = vi.fn()
    const { screen } = await renderTimer({ onToggleSound, soundEnabled: false })
    const dialog = await openTimer(screen!)
    const button = dialog.querySelector('[aria-label="Attiva audio timer"]') as HTMLButtonElement
    expect(button).not.toBeNull()
    await act(async () => button.click())
    expect(onToggleSound).toHaveBeenCalledTimes(1)
  })

  it('mantiene distinti play/pausa, reset e salto fase', async () => {
    const exercise = makeExercise()
    const onToggleTimer = vi.fn<(item: RunnerExercise) => void>()
    const onResetTimer = vi.fn<(item: RunnerExercise) => void>()
    const onSkipTimerPhase = vi.fn<(id: string) => void>()
    const onAdjustTimer = vi.fn<(id: string, seconds: number) => void>()
    const { screen, render, timerState } = await renderTimer({ exercise, onToggleTimer, onResetTimer, onSkipTimerPhase, onAdjustTimer })
    const dialog = await openTimer(screen!)
    await act(async () => (dialog.querySelector('[aria-label="Riprendi timer"]') as HTMLButtonElement).click())
    await render({ ...timerState!, running: true })
    const activeDialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    await act(async () => (activeDialog.querySelector('[aria-label="Pausa timer"]') as HTMLButtonElement).click())
    await act(async () => (activeDialog.querySelector('[aria-label="Sottrai 10 secondi"]') as HTMLButtonElement).click())
    await act(async () => (activeDialog.querySelector('[aria-label="Aggiungi 10 secondi"]') as HTMLButtonElement).click())
    await act(async () => (dialog.querySelector('[aria-label="Reimposta timer"]') as HTMLButtonElement).click())
    await act(async () => (dialog.querySelector('.athlete-timer-focus__skip') as HTMLButtonElement).click())
    expect(onToggleTimer).toHaveBeenCalledWith(exercise)
    expect(onResetTimer).toHaveBeenCalledWith(exercise)
    expect(onSkipTimerPhase).toHaveBeenCalledWith(exercise.id)
    expect(onAdjustTimer.mock.calls.map(([, seconds]) => seconds)).toEqual([-10, 10])
    expect(exercise.progress?.completed).not.toBe(true)
  })

  it('continua a esporre i campi RPE e note indipendentemente dal timer', async () => {
    const onUpdateExerciseInput = vi.fn<(id: string, patch: { rpe?: string; notes?: string }) => void>()
    const { screen } = await renderTimer({ onUpdateExerciseInput })
    const rpe = screen!.querySelector('input[placeholder="0-10"]') as HTMLInputElement
    const note = screen!.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(rpe, '8'); rpe.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(note, 'presa stabile'); note.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(screen!.textContent).toContain('RPE E NOTE')
    expect(onUpdateExerciseInput).toHaveBeenCalled()
  })

  it('mantiene a 100% il protocollo terminato e non mostra il timer per la modalità none', async () => {
    const none = makeExercise({ sets: 2, reps: 5, seconds: 7, timer: { mode: 'none' } })
    const { screen } = await renderTimer({ exercise: none })
    expect(screen?.querySelector('.athlete-exercise-timer-button')).toBeNull()
    expect(screen?.textContent).toContain('COMPLETA')
  })

  it('consente di uscire e rientrare senza modificare lo stato passato dalla sessione', async () => {
    const exercise = makeExercise()
    const timerState = createExerciseTimerState(exercise)!
    const { screen } = await renderTimer({ exercise, timerState })
    let dialog = await openTimer(screen!)
    await act(async () => (dialog.querySelector('[aria-label="Torna alla sessione"]') as HTMLButtonElement).click())
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    dialog = await openTimer(screen!)
    expect(dialog.textContent).toContain('00:02')
    expect(timerState.sequenceIndex).toBe(0)
  })

  it('mostra uno stato restaurato della sessione senza riportare il timer all inizio', async () => {
    const exercise = makeExercise()
    const initial = createExerciseTimerState(exercise)!
    const restored = { ...initial, sequenceIndex: 2, phase: 'work', repetition: 2, remaining: 1, running: false } as ExerciseTimerState
    const { screen } = await renderTimer({ exercise, timerState: restored })
    const dialog = await openTimer(screen!)
    expect(dialog.textContent).toContain('RIPETIZIONE 2/2')
    expect(dialog.textContent).toContain('00:01')
    expect(restored.sequenceIndex).toBe(2)
  })

  it('ha un nome e focus iniziale accessibili e chiude con Escape', async () => {
    const { screen } = await renderTimer()
    const dialog = await openTimer(screen!)
    expect(dialog.getAttribute('aria-label')).toBe('Timer Repeaters')
    expect(document.activeElement).toBe(dialog.querySelector('[aria-label="Torna alla sessione"]'))
    await act(async () => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('mantiene il focus dentro il dialog con Tab e Shift+Tab', async () => {
    const { screen } = await renderTimer()
    const dialog = await openTimer(screen!)
    const back = dialog.querySelector('[aria-label="Torna alla sessione"]') as HTMLButtonElement
    const last = dialog.querySelector('[aria-label="Disattiva audio timer"]') as HTMLButtonElement
    last.focus()
    await act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(back)
    back.focus()
    await act(async () => back.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(last)
  })
})
