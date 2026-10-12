// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionExerciseCard } from './SessionExerciseCard'
import type { RunnerExercise } from './sessionRunner'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

async function renderCard(exercise: RunnerExercise) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(SessionExerciseCard, {
      exercise,
      coachNotes: null,
      canEdit: false,
      isNext: true,
      timerState: null,
      exerciseInput: { rpe: '', notes: '' },
      exerciseSaveState: 'idle',
      onToggleTimer: vi.fn(),
      onResetTimer: vi.fn(),
      onAdjustTimer: vi.fn(),
      onSkipTimerPhase: vi.fn(),
      onUpdateExerciseInput: vi.fn(),
      onRecordExercise: vi.fn(),
    }))
  })
  return container
}

function exercise(overrides: Partial<RunnerExercise> = {}): RunnerExercise {
  return {
    id: 'exercise-1',
    order: 1,
    name: 'Block lift',
    prescription: {},
    calculationContext: {},
    targetRpeMin: 7,
    targetRpeMax: 8,
    restSeconds: 120,
    instructions: null,
    progress: null,
    ...overrides,
  }
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe('SessionExerciseCard descrizioni legacy', () => {
  it('mostra la nota senza duplicare le righe strutturate', async () => {
    const screen = await renderCard(exercise({
      prescription: {
        sets: 2,
        dose: '20 kg × 8 · 25 kg × 5 · mantenere spalle attive',
        steps: [
          { label: 'Set 1', loadKg: 20, reps: 8 },
          { label: 'Set 2', loadKg: 25, reps: 5 },
        ],
      },
    }))

    expect(screen.querySelector('.athlete-prescription-note')?.textContent).toBe('Nota: mantenere spalle attive')
    expect(screen.querySelectorAll('.athlete-prescription-row')).toHaveLength(2)
    expect(screen.textContent?.match(/20 kg × 8 rep/g)).toHaveLength(1)
    expect(screen.textContent?.match(/25 kg × 5 rep/g)).toHaveLength(1)
  })

  it('mostra la nota anche con target variabili derivati dal test', async () => {
    const screen = await renderCard(exercise({
      prescription: { sets: 2, reps: 6, dose: '6 ripetizioni · tenuta 5 s a 90°' },
      calculationContext: {
        test_target: {
          set_targets: [
            { setNumber: 1, percentage: 60, calculatedTarget: 24, targetUnit: 'kg' },
            { setNumber: 2, percentage: 70, calculatedTarget: 28, targetUnit: 'kg' },
          ],
        },
      },
    }))

    expect(screen.querySelector('.athlete-prescription-note')?.textContent).toBe('Nota: tenuta 5 s a 90°')
    expect(screen.querySelectorAll('.athlete-prescription-row')).toHaveLength(2)
    expect(screen.textContent).not.toContain('6 ripetizioni')
  })
})
