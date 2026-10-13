// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExerciseTimerState, type RunnerExercise } from './sessionRunner'
import { useSessionTimer } from './useSessionTimer'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

const exercise: RunnerExercise = {
  id: 'timer-background', order: 1, name: 'Repeaters',
  prescription: { sets: 1, reps: 2, seconds: 10, timer: { mode: 'guided' } },
  calculationContext: {}, targetRpeMin: null, targetRpeMax: null,
  restSeconds: 0, instructions: null, progress: null,
}

async function mountTimer() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  let controller: ReturnType<typeof useSessionTimer>
  function Harness() {
    controller = useSessionTimer()
    return null
  }
  await act(async () => root?.render(createElement(Harness)))
  return () => controller!
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.useRealTimers()
})

describe('timer atleta e sospensione degli intervalli', () => {
  it('limita a 180 secondi complessivi l’estensione del recupero 2–3 minuti', async () => {
    const current = await mountTimer()
    const item = { ...exercise, name: 'Intentional Block Lifting', prescription: { sets: 3 }, restSeconds: null, instructions: 'Recupero 2–3 minuti.' }
    const initial = createExerciseTimerState(item)!
    await act(async () => current().setTimerState(initial))
    await act(async () => current().confirmSet(item.id))
    expect(current().timerState).toMatchObject({ phase: 'set_rest', remaining: 120 })
    for (let index = 0; index < 8; index += 1) await act(async () => current().adjustTimer(item.id, 10))
    expect(current().timerState).toMatchObject({ remaining: 180, restExtensionSeconds: 60 })
  })
  it('recupera il tempo reale trascorso dopo un callback sospeso, anche attraverso più fasi', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const current = await mountTimer()
    await act(async () => current().setTimerState({ ...createExerciseTimerState(exercise)!, running: true }))

    vi.setSystemTime(16_000)
    await act(async () => vi.advanceTimersByTime(1_000))

    expect(current().timerState).toMatchObject({ phase: 'work', repetition: 2, remaining: 4 })
  })

  it('non consuma tempo mentre il timer è in pausa', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const current = await mountTimer()
    await act(async () => current().setTimerState(createExerciseTimerState(exercise)))

    vi.setSystemTime(31_000)
    await act(async () => vi.advanceTimersByTime(1_000))

    expect(current().timerState).toMatchObject({ phase: 'work', repetition: 1, remaining: 10, running: false })
  })

  it('si riconcilia al ritorno in primo piano senza attendere il prossimo intervallo', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const current = await mountTimer()
    await act(async () => current().setTimerState({ ...createExerciseTimerState(exercise)!, running: true }))

    vi.setSystemTime(26_000)
    await act(async () => window.dispatchEvent(new Event('focus')))

    expect(current().timerState).toMatchObject({ phase: 'complete', running: false, remaining: 0 })
    await act(async () => vi.advanceTimersByTime(1_000))
    expect(current().timerState).toMatchObject({ phase: 'complete', remaining: 0 })
  })
})
