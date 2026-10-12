// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppProfile } from '../onboarding/types'

const repository = vi.hoisted(() => ({
  createLibraryExercise: vi.fn(),
  deleteLibraryExercise: vi.fn(),
  loadExerciseLibrary: vi.fn(),
  setLibraryExerciseArchived: vi.fn(),
  updateLibraryExercise: vi.fn(),
}))

vi.mock('./exerciseLibraryRepository', () => repository)

import { LibraryScreen } from './LibraryScreen'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const profile: AppProfile = {
  userId: 'coach-timer-test', displayName: 'Coach', role: 'coach', athleteId: null,
  capabilities: { canAccessCoachArea: true, canAccessAthleteArea: false }, workspaceId: 'workspace', workspaceName: 'Climbing Coach',
  onboardingCompletedAt: '2026-09-01T00:00:00.000Z', mustChangePassword: false,
}

let root: Root | null = null
let container: HTMLDivElement | null = null

async function renderLibrary() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(LibraryScreen, { profile })) })
  for (let index = 0; index < 4; index += 1) await act(async () => { await Promise.resolve() })
  return container
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  container?.remove()
  container = null
  vi.clearAllMocks()
})

describe('LibraryScreen timer persistence', () => {
  it('preserva timer e campi JSON avanzati quando salva una modifica dell’esercizio', async () => {
    const defaultPrescription = {
      sets: 3, reps: 6, seconds: 7, loadKg: 25, restSeconds: 90,
      timer: { mode: 'guided', execution_mode: 'single_hand', preparation_seconds: 4, hand_change_seconds: 3, interval_rest_seconds: 2, extension_flag: 'retain' },
      custom_root_field: { protocol: 'legacy' },
    }
    repository.loadExerciseLibrary.mockResolvedValue({ source: 'legacy-v1', items: [{
      id: 'exercise-1', name: 'Hang board', category: 'Dita', modality: 'Isometrico', description: '', defaultInstructions: '',
      defaultPrescription, archived: false, usageCount: 1,
    }] })
    repository.updateLibraryExercise.mockResolvedValue(undefined)

    const screen = await renderLibrary()
    const name = screen.querySelector<HTMLInputElement>('input[placeholder="Es. Max hang · 20 mm"]')
    if (!name) throw new Error('Campo nome esercizio non trovato')
    await act(async () => setInput(name, 'Hang board aggiornato'))
    const save = Array.from(screen.querySelectorAll('button')).find(button => button.textContent?.includes('Salva modifiche'))
    if (!save) throw new Error('Pulsante di salvataggio non trovato')
    await act(async () => { save.click(); await Promise.resolve() })

    expect(repository.updateLibraryExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateLibraryExercise.mock.calls[0]?.[2].defaultPrescription).toMatchObject({
      timer: { mode: 'guided', execution_mode: 'single_hand', preparation_seconds: 4, hand_change_seconds: 3, interval_rest_seconds: 2, extension_flag: 'retain' },
      custom_root_field: { protocol: 'legacy' },
    })
  })
})
