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
      onConfirmSet: vi.fn(),
      onResetTimer: vi.fn(),
      onAdjustTimer: vi.fn(),
      onSkipTimerPhase: vi.fn(),
      onUpdateExerciseInput: vi.fn(),
      onRecordExercise: vi.fn(),
      soundEnabled: true,
      onToggleSound: vi.fn(),
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
  it('mostra le cinque ripetizioni storiche per serie senza modificare la prescrizione', async () => {
    const prescription = { sets: 1, reps: 0 }
    const screen = await renderCard(exercise({
      name: 'Intentional Block Lifting',
      prescription,
      instructions: 'RPE 8–9/10. Carichi calcolati sul massimale di 27 kg.\n10 rep 60%\n8 rep 65%\n6 rep 70%\n4 rep 80%\n3 rep 86%',
    }))
    expect(Array.from(screen.querySelectorAll('.athlete-prescription-value'), row => row.textContent)).toEqual([
      '60% = 16 kg · 10 rep',
      '65% = 17.5 kg · 8 rep',
      '70% = 19 kg · 6 rep',
      '80% = 21.5 kg · 4 rep',
      '86% = 23 kg · 3 rep',
    ])
    expect(screen.querySelector('.athlete-prescription-meta strong')?.textContent).toBe('5')
    expect(screen.textContent).not.toContain('10 rep 60%')
    expect(prescription).toEqual({ sets: 1, reps: 0 })
  })

  it('mostra le ripetizioni della serie corretta per il nuovo carico percentuale', async () => {
    const screen = await renderCard(exercise({
      name: 'Intentional Block Lifting',
      prescription: {
        sets: 2,
        intentionalLoad: { version: 1, mode: 'percentage', source: { type: 'manual_max', maxKg: 27 } },
        steps: [{ reps: 10, percentage: 60 }, { reps: 3, percentage: 86 }],
      },
      calculationContext: { test_target: { set_targets: [
        { setNumber: 1, percentage: 80, calculatedTarget: 100, targetUnit: 'kg' },
        { setNumber: 2, percentage: 80, calculatedTarget: 100, targetUnit: 'kg' },
      ] } },
    }))

    expect(Array.from(screen.querySelectorAll('.athlete-prescription-value'), row => row.textContent)).toEqual([
      '60% = 16 kg · 10 rep',
      '86% = 23 kg · 3 rep',
    ])
    expect(screen.textContent).not.toContain('80%')
    expect(screen.textContent).not.toContain('Corpo libero')
  })

  it('mostra kg e ripetizioni manuali senza riattivare un vecchio target da test', async () => {
    const screen = await renderCard(exercise({
      name: 'Intentional Block Lifting',
      prescription: {
        sets: 2,
        intentionalLoad: { version: 1, mode: 'manual_kg' },
        steps: [{ reps: 10, loadKg: 16 }, { reps: 3, loadKg: 23 }],
      },
      instructions: 'RPE 8–9/10. Carichi calcolati sul massimale di 27 kg.\n10 rep 60%\n3 rep 86%',
      calculationContext: { test_target: { set_targets: [
        { setNumber: 1, percentage: 80, calculatedTarget: 100, targetUnit: 'kg' },
        { setNumber: 2, percentage: 80, calculatedTarget: 100, targetUnit: 'kg' },
      ] } },
    }))

    expect(Array.from(screen.querySelectorAll('.athlete-prescription-value'), row => row.textContent)).toEqual([
      '16 kg · 10 rep',
      '23 kg · 3 rep',
    ])
    expect(screen.textContent).not.toContain('80%')
    expect(screen.textContent).not.toContain('massimale di 27 kg')
    expect(screen.textContent).toContain('RPE 8–9/10')
  })

  it('mostra ripetizioni e carichi variabili nella scheda atleta', async () => {
    const screen = await renderCard(exercise({
      prescription: { sets: 2, reps: 6, steps: [{ loadKg: 20 }, { loadKg: 25 }] },
    }))

    expect(screen.querySelectorAll('.athlete-prescription-row')).toHaveLength(2)
    expect(screen.querySelectorAll('.athlete-prescription-value')[0]?.textContent).toBe('20 kg × 6 rep')
    expect(screen.querySelectorAll('.athlete-prescription-value')[1]?.textContent).toBe('25 kg × 6 rep')
    expect(screen.textContent).toContain('Carichi variabili')
    expect(screen.textContent).not.toContain('Corpo libero')
  })

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

  it('non inventa un recupero di 90 secondi per una configurazione timer esplicita senza recupero', async () => {
    const screen = await renderCard(exercise({
      prescription: { sets: 2, reps: 5, seconds: 7, timer: { mode: 'guided' } },
      restSeconds: null,
    }))

    expect(screen.textContent).toContain('RECUPERO—')
    expect(screen.textContent).not.toContain('90 sec')
  })
})
