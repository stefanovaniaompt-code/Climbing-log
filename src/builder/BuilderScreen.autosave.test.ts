// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppProfile } from '../onboarding/types'
import type { ProgramBuilderData } from './programBuilder'
import { mergePrescriptionForUpdate } from './programBuilder'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const repository = vi.hoisted(() => ({
  addExercise: vi.fn(),
  createProgram: vi.fn(),
  createSession: vi.fn(),
  createWeek: vi.fn(),
  deleteExercise: vi.fn(),
  deleteProgram: vi.fn(),
  deleteSession: vi.fn(),
  deleteWeek: vi.fn(),
  duplicateWeek: vi.fn(),
  loadProgramBuilder: vi.fn(),
  publishProgram: vi.fn(),
  updateExercise: vi.fn(),
  updateSessionDetails: vi.fn(),
  updateWeekDetails: vi.fn(),
}))

vi.mock('./programBuilderRepository', () => repository)
vi.mock('./ExerciseTestTargetPanel', () => ({ ExerciseTestTargetPanel: () => null }))
vi.mock('./testTargetRepository', () => ({ loadAthleteTestReferences: vi.fn().mockResolvedValue([]) }))

import { BuilderScreen, type BuilderNavigationGuard } from './BuilderScreen'
import { clearBuilderLocalDraftRevision, writeBuilderLocalDraft } from './builderLocalDraftStorage'

const profile: AppProfile = {
  userId: 'coach-1',
  displayName: 'Coach',
  role: 'coach',
  athleteId: null,
  capabilities: { canAccessCoachArea: true, canAccessAthleteArea: false },
  workspaceId: 'workspace-1',
  workspaceName: 'Climbing Coach',
  onboardingCompletedAt: '2026-09-01T00:00:00.000Z',
  mustChangePassword: false,
}

const builderData: ProgramBuilderData = {
  source: 'legacy-v1',
  athletes: [{ id: 'athlete-1', name: 'Atleta Uno' }, { id: 'athlete-2', name: 'Atleta Due' }],
  programs: [
    { id: 'program-1', athleteId: 'athlete-1', name: 'Programma', goal: null, programType: 'athlete', status: 'draft', startDate: '2026-09-01', endDate: null },
    { id: 'program-2', athleteId: 'athlete-1', name: 'Programma Due', goal: null, programType: 'athlete', status: 'draft', startDate: '2026-10-01', endDate: null },
    { id: 'program-3', athleteId: 'athlete-2', name: 'Programma Atleta Due', goal: null, programType: 'athlete', status: 'draft', startDate: '2026-11-01', endDate: null },
  ],
  weeks: [
    { id: 'week-1', programId: 'program-1', weekNumber: 1, blockName: 'Blocco uno', phase: 'Forza', status: 'planned', loadType: 'load', notes: null },
    { id: 'week-2', programId: 'program-1', weekNumber: 2, blockName: 'Blocco due', phase: 'Volume', status: 'planned', loadType: 'load', notes: null },
    { id: 'week-3', programId: 'program-1', weekNumber: 3, blockName: 'Blocco tre', phase: 'Tecnica', status: 'planned', loadType: 'load', notes: null },
    { id: 'week-program-2', programId: 'program-2', weekNumber: 1, blockName: 'Altro programma', phase: 'Forza', status: 'planned', loadType: 'load', notes: null },
    { id: 'week-program-3', programId: 'program-3', weekNumber: 1, blockName: 'Atleta due', phase: 'Forza', status: 'planned', loadType: 'load', notes: null },
  ],
  sessions: [
    { id: 'session-1', weekId: 'week-1', order: 1, title: 'Sessione uno', objective: 'Obiettivo uno', durationMinutes: 60, scheduledDay: 1 },
    { id: 'session-2', weekId: 'week-1', order: 2, title: 'Sessione due', objective: 'Obiettivo due', durationMinutes: 50, scheduledDay: 3 },
    { id: 'session-3', weekId: 'week-2', order: 1, title: 'Sessione tre', objective: 'Obiettivo tre', durationMinutes: 45, scheduledDay: 5 },
    { id: 'session-4', weekId: 'week-3', order: 1, title: 'Sessione quattro', objective: 'Obiettivo quattro', durationMinutes: 40, scheduledDay: 6 },
    { id: 'session-program-2', weekId: 'week-program-2', order: 1, title: 'Sessione altro programma', objective: '', durationMinutes: 40, scheduledDay: 1 },
    { id: 'session-program-3', weekId: 'week-program-3', order: 1, title: 'Sessione atleta due', objective: '', durationMinutes: 40, scheduledDay: 1 },
  ],
  library: [],
  exercises: [{ id: 'exercise-1', sessionId: 'session-1', exerciseId: null, order: 1, name: 'Hang board', prescription: { sets: 3, reps: 5 }, targetRpeMin: 7, targetRpeMax: 8, restSeconds: 120, instructions: 'Tecnica pulita' }],
  calendarEvents: [],
}

let root: Root | null = null
let container: HTMLDivElement | null = null
const setSelectedAthleteId = vi.fn()

async function renderBuilder(registerNavigationGuard?: (guard: BuilderNavigationGuard | null) => void) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)

  await act(async () => {
    root?.render(createElement(BuilderScreen, {
      profile,
      selectedAthleteId: 'athlete-1',
      setSelectedAthleteId,
      registerNavigationGuard,
    }))
  })

  for (let cycle = 0; cycle < 4; cycle += 1) {
    await act(async () => { await Promise.resolve() })
  }

  return container
}

function buttonWithText(element: ParentNode, text: string) {
  const button = Array.from(element.querySelectorAll('button')).find(candidate => candidate.textContent?.includes(text))
  if (!button) throw new Error(`Pulsante non trovato: ${text}`)
  return button
}

function inputWithLabel(element: ParentNode, text: string) {
  const label = Array.from(element.querySelectorAll('label')).find(candidate => candidate.querySelector('span')?.textContent === text)
  const input = label?.querySelector('input')
  if (!input) throw new Error(`Campo non trovato: ${text}`)
  return input
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function changeTextarea(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

function changeSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

async function editExerciseRest(screen: HTMLElement, value: string) {
  await act(async () => { buttonWithText(screen, 'Hang board').click() })
  await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), value) })
}

async function editSessionTitle(screen: HTMLElement, value: string) {
  await act(async () => { buttonWithText(screen, 'DETTAGLI SESSIONE').click() })
  await act(async () => { changeInput(inputWithLabel(screen, 'Titolo sessione'), value) })
}

async function prepareExerciseAddition(screen: HTMLElement, name = 'Campus board') {
  await act(async () => { buttonWithText(screen, 'AGGIUNGI ESERCIZIO').click() })
  const input = screen.querySelector<HTMLInputElement>('input[placeholder="Nome esercizio"]')
  if (!input) throw new Error('Campo nuovo esercizio non trovato')
  await act(async () => { changeInput(input, name) })
  const form = screen.querySelector('.exercise-adder')
  if (!form) throw new Error('Form nuovo esercizio non trovato')
  return buttonWithText(form, 'Aggiungi alla sessione')
}

function dataWithAddedExercise(name = 'Campus board'): ProgramBuilderData {
  return {
    ...builderData,
    exercises: [...builderData.exercises, {
      id: 'exercise-new',
      sessionId: 'session-1',
      exerciseId: null,
      order: 2,
      name,
      prescription: { sets: 3, reps: 5 },
      targetRpeMin: 6,
      targetRpeMax: 7,
      restSeconds: 120,
      instructions: '',
    }],
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  window.localStorage.clear()
  repository.loadProgramBuilder.mockResolvedValue(builderData)
  repository.updateWeekDetails.mockResolvedValue(undefined)
  repository.updateSessionDetails.mockResolvedValue(undefined)
  repository.updateExercise.mockResolvedValue(undefined)
  repository.addExercise.mockResolvedValue('exercise-new')
  repository.createWeek.mockResolvedValue('week-new')
  repository.duplicateWeek.mockResolvedValue('week-copy')
  repository.createSession.mockResolvedValue('session-new')
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('BuilderScreen autosave durante i cambi di selezione', () => {
  it('importa le cinque serie storiche solo dopo scelta esplicita e salva ripetizioni/percentuali', async () => {
    const original = { sets: 1, reps: 0 }
    repository.loadProgramBuilder.mockResolvedValue({ ...builderData, exercises: [{
      ...builderData.exercises[0], name: 'Intentional Block Lifting', prescription: original,
      instructions: 'Massimale di 27 kg\n10 rep 60%\n8 rep 65%\n6 rep 70%\n4 rep 80%\n3 rep 86%',
    }] })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'Intentional Block Lifting').click() })
    expect(repository.updateExercise).not.toHaveBeenCalled()
    await act(async () => { buttonWithText(screen, 'Importa 5 serie').click() })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    expect(repository.updateExercise).toHaveBeenCalledWith(profile, 'exercise-1', original, expect.objectContaining({
      sets: 5,
      intentionalLoad: { version: 1, mode: 'percentage', source: { type: 'manual_max', maxKg: 27 } },
      steps: expect.arrayContaining([
        expect.objectContaining({ reps: 10, percentage: 60 }),
        expect.objectContaining({ reps: 3, percentage: 86 }),
      ]),
    }))
    expect(original).toEqual({ sets: 1, reps: 0 })
  })

  it('rende accessibile la modifica del nome dalla testata della sessione e lo salva', async () => {
    const screen = await renderBuilder()

    await act(async () => { buttonWithText(screen, 'Modifica nome').click() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Titolo sessione'), 'Forza dita') })
    await act(async () => {
      vi.advanceTimersByTime(700)
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.updateSessionDetails).toHaveBeenCalledWith(profile, 'session-1', 'Forza dita', 'Obiettivo uno', 60, 1)
    expect(screen.querySelector('.coach-builder__session-head h2')?.textContent).toBe('Forza dita')
  })

  it('salva e riapre la configurazione timer usando serie, ripetizioni, durata e recupero della prescrizione', async () => {
    let persistedData: ProgramBuilderData = {
      ...builderData,
      exercises: builderData.exercises.map(item => ({ ...item, prescription: { sets: 3, reps: 5, seconds: 0, timer: { vendor_setting: 'keep' } } })),
    }
    repository.loadProgramBuilder.mockImplementation(async () => structuredClone(persistedData))
    repository.updateExercise.mockImplementation(async (_profile, exerciseId, currentPrescription, patch) => {
      persistedData = {
        ...persistedData,
        exercises: persistedData.exercises.map(item => item.id === exerciseId
          ? { ...item, prescription: mergePrescriptionForUpdate(currentPrescription, patch), restSeconds: patch.restSeconds }
          : item),
      }
    })

    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    const timerMode = screen.querySelector<HTMLSelectElement>('select[aria-label="Modalità timer"]')
    const executionMode = screen.querySelector<HTMLSelectElement>('select[aria-label="Modalità esecuzione"]')
    if (!timerMode || !executionMode) throw new Error('Configurazione timer non visualizzata')
    await act(async () => { changeSelect(timerMode, 'guided') })
    await act(async () => { changeSelect(executionMode, 'alternate_hands') })
    await act(async () => { screen.querySelector<HTMLButtonElement>('.stepper button')?.click() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Ripetizioni'), '6') })
    await act(async () => { changeInput(inputWithLabel(screen, 'Durata'), '7') })
    await act(async () => { changeInput(inputWithLabel(screen, 'Preparazione iniziale'), '5') })
    await act(async () => { changeInput(inputWithLabel(screen, 'Pausa breve cambio mano'), '3') })
    await act(async () => { changeInput(inputWithLabel(screen, 'Pausa tra ripetizioni'), '2') })
    await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), '90') })
    expect(screen.querySelector('.timer-configuration__preview')?.textContent).toContain('12 DX + 12 SX')

    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await flushPromises()
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(persistedData.exercises[0]).toMatchObject({
      prescription: {
        sets: 2, reps: 6, seconds: 7,
        timer: { mode: 'guided', execution_mode: 'single_hand', preparation_seconds: 5, hand_change_seconds: 3, interval_rest_seconds: 2, vendor_setting: 'keep' },
      },
      restSeconds: 90,
    })

    await act(async () => { root?.unmount() })
    root = null
    container?.remove()
    container = null
    const reopened = await renderBuilder()
    await act(async () => { buttonWithText(reopened, 'Hang board').click() })
    expect(reopened.querySelector<HTMLSelectElement>('select[aria-label="Modalità timer"]')?.value).toBe('guided')
    expect(reopened.querySelector<HTMLSelectElement>('select[aria-label="Modalità esecuzione"]')?.value).toBe('alternate_hands')
    expect(reopened.querySelector('.stepper b')?.textContent).toBe('2')
    expect(inputWithLabel(reopened, 'Ripetizioni').value).toBe('6')
    expect(inputWithLabel(reopened, 'Durata').value).toBe('7')
    expect(inputWithLabel(reopened, 'Recupero').value).toBe('90')
  })

  it('usa la progressione reale nella preview e applica una modifica globale alle righe strutturate', async () => {
    let persistedData: ProgramBuilderData = {
      ...builderData,
      exercises: builderData.exercises.map(item => ({
        ...item,
        prescription: {
          sets: 3, reps: 10, seconds: 7,
          steps: [{ reps: 10, seconds: 7, loadKg: 20 }, { reps: 8, seconds: 6, loadKg: 22 }, { reps: 6, seconds: 5, loadKg: 24 }],
          timer: { mode: 'guided', execution_mode: 'alternate_hands', hand_change_seconds: 2 },
        },
        restSeconds: 60,
      })),
    }
    repository.loadProgramBuilder.mockImplementation(async () => structuredClone(persistedData))
    repository.updateExercise.mockImplementation(async (_profile, exerciseId, currentPrescription, patch) => {
      persistedData = {
        ...persistedData,
        exercises: persistedData.exercises.map(item => item.id === exerciseId
          ? { ...item, prescription: mergePrescriptionForUpdate(currentPrescription, patch), restSeconds: patch.restSeconds }
          : item),
      }
    })

    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    expect(screen.querySelector('.timer-configuration__preview')?.textContent).toContain('24 per mano (24 DX + 24 SX)')
    await act(async () => { changeInput(inputWithLabel(screen, 'Ripetizioni'), '9') })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await flushPromises()

    expect(persistedData.exercises[0]?.prescription.steps).toEqual([
      { label: 'Set 1', reps: 9, seconds: 7, loadKg: 20 },
      { label: 'Set 2', reps: 9, seconds: 6, loadKg: 22 },
      { label: 'Set 3', reps: 9, seconds: 5, loadKg: 24 },
    ])
    const persistedSteps = persistedData.exercises[0]?.prescription.steps as Array<{ loadKg: number | null }> | undefined
    expect(persistedSteps?.map(step => step.loadKg)).toEqual([20, 22, 24])
  })

  it('non anteprima un recupero predefinito per una configurazione V2 esplicita senza recupero', async () => {
    repository.loadProgramBuilder.mockResolvedValue({
      ...builderData,
      exercises: builderData.exercises.map(item => ({
        ...item,
        prescription: { sets: 3, reps: 5, seconds: 7, timer: { mode: 'guided' } },
        restSeconds: null,
      })),
    })
    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    const preview = screen.querySelector('.timer-configuration__preview')?.textContent ?? ''
    expect(preview).not.toContain('recupero 90s')
    expect(preview).not.toContain('recupero 120s')
  })

  it('salva e riapre il carico scelto nell’ultima di cinque righe senza alterare le altre serie', async () => {
    const fiveRows = [32, 34, 36, 38, 40].map((loadKg, index) => ({
      label: `Set ${index + 1}`,
      loadKg,
      reps: 8 - index,
      seconds: 0,
    }))
    let persistedData: ProgramBuilderData = {
      ...builderData,
      exercises: builderData.exercises.map(item => ({
        ...item,
        prescription: { sets: 5, reps: 8, steps: fiveRows },
      })),
    }
    repository.loadProgramBuilder.mockImplementation(async () => structuredClone(persistedData))
    repository.updateExercise.mockImplementation(async (_profile, exerciseId, currentPrescription, patch) => {
      persistedData = {
        ...persistedData,
        exercises: persistedData.exercises.map(item => item.id === exerciseId
          ? { ...item, prescription: mergePrescriptionForUpdate(currentPrescription, patch) }
          : item),
      }
    })

    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    const loads = screen.querySelectorAll<HTMLInputElement>('input[aria-label="Carico kg"]')
    expect(loads).toHaveLength(5)

    await act(async () => { changeInput(loads[4], '45') })
    const finalLoadInput = screen.querySelectorAll<HTMLInputElement>('input[aria-label="Carico kg"]')[4]
    await act(async () => { changeInput(finalLoadInput, '46.5') })
    expect(repository.updateExercise).not.toHaveBeenCalled()

    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.calls[0]?.[3].steps).toEqual([
      ...fiveRows.slice(0, 4),
      { ...fiveRows[4], loadKg: 46.5 },
    ])
    expect(persistedData.exercises[0]?.prescription.steps).toEqual([
      ...fiveRows.slice(0, 4),
      { ...fiveRows[4], loadKg: 46.5 },
    ])

    await act(async () => { screen.querySelector<HTMLButtonElement>('#builder-week-week-2')?.click() })
    await act(async () => { screen.querySelector<HTMLButtonElement>('#builder-week-week-1')?.click() })
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    expect(screen.querySelectorAll<HTMLInputElement>('input[aria-label="Carico kg"]')[4]?.value).toBe('46.5')

    await act(async () => { root?.unmount() })
    root = null
    container?.remove()
    container = null
    const reopened = await renderBuilder()
    await act(async () => { buttonWithText(reopened, 'Hang board').click() })

    expect(reopened.querySelectorAll<HTMLInputElement>('input[aria-label="Carico kg"]')[4]?.value).toBe('46.5')
    expect(Array.from(reopened.querySelectorAll<HTMLInputElement>('input[aria-label="Carico kg"]')).slice(0, 4).map(input => input.value)).toEqual(['32', '34', '36', '38'])
  })

  it('salva la settimana modificata se si cambia settimana prima dei 700 ms', async () => {
    const screen = await renderBuilder()

    await act(async () => {
      screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click()
    })
    await act(async () => {
      changeInput(inputWithLabel(screen, 'Nome blocco'), 'Blocco modificato')
    })
    expect(buttonWithText(screen, 'Salvataggio…')).toBeTruthy()
    expect(repository.updateWeekDetails).not.toHaveBeenCalled()
    await act(async () => {
      screen.querySelector<HTMLButtonElement>('#builder-week-week-2')?.click()
    })
    await act(async () => {
      vi.advanceTimersByTime(700)
      await Promise.resolve()
    })

    expect(repository.updateWeekDetails).toHaveBeenCalledWith(
      profile,
      'week-1',
      'Blocco modificato',
      'Forza',
      'load',
      '',
    )
  })

  it('usa lo stesso salvataggio protetto quando si cambia blocco', async () => {
    const screen = await renderBuilder()

    await act(async () => {
      screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click()
    })
    await act(async () => {
      changeInput(inputWithLabel(screen, 'Nome blocco'), 'Blocco modificato dal selettore')
    })
    await act(async () => {
      buttonWithText(screen.querySelector('.coach-builder__blocks') ?? screen, 'Blocco due').click()
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.updateWeekDetails).toHaveBeenCalledWith(profile, 'week-1', 'Blocco modificato dal selettore', 'Forza', 'load', '')
    expect(screen.querySelector('#builder-week-week-2')?.classList.contains('active')).toBe(true)
  })

  it('salva la sessione modificata se si cambia sessione prima dei 700 ms', async () => {
    const screen = await renderBuilder()

    await act(async () => { buttonWithText(screen, 'DETTAGLI SESSIONE').click() })
    await act(async () => {
      changeInput(inputWithLabel(screen, 'Titolo sessione'), 'Sessione modificata')
    })
    expect(buttonWithText(screen, 'Salvataggio…')).toBeTruthy()
    expect(repository.updateSessionDetails).not.toHaveBeenCalled()
    await act(async () => { buttonWithText(screen, 'Sessione due').click() })
    await act(async () => {
      vi.advanceTimersByTime(700)
      await Promise.resolve()
    })

    expect(repository.updateSessionDetails).toHaveBeenCalledWith(
      profile,
      'session-1',
      'Sessione modificata',
      'Obiettivo uno',
      60,
      1,
    )
  })

  it('salva la prescrizione modificata prima di cambiare settimana', async () => {
    const screen = await renderBuilder()

    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    await act(async () => {
      changeInput(inputWithLabel(screen, 'Recupero'), '180')
    })
    await act(async () => {
      screen.querySelector<HTMLButtonElement>('#builder-week-week-2')?.click()
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise).toHaveBeenCalledWith(
      profile,
      'exercise-1',
      { sets: 3, reps: 5 },
      expect.objectContaining({ restSeconds: 180 }),
    )
    expect(screen.querySelector('#builder-week-week-2')?.classList.contains('active')).toBe(true)
  })

  it('mantiene selezione e bozza quando il salvataggio fallisce', async () => {
    repository.updateWeekDetails.mockRejectedValueOnce(new Error('Connessione non disponibile.'))
    const screen = await renderBuilder()

    await act(async () => {
      screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click()
    })
    await act(async () => {
      changeInput(inputWithLabel(screen, 'Nome blocco'), 'Bozza da conservare')
    })
    await act(async () => {
      screen.querySelector<HTMLButtonElement>('#builder-week-week-2')?.click()
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.updateWeekDetails).toHaveBeenCalledTimes(1)
    expect(screen.querySelector('#builder-week-week-1')?.classList.contains('active')).toBe(true)
    expect(screen.querySelector('#builder-week-week-2')?.classList.contains('active')).toBe(false)
    expect(inputWithLabel(screen, 'Nome blocco').value).toBe('Bozza da conservare')
    expect(screen.textContent).toContain('Connessione non disponibile.')
  })

  it('attende un salvataggio già in corso prima di cambiare selezione', async () => {
    const pendingSave = deferred<void>()
    repository.updateWeekDetails.mockReturnValueOnce(pendingSave.promise)
    const screen = await renderBuilder()

    await act(async () => {
      screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click()
    })
    await act(async () => {
      changeInput(inputWithLabel(screen, 'Nome blocco'), 'Salvataggio lento')
      vi.advanceTimersByTime(700)
      await Promise.resolve()
    })
    expect(repository.updateWeekDetails).toHaveBeenCalledTimes(1)

    await act(async () => {
      changeInput(inputWithLabel(screen, 'Nome blocco'), 'Versione più recente')
    })
    await act(async () => {
      screen.querySelector<HTMLButtonElement>('#builder-week-week-2')?.click()
      await Promise.resolve()
    })
    expect(screen.querySelector('#builder-week-week-1')?.classList.contains('active')).toBe(true)

    pendingSave.resolve()
    await flushPromises()

    expect(repository.updateWeekDetails).toHaveBeenCalledTimes(2)
    expect(repository.updateWeekDetails.mock.calls[0]?.[2]).toBe('Salvataggio lento')
    expect(repository.updateWeekDetails.mock.calls[1]?.[2]).toBe('Versione più recente')
    expect(screen.querySelector('#builder-week-week-2')?.classList.contains('active')).toBe(true)
  })

  it('ignora una seconda navigazione rapida senza duplicare il salvataggio', async () => {
    const pendingSave = deferred<void>()
    repository.updateWeekDetails.mockReturnValueOnce(pendingSave.promise)
    const screen = await renderBuilder()

    await act(async () => {
      screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click()
    })
    await act(async () => {
      changeInput(inputWithLabel(screen, 'Nome blocco'), 'Una sola scrittura')
    })
    await act(async () => {
      screen.querySelector<HTMLButtonElement>('#builder-week-week-2')?.click()
      screen.querySelector<HTMLButtonElement>('#builder-week-week-3')?.click()
      await Promise.resolve()
    })

    expect(repository.updateWeekDetails).toHaveBeenCalledTimes(1)
    pendingSave.resolve()
    await flushPromises()

    expect(repository.updateWeekDetails).toHaveBeenCalledWith(profile, 'week-1', 'Una sola scrittura', 'Forza', 'load', '')
    expect(repository.updateWeekDetails).toHaveBeenCalledTimes(1)
    expect(screen.querySelector('#builder-week-week-2')?.classList.contains('active')).toBe(true)
    expect(screen.querySelector('#builder-week-week-3')?.classList.contains('active')).toBe(false)
  })
})

describe('BuilderScreen salvataggio prima delle operazioni esterne', () => {
  it('salva l’esercizio prima di tornare a Programmi', async () => {
    const screen = await renderBuilder()
    await editExerciseRest(screen, '195')

    await act(async () => {
      buttonWithText(screen, 'Programmi').click()
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledWith(
      profile,
      'exercise-1',
      { sets: 3, reps: 5 },
      expect.objectContaining({ restSeconds: 195 }),
    )
    expect(screen.querySelector('.coach-programs')).toBeTruthy()
  })

  it('salva l’esercizio prima di cambiare atleta', async () => {
    const screen = await renderBuilder()
    await editExerciseRest(screen, '210')
    const athleteSelect = screen.querySelector<HTMLSelectElement>('select[aria-label="Seleziona atleta"]')
    if (!athleteSelect) throw new Error('Selettore atleta non trovato')

    await act(async () => {
      changeSelect(athleteSelect, 'athlete-2')
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledWith(
      profile,
      'exercise-1',
      { sets: 3, reps: 5 },
      expect.objectContaining({ restSeconds: 210 }),
    )
    expect(setSelectedAthleteId).toHaveBeenCalledWith('athlete-2')
    expect(repository.updateExercise.mock.invocationCallOrder[0]).toBeLessThan(setSelectedAthleteId.mock.invocationCallOrder[0])
    expect(screen.querySelector<HTMLSelectElement>('select[aria-label="Seleziona atleta"]')?.value).toBe('athlete-2')
  })

  it('salva la sessione prima di uscire e aprire un altro programma', async () => {
    const screen = await renderBuilder()
    await editSessionTitle(screen, 'Sessione prima del cambio programma')

    await act(async () => {
      buttonWithText(screen, 'Programmi').click()
      await Promise.resolve()
    })
    await flushPromises()
    expect(screen.querySelector('.coach-programs')).toBeTruthy()

    await act(async () => {
      buttonWithText(screen, 'Programma Due').click()
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.updateSessionDetails).toHaveBeenCalledWith(
      profile,
      'session-1',
      'Sessione prima del cambio programma',
      'Obiettivo uno',
      60,
      1,
    )
    expect(screen.querySelector('.coach-builder__hero-title h1')?.textContent).toBe('Programma Due')
  })

  it('salva l’esercizio prima di creare una settimana', async () => {
    const createdWeek: ProgramBuilderData['weeks'][number] = { id: 'week-new', programId: 'program-1', weekNumber: 4, blockName: 'Blocco quattro', phase: '', status: 'planned', loadType: 'load', notes: null }
    const screen = await renderBuilder()
    repository.loadProgramBuilder.mockResolvedValueOnce({ ...builderData, weeks: [...builderData.weeks, createdWeek] })
    await editExerciseRest(screen, '225')

    await act(async () => {
      buttonWithText(screen, 'BLOCCO').click()
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledWith(profile, 'exercise-1', { sets: 3, reps: 5 }, expect.objectContaining({ restSeconds: 225 }))
    expect(repository.createWeek).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.invocationCallOrder[0]).toBeLessThan(repository.createWeek.mock.invocationCallOrder[0])
    expect(screen.querySelector('#builder-week-week-new')?.classList.contains('active')).toBe(true)
  })

  it('salva l’esercizio prima di duplicare la settimana', async () => {
    const copiedWeek: ProgramBuilderData['weeks'][number] = { id: 'week-copy', programId: 'program-1', weekNumber: 4, blockName: 'Blocco uno copia', phase: 'Forza', status: 'planned', loadType: 'load', notes: null }
    const screen = await renderBuilder()
    repository.loadProgramBuilder.mockResolvedValueOnce({ ...builderData, weeks: [...builderData.weeks, copiedWeek] })
    await editExerciseRest(screen, '240')

    await act(async () => {
      buttonWithText(screen, 'Duplica settimana').click()
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledWith(profile, 'exercise-1', { sets: 3, reps: 5 }, expect.objectContaining({ restSeconds: 240 }))
    expect(repository.duplicateWeek).toHaveBeenCalledWith(profile, 'week-1')
    expect(repository.updateExercise.mock.invocationCallOrder[0]).toBeLessThan(repository.duplicateWeek.mock.invocationCallOrder[0])
    expect(screen.querySelector('#builder-week-week-copy')?.classList.contains('active')).toBe(true)
  })

  it('non naviga e non crea quando il salvataggio fallisce', async () => {
    repository.updateExercise.mockRejectedValueOnce(new Error('Salvataggio esercizio non disponibile.'))
    const screen = await renderBuilder()
    await editExerciseRest(screen, '255')

    await act(async () => {
      buttonWithText(screen, 'BLOCCO').click()
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.createWeek).not.toHaveBeenCalled()
    expect(screen.querySelector('.coach-builder__hero-title h1')?.textContent).toBe('Programma')
    expect(inputWithLabel(screen, 'Recupero').value).toBe('255')
    expect(screen.textContent).toContain('Salvataggio esercizio non disponibile.')
  })

  it('attende un salvataggio lento prima di uscire dal builder', async () => {
    const pendingSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(pendingSave.promise)
    const screen = await renderBuilder()
    await editExerciseRest(screen, '270')

    await act(async () => {
      buttonWithText(screen, 'Programmi').click()
      await Promise.resolve()
    })
    expect(screen.querySelector('.coach-builder')).toBeTruthy()
    expect(screen.querySelector('.coach-programs')).toBeFalsy()

    pendingSave.resolve()
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledWith(profile, 'exercise-1', { sets: 3, reps: 5 }, expect.objectContaining({ restSeconds: 270 }))
    expect(screen.querySelector('.coach-programs')).toBeTruthy()
  })

  it('ignora due richieste rapide di creazione senza duplicare l’operazione', async () => {
    const pendingCreation = deferred<string>()
    repository.createWeek.mockReturnValueOnce(pendingCreation.promise)
    const createdWeek: ProgramBuilderData['weeks'][number] = { id: 'week-new', programId: 'program-1', weekNumber: 4, blockName: 'Blocco quattro', phase: '', status: 'planned', loadType: 'load', notes: null }
    const screen = await renderBuilder()
    repository.loadProgramBuilder.mockResolvedValueOnce({ ...builderData, weeks: [...builderData.weeks, createdWeek] })

    await act(async () => {
      const addButton = buttonWithText(screen, 'BLOCCO')
      addButton.click()
      addButton.click()
      await Promise.resolve()
    })
    expect(repository.createWeek).toHaveBeenCalledTimes(1)

    pendingCreation.resolve('week-new')
    await flushPromises()

    expect(repository.createWeek).toHaveBeenCalledTimes(1)
    expect(screen.querySelector('#builder-week-week-new')?.classList.contains('active')).toBe(true)
  })

  it('salva la sessione prima di crearne una nuova', async () => {
    const createdSession: ProgramBuilderData['sessions'][number] = { id: 'session-new', weekId: 'week-1', order: 3, title: 'Sessione 3', objective: '', durationMinutes: 0, scheduledDay: 1 }
    const screen = await renderBuilder()
    repository.loadProgramBuilder.mockResolvedValueOnce({ ...builderData, sessions: [...builderData.sessions, createdSession] })
    await editSessionTitle(screen, 'Sessione aggiornata prima della creazione')

    await act(async () => {
      buttonWithText(screen, 'AGGIUNGI SESSIONE').click()
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.updateSessionDetails).toHaveBeenCalledWith(profile, 'session-1', 'Sessione aggiornata prima della creazione', 'Obiettivo uno', 60, 1)
    expect(repository.createSession).toHaveBeenCalledTimes(1)
    expect(repository.updateSessionDetails.mock.invocationCallOrder[0]).toBeLessThan(repository.createSession.mock.invocationCallOrder[0])
    expect(buttonWithText(screen, 'Sessione 3').classList.contains('active')).toBe(true)
  })

  it('non ripete la creazione se il refresh fallisce dopo la conferma', async () => {
    const screen = await renderBuilder()
    repository.loadProgramBuilder.mockRejectedValueOnce(new Error('Refresh temporaneamente non disponibile.'))

    await act(async () => {
      buttonWithText(screen, 'BLOCCO').click()
      await Promise.resolve()
    })
    await flushPromises()
    await act(async () => {
      vi.advanceTimersByTime(2_000)
      await Promise.resolve()
    })

    expect(repository.createWeek).toHaveBeenCalledTimes(1)
    expect(screen.querySelector('#builder-week-week-1')?.classList.contains('active')).toBe(true)
    expect(screen.textContent).toContain("L'operazione è già stata confermata")
    expect(screen.textContent).toContain('Refresh temporaneamente non disponibile.')
  })
})

describe('BuilderScreen salvataggio durante aggiunte e transizioni asincrone', () => {
  it('salva la prescrizione prima di aggiungere un esercizio entro i 700 ms', async () => {
    const screen = await renderBuilder()
    repository.loadProgramBuilder.mockResolvedValueOnce(dataWithAddedExercise())
    await editExerciseRest(screen, '285')
    const submit = await prepareExerciseAddition(screen)

    await act(async () => {
      submit.click()
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledWith(profile, 'exercise-1', { sets: 3, reps: 5 }, expect.objectContaining({ restSeconds: 285 }))
    expect(repository.addExercise).toHaveBeenCalledWith(profile, 'session-1', [1], 'Campus board', undefined)
    expect(repository.updateExercise.mock.invocationCallOrder[0]).toBeLessThan(repository.addExercise.mock.invocationCallOrder[0])
  })

  it('non aggiunge l’esercizio finché il salvataggio precedente non è confermato', async () => {
    const pendingSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(pendingSave.promise)
    const screen = await renderBuilder()
    repository.loadProgramBuilder.mockResolvedValueOnce(dataWithAddedExercise())
    await editExerciseRest(screen, '300')
    const submit = await prepareExerciseAddition(screen)

    await act(async () => {
      submit.click()
      await Promise.resolve()
    })

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.addExercise).not.toHaveBeenCalled()

    pendingSave.resolve()
    await flushPromises()

    expect(repository.addExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.invocationCallOrder[0]).toBeLessThan(repository.addExercise.mock.invocationCallOrder[0])
  })

  it('mantiene l’editor e non aggiunge l’esercizio se il salvataggio fallisce', async () => {
    repository.updateExercise.mockRejectedValueOnce(new Error('Prescrizione non salvata.'))
    const screen = await renderBuilder()
    await editExerciseRest(screen, '315')
    const submit = await prepareExerciseAddition(screen)

    await act(async () => {
      submit.click()
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.addExercise).not.toHaveBeenCalled()
    expect(inputWithLabel(screen, 'Recupero').value).toBe('315')
    expect(screen.textContent).toContain('Prescrizione non salvata.')
  })

  it('salva una modifica inserita mentre la creazione della settimana è ancora in corso', async () => {
    const pendingCreation = deferred<string>()
    const pendingLateSave = deferred<void>()
    repository.createWeek.mockReturnValueOnce(pendingCreation.promise)
    repository.updateExercise.mockReturnValueOnce(pendingLateSave.promise)
    const createdWeek: ProgramBuilderData['weeks'][number] = { id: 'week-new', programId: 'program-1', weekNumber: 4, blockName: 'Blocco quattro', phase: '', status: 'planned', loadType: 'load', notes: null }
    const screen = await renderBuilder()
    repository.loadProgramBuilder.mockResolvedValueOnce({ ...builderData, weeks: [...builderData.weeks, createdWeek] })

    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    await act(async () => {
      buttonWithText(screen, 'BLOCCO').click()
      await Promise.resolve()
    })
    expect(repository.createWeek).toHaveBeenCalledTimes(1)

    await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), '330') })
    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(screen.querySelector('#builder-week-week-1')?.classList.contains('active')).toBe(true)

    pendingCreation.resolve('week-new')
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledWith(profile, 'exercise-1', { sets: 3, reps: 5 }, expect.objectContaining({ restSeconds: 330 }))
    expect(screen.querySelector('#builder-week-week-1')?.classList.contains('active')).toBe(true)
    expect(screen.querySelector('#builder-week-week-new')?.classList.contains('active')).toBe(false)

    pendingLateSave.resolve()
    await flushPromises()

    expect(screen.querySelector('#builder-week-week-new')?.classList.contains('active')).toBe(true)
  })

  it('ignora due invii rapidi dello stesso nuovo esercizio', async () => {
    const pendingAddition = deferred<string>()
    repository.addExercise.mockReturnValue(pendingAddition.promise)
    const screen = await renderBuilder()
    repository.loadProgramBuilder.mockResolvedValueOnce(dataWithAddedExercise())
    const submit = await prepareExerciseAddition(screen)

    await act(async () => {
      submit.click()
      submit.click()
      await Promise.resolve()
    })

    expect(repository.addExercise).toHaveBeenCalledTimes(1)
    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(1)
    expect(Array.from(screen.querySelectorAll('button')).some(button => button.textContent?.includes('Campus board'))).toBe(false)

    pendingAddition.resolve('exercise-new')
    await flushPromises()

    expect(repository.addExercise).toHaveBeenCalledTimes(1)
    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(2)
    expect(buttonWithText(screen, 'Campus board')).toBeTruthy()
  })
})

type StoredBuilderDraftForTest = {
  version: number
  userId: string
  programId: string
  entityType: string
  entityId: string
  revision: number
  generationId?: string
  updatedAt: string
  remoteBase: { fingerprint: string; fields: Record<string, unknown> }
  changes: Record<string, unknown>
}

function localDraftKey(entityType: 'week' | 'session' | 'exercise', entityId: string, userId = profile.userId, currentProgramId = 'program-1') {
  return `cc-v2:builder-pending:v1:${encodeURIComponent(userId)}:${encodeURIComponent(currentProgramId)}:${entityType}:${encodeURIComponent(entityId)}`
}

function readLocalDraft(entityType: 'week' | 'session' | 'exercise', entityId: string) {
  const raw = window.localStorage.getItem(localDraftKey(entityType, entityId))
  return raw ? JSON.parse(raw) as StoredBuilderDraftForTest : null
}

describe('BuilderScreen cattura localmente le modifiche pendenti', () => {
  it('registra una modifica del carico prima del debounce remoto di 700 ms', async () => {
    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'Hang board').click() })

    await act(async () => { changeInput(inputWithLabel(screen, 'Carico'), '42.5') })

    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({
      version: 1,
      userId: profile.userId,
      programId: 'program-1',
      entityType: 'exercise',
      entityId: 'exercise-1',
      revision: 1,
      remoteBase: { fields: { loadKg: 0 } },
      changes: { loadKg: 42.5 },
    })
  })

  it('conserva una prescrizione strutturata se il componente viene smontato immediatamente', async () => {
    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    await act(async () => { buttonWithText(screen, 'Riga').click() })
    const structuredLoad = screen.querySelector<HTMLInputElement>('input[aria-label="Carico kg"]')
    if (!structuredLoad) throw new Error('Carico strutturato non trovato')
    await act(async () => { changeInput(structuredLoad, '31.5') })

    await act(async () => { root?.unmount() })
    root = null

    const draft = readLocalDraft('exercise', 'exercise-1')
    expect(draft?.changes.steps).toEqual([{ label: 'Set 1', reps: 5, seconds: 0, loadKg: 31.5 }])
    expect(draft?.remoteBase.fields.steps).toEqual([])
  })

  it('registra le note della settimana prima di un’interruzione immediata', async () => {
    const screen = await renderBuilder()
    await act(async () => { screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click() })

    await act(async () => { changeInput(inputWithLabel(screen, 'Note / obiettivi'), 'Ridurre volume e curare la tecnica') })

    expect(repository.updateWeekDetails).not.toHaveBeenCalled()
    expect(readLocalDraft('week', 'week-1')).toMatchObject({
      remoteBase: { fields: { notes: '' } },
      changes: { notes: 'Ridurre volume e curare la tecnica' },
    })
  })

  it('registra i dettagli della seduta prima di un’interruzione immediata', async () => {
    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'DETTAGLI SESSIONE').click() })

    await act(async () => { changeInput(inputWithLabel(screen, 'Obiettivo'), 'Controllo scapolare') })

    expect(repository.updateSessionDetails).not.toHaveBeenCalled()
    expect(readLocalDraft('session', 'session-1')).toMatchObject({
      remoteBase: { fields: { objective: 'Obiettivo uno' } },
      changes: { objective: 'Controllo scapolare' },
    })
  })

  it('mantiene la bozza se il salvataggio remoto è iniziato ma non è confermato', async () => {
    const pendingSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(pendingSave.promise)
    const screen = await renderBuilder()
    await editExerciseRest(screen, '345')

    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    await act(async () => { root?.unmount() })
    root = null

    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({
      changes: { restSeconds: 345 },
    })
  })

  it('mostra un avviso esplicito quando lo storage locale non può essere scritto', async () => {
    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage)
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key.startsWith('cc-v2:builder-pending:')) throw new DOMException('Quota superata', 'QuotaExceededError')
      return originalSetItem(key, value)
    })

    try {
      await act(async () => { changeInput(inputWithLabel(screen, 'Carico'), '48') })

      expect(screen.querySelector('[role="alert"]')?.textContent).toContain('non è protetta sul dispositivo')
      expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
    } finally {
      setItem.mockRestore()
    }
  })

  it('mantiene e recupera il dato locale attraverso smontaggio e rimontaggio', async () => {
    const screen = await renderBuilder()
    await editExerciseRest(screen, '360')
    const storedBeforeUnmount = window.localStorage.getItem(localDraftKey('exercise', 'exercise-1'))

    await act(async () => { root?.unmount() })
    root = null
    container?.remove()
    container = null
    const remountedScreen = await renderBuilder()

    expect(storedBeforeUnmount).not.toBeNull()
    expect(window.localStorage.getItem(localDraftKey('exercise', 'exercise-1'))).toBeNull()
    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(2)
    expect(repository.updateExercise.mock.calls.at(-1)?.[3]).toMatchObject({ restSeconds: 360 })
    await act(async () => { buttonWithText(remountedScreen, 'Hang board').click() })
    expect(inputWithLabel(remountedScreen, 'Recupero').value).toBe('360')
  })

  it('non elimina la bozza quando la scrittura remota fallisce', async () => {
    repository.updateExercise.mockRejectedValueOnce(new Error('Scrittura remota non disponibile.'))
    const screen = await renderBuilder()
    await editExerciseRest(screen, '375')

    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({ changes: { restSeconds: 375 } })
    expect(screen.textContent).toContain('Scrittura remota non disponibile.')
  })

  it('la conferma remota di una revisione non elimina una modifica locale successiva', async () => {
    const firstSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(firstSave.promise)
    const screen = await renderBuilder()
    await editExerciseRest(screen, '390')
    expect(readLocalDraft('exercise', 'exercise-1')?.revision).toBe(1)

    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), '405') })
    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({ revision: 2, changes: { restSeconds: 405 } })

    await act(async () => { firstSave.resolve(); await firstSave.promise })
    await flushPromises()

    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({ revision: 2, changes: { restSeconds: 405 } })
  })

  it('rimuove la stessa revisione locale soltanto dopo la conferma remota', async () => {
    const pendingSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(pendingSave.promise)
    const screen = await renderBuilder()
    await editExerciseRest(screen, '420')

    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({ revision: 1, changes: { restSeconds: 420 } })

    await act(async () => { pendingSave.resolve(); await pendingSave.promise })
    await flushPromises()

    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
  })
})

describe('BuilderScreen riconcilia le bozze locali persistenti', () => {
  function storeDraft(
    entityType: 'week' | 'session' | 'exercise',
    entityId: string,
    remoteBaseFields: Record<string, unknown>,
    changes: Record<string, unknown>,
    userId = profile.userId,
  ) {
    window.localStorage.setItem(localDraftKey(entityType, entityId, userId), JSON.stringify({
      version: 1,
      userId,
      programId: 'program-1',
      entityType,
      entityId,
      revision: 1,
      updatedAt: '2026-10-11T08:30:00.000Z',
      remoteBase: { fingerprint: 'fnv1a32:test', fields: remoteBaseFields },
      changes,
    }))
  }

  it('recupera dopo il rimontaggio una bozza verificata e la rimuove solo dopo la conferma', async () => {
    const firstScreen = await renderBuilder()
    await editExerciseRest(firstScreen, '360')
    await act(async () => { root?.unmount() })
    root = null
    container?.remove()
    container = null

    const remountedScreen = await renderBuilder()

    expect(remountedScreen.textContent).not.toContain('bozza locale rilevata')
    await act(async () => { buttonWithText(remountedScreen, 'Hang board').click() })
    expect(inputWithLabel(remountedScreen, 'Recupero').value).toBe('360')
    expect(repository.updateExercise.mock.calls.at(-1)?.[3]).toMatchObject({ restSeconds: 360 })
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
    expect(repository.updateWeekDetails).not.toHaveBeenCalled()
    expect(repository.updateSessionDetails).not.toHaveBeenCalled()
  })

  it('recupera le bozze sicure e riepiloga soltanto il conflitto residuo', async () => {
    storeDraft('week', 'week-1', { notes: '' }, { notes: 'Nota locale' })
    storeDraft('session', 'session-1', { objective: 'Obiettivo precedente' }, { objective: 'Obiettivo uno' })
    storeDraft('exercise', 'exercise-1', { restSeconds: 90 }, { restSeconds: 180 })

    const screen = await renderBuilder()

    expect(screen.textContent).toContain('1 bozza locale rilevata')
    expect(screen.textContent).toContain('Programma · Esercizio')
    expect(screen.textContent).toContain('11/10/2026')
    expect(screen.textContent).toContain('Conflitto')
    expect(repository.updateWeekDetails).toHaveBeenCalledWith(profile, 'week-1', 'Blocco uno', 'Forza', 'load', 'Nota locale')
    expect(repository.updateSessionDetails).not.toHaveBeenCalled()
    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(readLocalDraft('week', 'week-1')).toBeNull()
    expect(readLocalDraft('session', 'session-1')).toBeNull()
    expect(readLocalDraft('exercise', 'exercise-1')).not.toBeNull()
  })

  it('non mostra bozze appartenenti a un altro utente', async () => {
    storeDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 }, 'coach-2')

    const screen = await renderBuilder()

    expect(screen.textContent).not.toContain('bozza locale')
    expect(screen.textContent).not.toContain('Recuperabile')
  })

  it('non dichiara assenza di bozze quando il caricamento remoto fallisce', async () => {
    storeDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 })
    repository.loadProgramBuilder.mockRejectedValueOnce(new Error('Caricamento remoto non disponibile.'))

    const screen = await renderBuilder()

    expect(screen.textContent).toContain('Verifica bozze non riuscita')
    expect(screen.textContent).toContain('1 bozza locale non verificata')
    expect(screen.textContent).toContain('Caricamento remoto non disponibile.')
    expect(repository.updateExercise).not.toHaveBeenCalled()
  })

  it('recupera dopo il rimontaggio e consente poi di modificare un altro campo', async () => {
    const firstScreen = await renderBuilder()
    await editExerciseRest(firstScreen, '180')
    expect(window.localStorage.getItem(localDraftKey('exercise', 'exercise-1'))).not.toBeNull()
    await act(async () => { root?.unmount() })
    root = null
    container?.remove()
    container = null

    const remountedScreen = await renderBuilder()
    await act(async () => { buttonWithText(remountedScreen, 'Hang board').click() })
    const instructions = remountedScreen.querySelector<HTMLTextAreaElement>('.inspector-notes textarea')
    if (!instructions) throw new Error('Indicazioni esercizio non trovate')
    await act(async () => { changeTextarea(instructions, 'Nuova indicazione') })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })

    await flushPromises()
    expect(window.localStorage.getItem(localDraftKey('exercise', 'exercise-1'))).toBeNull()
    expect(instructions.value).toBe('Nuova indicazione')
    expect(remountedScreen.textContent).not.toContain('Recupera prima la bozza locale')
    expect(repository.updateExercise).toHaveBeenCalledTimes(2)
    expect(repository.updateExercise.mock.calls[0]?.[3]).toMatchObject({ restSeconds: 180, instructions: 'Tecnica pulita' })
    expect(repository.updateExercise.mock.calls[1]?.[3]).toMatchObject({ restSeconds: 180, instructions: 'Nuova indicazione' })
  })

  it('continua a revisionare normalmente una bozza creata nella sessione corrente', async () => {
    const screen = await renderBuilder()
    await editExerciseRest(screen, '150')
    await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), '165') })

    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({ revision: 2, changes: { restSeconds: 165 } })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.calls[0]?.[3]).toMatchObject({ restSeconds: 165 })
  })

  it('non modifica il remoto quando una bozza preesistente è già in conflitto', async () => {
    storeDraft('exercise', 'exercise-1', { restSeconds: 90 }, { restSeconds: 180 })
    const storedBefore = window.localStorage.getItem(localDraftKey('exercise', 'exercise-1'))
    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    const instructions = screen.querySelector<HTMLTextAreaElement>('.inspector-notes textarea')
    if (!instructions) throw new Error('Indicazioni esercizio non trovate')

    await act(async () => { changeTextarea(instructions, 'Non deve essere salvata') })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })

    expect(screen.textContent).toContain('Conflitto')
    expect(screen.textContent).toContain('Recupera prima la bozza locale')
    expect(window.localStorage.getItem(localDraftKey('exercise', 'exercise-1'))).toBe(storedBefore)
    expect(repository.updateExercise).not.toHaveBeenCalled()
  })

  it('non blocca la modifica di un’altra entità priva di bozze preesistenti', async () => {
    storeDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 })
    const exerciseDraftBefore = window.localStorage.getItem(localDraftKey('exercise', 'exercise-1'))
    const screen = await renderBuilder()

    await act(async () => { buttonWithText(screen, 'DETTAGLI SESSIONE').click() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Obiettivo'), 'Modifica consentita') })

    expect(readLocalDraft('session', 'session-1')?.changes).toEqual({ objective: 'Modifica consentita' })
    expect(exerciseDraftBefore).not.toBeNull()
    expect(window.localStorage.getItem(localDraftKey('exercise', 'exercise-1'))).toBeNull()
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await flushPromises()

    expect(repository.updateSessionDetails).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.calls[0]?.[3]).toMatchObject({ restSeconds: 180 })
  })
})

describe('BuilderScreen preserva l’ultima intenzione durante salvataggi concorrenti', () => {
  it('mantiene e sincronizza 120 → 150 → 120 senza eliminare prematuramente la bozza', async () => {
    const firstSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(firstSave.promise)
    const screen = await renderBuilder()
    await editExerciseRest(screen, '150')

    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), '120') })

    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({ changes: { restSeconds: 120 } })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)

    await act(async () => { firstSave.resolve(); await firstSave.promise })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(2)
    expect(repository.updateExercise.mock.calls[1]?.[3]).toMatchObject({ restSeconds: 120 })
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
  })

  it('conserva dopo smontaggio l’intenzione finale mentre la scrittura precedente si conclude', async () => {
    const firstSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(firstSave.promise)
    const screen = await renderBuilder()
    await editExerciseRest(screen, '150')
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), '120') })

    await act(async () => { root?.unmount() })
    root = null
    container?.remove()
    container = null
    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({ changes: { restSeconds: 120 } })

    await act(async () => { firstSave.resolve(); await firstSave.promise })
    await flushPromises()
    repository.loadProgramBuilder.mockResolvedValue({
      ...builderData,
      exercises: [{ ...builderData.exercises[0], restSeconds: 150 }],
    })
    const remountedScreen = await renderBuilder()
    await act(async () => { buttonWithText(remountedScreen, 'Hang board').click() })

    expect(inputWithLabel(remountedScreen, 'Recupero').value).toBe('150')
    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({ changes: { restSeconds: 120 } })
    expect(remountedScreen.textContent).toContain('Conflitto')
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
  })

  it('conserva il ritorno alla base dopo una scrittura realmente rifiutata e verifica il remoto', async () => {
    const firstSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(firstSave.promise)
    repository.loadProgramBuilder.mockResolvedValue(builderData)
    const screen = await renderBuilder()
    await editExerciseRest(screen, '150')
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), '120') })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })

    await act(async () => {
      firstSave.reject(new Error('Scrittura 150 rifiutata.'))
      await firstSave.promise.catch(() => undefined)
    })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.calls[0]?.[3]).toMatchObject({ restSeconds: 150 })
    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(2)
    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({ changes: { restSeconds: 120 } })
    expect(screen.querySelector('.builder-exercise-save [role="status"]')?.textContent).toBe('Salvataggio non riuscito')
  })

  it('una conferma remota tardiva non elimina una nuova generazione con revisione 1', async () => {
    const firstSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(firstSave.promise)
    const screen = await renderBuilder()
    await editExerciseRest(screen, '150')
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    const firstDraft = readLocalDraft('exercise', 'exercise-1')
    if (!firstDraft) throw new Error('Prima bozza non creata')
    const target = { userId: profile.userId, programId: 'program-1', entityType: 'exercise' as const, entityId: 'exercise-1' }

    clearBuilderLocalDraftRevision(target, firstDraft.revision, undefined, firstDraft.generationId)
    const second = writeBuilderLocalDraft(
      target,
      { restSeconds: 120, instructions: 'Tecnica pulita' },
      { restSeconds: 120, instructions: 'Seconda generazione' },
    )
    if (!second.ok || !second.draft) throw new Error('Seconda bozza non creata')

    await act(async () => { firstSave.resolve(); await firstSave.promise })
    await flushPromises()

    expect(readLocalDraft('exercise', 'exercise-1')).toEqual(second.draft)
  })

  it('mantiene l’ultima intenzione sullo stesso campo e su un campo indipendente fino alla conferma finale', async () => {
    const firstSave = deferred<void>()
    const finalSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(firstSave.promise).mockReturnValueOnce(finalSave.promise)
    const screen = await renderBuilder()
    await editExerciseRest(screen, '150')
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), '120') })
    const instructions = screen.querySelector<HTMLTextAreaElement>('.inspector-notes textarea')
    if (!instructions) throw new Error('Indicazioni esercizio non trovate')
    await act(async () => { changeTextarea(instructions, 'Ultima intenzione') })

    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({
      changes: { restSeconds: 120, instructions: 'Ultima intenzione' },
    })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)

    await act(async () => { firstSave.resolve(); await firstSave.promise })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(2)
    expect(repository.updateExercise.mock.calls[1]?.[3]).toMatchObject({ restSeconds: 120, instructions: 'Ultima intenzione' })
    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({
      changes: { restSeconds: 120, instructions: 'Ultima intenzione' },
    })

    await act(async () => { finalSave.resolve(); await finalSave.promise })
    await flushPromises()
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
  })
})

describe('BuilderScreen gestisce gli esiti remoti incerti', () => {
  it('preserva la bozza e annulla la guard se il server applica la scrittura ma la Promise fallisce', async () => {
    let remoteData: ProgramBuilderData = builderData
    repository.loadProgramBuilder.mockImplementation(async () => remoteData)
    const firstSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(firstSave.promise)
    let navigationGuard: BuilderNavigationGuard | null = null
    const screen = await renderBuilder(guard => { navigationGuard = guard })
    await editExerciseRest(screen, '150')
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), '120') })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    if (!navigationGuard) throw new Error('Guard di navigazione non registrata')
    let navigationAttempt!: Promise<boolean>
    await act(async () => {
      navigationAttempt = navigationGuard?.() ?? Promise.resolve(false)
      await Promise.resolve()
    })

    remoteData = { ...builderData, exercises: [{ ...builderData.exercises[0], restSeconds: 150 }] }
    let navigationAllowed = true
    await act(async () => {
      firstSave.reject(new Error('Risposta remota persa.'))
      await firstSave.promise.catch(() => undefined)
      navigationAllowed = await navigationAttempt
    })
    await flushPromises()

    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(2)
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(navigationAllowed).toBe(false)
    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({ changes: { restSeconds: 120 } })
    expect(screen.textContent).toContain('Risposta remota persa.')
    expect(screen.textContent).toContain('Conflitto')
    expect(screen.querySelector('.builder-exercise-save [role="status"]')?.textContent).toBe('Salvataggio non riuscito')
  })

  it('preserva tutti i campi dell’ultima intenzione dopo un errore remoto incerto', async () => {
    let remoteData: ProgramBuilderData = builderData
    repository.loadProgramBuilder.mockImplementation(async () => remoteData)
    const firstSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(firstSave.promise)
    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    await act(async () => {
      changeInput(inputWithLabel(screen, 'Recupero'), '150')
      const instructions = screen.querySelector<HTMLTextAreaElement>('.inspector-notes textarea')
      if (!instructions) throw new Error('Indicazioni esercizio non trovate')
      changeTextarea(instructions, 'Valore inviato')
    })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await act(async () => {
      changeInput(inputWithLabel(screen, 'Recupero'), '120')
      const instructions = screen.querySelector<HTMLTextAreaElement>('.inspector-notes textarea')
      if (!instructions) throw new Error('Indicazioni esercizio non trovate')
      changeTextarea(instructions, 'Ultima intenzione locale')
    })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })

    remoteData = {
      ...builderData,
      exercises: [{ ...builderData.exercises[0], restSeconds: 150, instructions: 'Valore inviato' }],
    }
    await act(async () => {
      firstSave.reject(new Error('Esito esercizio incerto.'))
      await firstSave.promise.catch(() => undefined)
    })
    await flushPromises()

    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(2)
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({
      changes: { restSeconds: 120, instructions: 'Ultima intenzione locale' },
    })
    expect(screen.textContent).toContain('Conflitto')
  })

  it('mantiene la bozza attraverso un refresh successivo a un esito incerto', async () => {
    let remoteData: ProgramBuilderData = builderData
    repository.loadProgramBuilder.mockImplementation(async () => remoteData)
    const firstSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(firstSave.promise)
    const screen = await renderBuilder()
    await editExerciseRest(screen, '150')
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), '120') })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    remoteData = { ...builderData, exercises: [{ ...builderData.exercises[0], restSeconds: 150 }] }
    await act(async () => {
      firstSave.reject(new Error('Conferma non ricevuta.'))
      await firstSave.promise.catch(() => undefined)
    })
    await flushPromises()

    await act(async () => { root?.unmount() })
    root = null
    container?.remove()
    container = null
    const remountedScreen = await renderBuilder()
    await act(async () => { buttonWithText(remountedScreen, 'Hang board').click() })

    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(3)
    expect(inputWithLabel(remountedScreen, 'Recupero').value).toBe('150')
    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({ changes: { restSeconds: 120 } })
    expect(remountedScreen.textContent).toContain('Conflitto')
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
  })

  it('consente un salvataggio esplicito dell’ultima intenzione dopo l’errore', async () => {
    let remoteData: ProgramBuilderData = builderData
    repository.loadProgramBuilder.mockImplementation(async () => remoteData)
    const firstSave = deferred<void>()
    repository.updateExercise
      .mockReturnValueOnce(firstSave.promise)
      .mockImplementationOnce(async (_profile, _exerciseId, _prescription, nextPatch) => {
        remoteData = { ...remoteData, exercises: [{ ...remoteData.exercises[0], restSeconds: nextPatch.restSeconds }] }
      })
    const screen = await renderBuilder()
    await editExerciseRest(screen, '150')
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), '120') })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    remoteData = { ...builderData, exercises: [{ ...builderData.exercises[0], restSeconds: 150 }] }
    await act(async () => {
      firstSave.reject(new Error('Esito non confermato.'))
      await firstSave.promise.catch(() => undefined)
    })
    await flushPromises()

    const saveButton = buttonWithText(screen.querySelector('.builder-exercise-save') ?? screen, 'Salva modifiche')
    expect(saveButton.disabled).toBe(false)
    await act(async () => { saveButton.click() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(2)
    expect(repository.updateExercise.mock.calls[1]?.[3]).toMatchObject({ restSeconds: 120 })
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
    expect(screen.querySelector('.builder-exercise-save [role="status"]')?.textContent).toBe('Salvato')
  })

  it('mantiene la bozza della settimana quando l’esito della scrittura è incerto', async () => {
    let remoteData: ProgramBuilderData = builderData
    repository.loadProgramBuilder.mockImplementation(async () => remoteData)
    const firstSave = deferred<void>()
    repository.updateWeekDetails.mockReturnValueOnce(firstSave.promise)
    const screen = await renderBuilder()
    await act(async () => { screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Nome blocco'), 'Blocco inviato') })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Nome blocco'), 'Blocco uno') })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    remoteData = { ...builderData, weeks: builderData.weeks.map(week => week.id === 'week-1' ? { ...week, blockName: 'Blocco inviato' } : week) }
    await act(async () => {
      firstSave.reject(new Error('Esito settimana incerto.'))
      await firstSave.promise.catch(() => undefined)
    })
    await flushPromises()

    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(2)
    expect(repository.updateWeekDetails).toHaveBeenCalledTimes(1)
    expect(readLocalDraft('week', 'week-1')).toMatchObject({ changes: { blockName: 'Blocco uno' } })
    expect(screen.textContent).toContain('Esito settimana incerto.')
    expect(screen.textContent).toContain('Conflitto')
  })

  it('mantiene la bozza della seduta quando l’esito della scrittura è incerto', async () => {
    let remoteData: ProgramBuilderData = builderData
    repository.loadProgramBuilder.mockImplementation(async () => remoteData)
    const firstSave = deferred<void>()
    repository.updateSessionDetails.mockReturnValueOnce(firstSave.promise)
    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'DETTAGLI SESSIONE').click() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Obiettivo'), 'Obiettivo inviato') })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Obiettivo'), 'Obiettivo uno') })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    remoteData = { ...builderData, sessions: builderData.sessions.map(session => session.id === 'session-1' ? { ...session, objective: 'Obiettivo inviato' } : session) }
    await act(async () => {
      firstSave.reject(new Error('Esito seduta incerto.'))
      await firstSave.promise.catch(() => undefined)
    })
    await flushPromises()

    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(2)
    expect(repository.updateSessionDetails).toHaveBeenCalledTimes(1)
    expect(readLocalDraft('session', 'session-1')).toMatchObject({ changes: { objective: 'Obiettivo uno' } })
    expect(screen.textContent).toContain('Esito seduta incerto.')
    expect(screen.textContent).toContain('Conflitto')
  })
})

describe('BuilderScreen recupera automaticamente le bozze locali verificate', () => {
  function storeRecoveryDraft(
    entityType: 'week' | 'session' | 'exercise',
    entityId: string,
    remoteBaseFields: Record<string, unknown>,
    changes: Record<string, unknown>,
    overrides: Partial<StoredBuilderDraftForTest> = {},
  ) {
    window.localStorage.setItem(localDraftKey(entityType, entityId), JSON.stringify({
      version: 1,
      userId: profile.userId,
      programId: 'program-1',
      entityType,
      entityId,
      generationId: `generation-${entityType}-${entityId}`,
      revision: 1,
      updatedAt: '2026-10-11T08:30:00.000Z',
      remoteBase: { fingerprint: 'fnv1a32:test', fields: remoteBaseFields },
      changes,
      ...overrides,
    }))
  }

  it('recupera e sincronizza una modifica non confermata dopo il refresh del builder', async () => {
    const firstScreen = await renderBuilder()
    await editExerciseRest(firstScreen, '360')
    await act(async () => { root?.unmount() })
    root = null
    container?.remove()
    container = null

    const remountedScreen = await renderBuilder()
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.calls[0]?.[3]).toMatchObject({ restSeconds: 360 })
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
    await act(async () => { buttonWithText(remountedScreen, 'Hang board').click() })
    expect(inputWithLabel(remountedScreen, 'Recupero').value).toBe('360')
  })

  it('recupera automaticamente una bozza persistente alla riapertura', async () => {
    storeRecoveryDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 210 })

    const screen = await renderBuilder()
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.calls[0]?.[3]).toMatchObject({ restSeconds: 210 })
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    expect(inputWithLabel(screen, 'Recupero').value).toBe('210')
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
  })

  it('pulisce una bozza già sincronizzata senza duplicare la scrittura', async () => {
    storeRecoveryDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 })
    repository.loadProgramBuilder.mockResolvedValue({
      ...builderData,
      exercises: [{ ...builderData.exercises[0], restSeconds: 180 }],
    })

    const screen = await renderBuilder()
    await flushPromises()

    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    expect(inputWithLabel(screen, 'Recupero').value).toBe('180')
  })

  it('recupera in sicurezza quando il remoto coincide ancora con la base', async () => {
    storeRecoveryDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 195 })

    await renderBuilder()
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.calls[0]?.[3]).toMatchObject({ restSeconds: 195 })
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
  })

  it('recupera più campi della stessa entità in un’unica scrittura', async () => {
    storeRecoveryDraft(
      'exercise',
      'exercise-1',
      { restSeconds: 120, instructions: 'Tecnica pulita' },
      { restSeconds: 225, instructions: 'Presa aperta' },
    )

    await renderBuilder()
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.calls[0]?.[3]).toMatchObject({ restSeconds: 225, instructions: 'Presa aperta' })
  })

  it('recupera bozze indipendenti di settimana, seduta ed esercizio', async () => {
    storeRecoveryDraft('week', 'week-1', { notes: '' }, { notes: 'Nota recuperata' })
    storeRecoveryDraft('session', 'session-1', { objective: 'Obiettivo uno' }, { objective: 'Obiettivo recuperato' })
    storeRecoveryDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 240 })

    await renderBuilder()
    await flushPromises()

    expect(repository.updateWeekDetails).toHaveBeenCalledWith(profile, 'week-1', 'Blocco uno', 'Forza', 'load', 'Nota recuperata')
    expect(repository.updateSessionDetails).toHaveBeenCalledWith(profile, 'session-1', 'Sessione uno', 'Obiettivo recuperato', 60, 1)
    expect(repository.updateExercise.mock.calls[0]?.[3]).toMatchObject({ restSeconds: 240 })
    expect(readLocalDraft('week', 'week-1')).toBeNull()
    expect(readLocalDraft('session', 'session-1')).toBeNull()
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
  })

  it('mantiene un aggiornamento remoto su un campo non modificato localmente', async () => {
    storeRecoveryDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 })
    repository.loadProgramBuilder.mockResolvedValue({
      ...builderData,
      exercises: [{ ...builderData.exercises[0], instructions: 'Aggiornamento online indipendente' }],
    })

    await renderBuilder()
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.calls[0]?.[3]).toMatchObject({
      restSeconds: 180,
      instructions: 'Aggiornamento online indipendente',
    })
  })

  it('sincronizza il solo risultato mancante quando alcuni campi sono già online', async () => {
    storeRecoveryDraft(
      'exercise',
      'exercise-1',
      { restSeconds: 120, instructions: 'Tecnica pulita' },
      { restSeconds: 180, instructions: 'Indicazione locale' },
    )
    repository.loadProgramBuilder.mockResolvedValue({
      ...builderData,
      exercises: [{ ...builderData.exercises[0], restSeconds: 180 }],
    })

    await renderBuilder()
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.calls[0]?.[3]).toMatchObject({
      restSeconds: 180,
      instructions: 'Indicazione locale',
    })
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
  })

  it('non recupera né salva automaticamente un conflitto sullo stesso campo', async () => {
    storeRecoveryDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 })
    repository.loadProgramBuilder.mockResolvedValue({
      ...builderData,
      exercises: [{ ...builderData.exercises[0], restSeconds: 150 }],
    })

    const screen = await renderBuilder()
    await flushPromises()

    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(readLocalDraft('exercise', 'exercise-1')).not.toBeNull()
    expect(screen.textContent).toContain('Conflitto')
    expect(screen.textContent).toContain('120')
    expect(screen.textContent).toContain('180')
    expect(screen.textContent).toContain('150')
  })

  it('conserva la bozza quando la lettura remota fallisce', async () => {
    storeRecoveryDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 })
    const stored = window.localStorage.getItem(localDraftKey('exercise', 'exercise-1'))
    repository.loadProgramBuilder.mockRejectedValueOnce(new Error('Lettura remota non disponibile.'))

    const screen = await renderBuilder()
    await flushPromises()

    expect(window.localStorage.getItem(localDraftKey('exercise', 'exercise-1'))).toBe(stored)
    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(screen.textContent).toContain('Lettura remota non disponibile.')
  })

  it('non applica una bozza se l’entità remota non è più disponibile', async () => {
    storeRecoveryDraft('exercise', 'exercise-deleted', { restSeconds: 120 }, { restSeconds: 180 })

    const screen = await renderBuilder()
    await flushPromises()

    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(readLocalDraft('exercise', 'exercise-deleted')).not.toBeNull()
    expect(screen.textContent).toContain('Entità mancante')
  })

  it('non elimina una revisione locale più recente creata durante la riconciliazione', async () => {
    const recoverySave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(recoverySave.promise)
    storeRecoveryDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 })

    const screen = await renderBuilder()
    await flushPromises()
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    const instructions = screen.querySelector<HTMLTextAreaElement>('.inspector-notes textarea')
    if (!instructions) throw new Error('Indicazioni esercizio non trovate')
    await act(async () => { changeTextarea(instructions, 'Modifica durante il recupero') })

    expect(readLocalDraft('exercise', 'exercise-1')).toMatchObject({
      revision: 2,
      changes: { restSeconds: 180, instructions: 'Modifica durante il recupero' },
    })
    await act(async () => { recoverySave.resolve(); await recoverySave.promise })
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(2)
    expect(repository.updateExercise.mock.calls[1]?.[3]).toMatchObject({
      restSeconds: 180,
      instructions: 'Modifica durante il recupero',
    })
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
  })

  it('ricontrolla un conflitto e avvia il recupero automatico se il remoto torna compatibile', async () => {
    storeRecoveryDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 })
    let remoteData: ProgramBuilderData = {
      ...builderData,
      exercises: [{ ...builderData.exercises[0], restSeconds: 150 }],
    }
    repository.loadProgramBuilder.mockImplementation(async () => remoteData)
    const screen = await renderBuilder()
    expect(screen.textContent).toContain('Conflitto')

    remoteData = builderData
    await act(async () => { buttonWithText(screen, 'Ricontrolla').click() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.calls[0]?.[3]).toMatchObject({ restSeconds: 180 })
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
  })

  it('usa esplicitamente la versione locale soltanto dopo una nuova lettura invariata', async () => {
    storeRecoveryDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 })
    const remoteConflict = {
      ...builderData,
      exercises: [{ ...builderData.exercises[0], restSeconds: 150 }],
    }
    repository.loadProgramBuilder.mockResolvedValue(remoteConflict)
    const screen = await renderBuilder()

    await act(async () => { buttonWithText(screen, 'Usa modifiche locali').click() })
    await flushPromises()

    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(2)
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise.mock.calls[0]?.[3]).toMatchObject({ restSeconds: 180 })
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
  })

  it('interrompe la scelta locale se il remoto cambia ancora prima della scrittura', async () => {
    storeRecoveryDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 })
    repository.loadProgramBuilder
      .mockResolvedValueOnce({ ...builderData, exercises: [{ ...builderData.exercises[0], restSeconds: 150 }] })
      .mockResolvedValue({ ...builderData, exercises: [{ ...builderData.exercises[0], restSeconds: 165 }] })
    const screen = await renderBuilder()

    await act(async () => { buttonWithText(screen, 'Usa modifiche locali').click() })
    await flushPromises()

    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(readLocalDraft('exercise', 'exercise-1')).not.toBeNull()
    expect(screen.textContent).toContain('è cambiata di nuovo')
    expect(screen.textContent).toContain('165')
  })

  it('elimina la bozza in conflitto soltanto dopo conferma e nuova lettura online', async () => {
    storeRecoveryDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 })
    repository.loadProgramBuilder.mockResolvedValue({
      ...builderData,
      exercises: [{ ...builderData.exercises[0], restSeconds: 150 }],
    })
    const screen = await renderBuilder()

    await act(async () => { buttonWithText(screen, 'Mantieni versione online').click() })
    expect(screen.textContent).toContain('Mantenere la versione online?')
    const dialog = screen.querySelector('.confirm-dialog')
    if (!dialog) throw new Error('Conferma versione online non trovata')
    await act(async () => { buttonWithText(dialog, 'Mantieni versione online').click() })
    await flushPromises()

    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(2)
    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
    expect(screen.textContent).not.toContain('Conflitto')
  })

  it('mantiene la guard di navigazione in attesa della riconciliazione remota', async () => {
    const recoverySave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(recoverySave.promise)
    storeRecoveryDraft('exercise', 'exercise-1', { restSeconds: 120 }, { restSeconds: 180 })
    let navigationGuard: BuilderNavigationGuard | null = null

    await renderBuilder(guard => { navigationGuard = guard })
    if (!navigationGuard) throw new Error('Guard di navigazione non registrata')
    let navigationSettled = false
    let navigationAllowed = false
    await act(async () => {
      void navigationGuard?.().then(result => {
        navigationAllowed = result
        navigationSettled = true
      })
      await Promise.resolve()
    })

    expect(navigationSettled).toBe(false)
    await act(async () => { recoverySave.resolve(); await recoverySave.promise })
    await flushPromises()

    expect(navigationSettled).toBe(true)
    expect(navigationAllowed).toBe(true)
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
  })
})

describe('BuilderScreen protegge pubblicazione ed eliminazioni', () => {
  async function confirmDeletion(screen: HTMLElement, label: string) {
    await act(async () => { buttonWithText(screen, label).click() })
    const dialog = screen.querySelector('.confirm-dialog')
    if (!dialog) throw new Error(`Conferma eliminazione non trovata: ${label}`)
    await act(async () => {
      buttonWithText(dialog, 'Elimina definitivamente').click()
      await Promise.resolve()
    })
  }

  it('pubblica soltanto dopo la conferma dell’ultima prescrizione', async () => {
    const pendingSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(pendingSave.promise)
    const screen = await renderBuilder()
    await editExerciseRest(screen, '360')

    await act(async () => {
      buttonWithText(screen, 'Pubblica programma').click()
      await Promise.resolve()
    })

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.publishProgram).not.toHaveBeenCalled()

    pendingSave.resolve()
    await flushPromises()

    expect(repository.publishProgram).toHaveBeenCalledWith(profile, 'program-1', 'athlete-1')
    expect(repository.updateExercise.mock.invocationCallOrder[0]).toBeLessThan(repository.publishProgram.mock.invocationCallOrder[0])
  })

  it('non pubblica se il salvataggio delle modifiche fallisce', async () => {
    repository.updateExercise.mockRejectedValueOnce(new Error('Ultima prescrizione non salvata.'))
    const screen = await renderBuilder()
    await editExerciseRest(screen, '375')

    await act(async () => {
      buttonWithText(screen, 'Pubblica programma').click()
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.publishProgram).not.toHaveBeenCalled()
    expect(inputWithLabel(screen, 'Recupero').value).toBe('375')
    expect(screen.textContent).toContain('Ultima prescrizione non salvata.')
  })

  it('salva le altre entità e scarta la bozza dell’esercizio solo dopo l’eliminazione confermata', async () => {
    const pendingDelete = deferred<void>()
    repository.deleteExercise.mockReturnValueOnce(pendingDelete.promise)
    const screen = await renderBuilder()

    await act(async () => { screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Note / obiettivi'), 'Nota da conservare') })
    await editSessionTitle(screen, 'Sessione da conservare')
    await act(async () => { buttonWithText(screen, 'ESERCIZI').click() })
    await editExerciseRest(screen, '390')
    const exerciseDraftBefore = window.localStorage.getItem(localDraftKey('exercise', 'exercise-1'))
    expect(exerciseDraftBefore).not.toBeNull()

    await confirmDeletion(screen, 'Elimina esercizio')

    expect(repository.updateWeekDetails).toHaveBeenCalledTimes(1)
    expect(repository.updateSessionDetails).toHaveBeenCalledTimes(1)
    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(repository.deleteExercise).toHaveBeenCalledTimes(1)
    expect(repository.updateWeekDetails.mock.invocationCallOrder[0]).toBeLessThan(repository.deleteExercise.mock.invocationCallOrder[0])
    expect(repository.updateSessionDetails.mock.invocationCallOrder[0]).toBeLessThan(repository.deleteExercise.mock.invocationCallOrder[0])
    expect(window.localStorage.getItem(localDraftKey('exercise', 'exercise-1'))).toBe(exerciseDraftBefore)

    repository.loadProgramBuilder.mockResolvedValueOnce({ ...builderData, exercises: [] })
    pendingDelete.resolve()
    await flushPromises()

    expect(repository.deleteExercise).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(localDraftKey('exercise', 'exercise-1'))).toBeNull()
    expect(screen.textContent).not.toContain('Entità mancante')
  })

  it('elimina una seduta senza perdere le modifiche della settimana e senza salvare le bozze eliminate', async () => {
    const screen = await renderBuilder()
    await act(async () => { screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Note / obiettivi'), 'Nota settimana preservata') })
    await editSessionTitle(screen, 'Seduta destinata alla cancellazione')
    await act(async () => { buttonWithText(screen, 'ESERCIZI').click() })
    await editExerciseRest(screen, '405')
    repository.loadProgramBuilder.mockResolvedValueOnce({
      ...builderData,
      sessions: builderData.sessions.filter(item => item.id !== 'session-1'),
      exercises: builderData.exercises.filter(item => item.sessionId !== 'session-1'),
    })

    await confirmDeletion(screen, 'Elimina sessione')
    await flushPromises()

    expect(repository.updateWeekDetails).toHaveBeenCalledWith(profile, 'week-1', 'Blocco uno', 'Forza', 'load', 'Nota settimana preservata')
    expect(repository.updateSessionDetails).not.toHaveBeenCalled()
    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(repository.deleteSession).toHaveBeenCalledWith(profile, 'session-1')
    expect(repository.updateWeekDetails.mock.invocationCallOrder[0]).toBeLessThan(repository.deleteSession.mock.invocationCallOrder[0])
    expect(readLocalDraft('session', 'session-1')).toBeNull()
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
  })

  it('elimina una settimana e le bozze discendenti senza lasciare conflitti locali', async () => {
    const screen = await renderBuilder()
    await act(async () => { screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Note / obiettivi'), 'Settimana da eliminare') })
    await editSessionTitle(screen, 'Seduta da eliminare')
    await act(async () => { buttonWithText(screen, 'ESERCIZI').click() })
    await editExerciseRest(screen, '420')
    repository.loadProgramBuilder.mockResolvedValueOnce({
      ...builderData,
      weeks: builderData.weeks.filter(item => item.id !== 'week-1'),
      sessions: builderData.sessions.filter(item => item.weekId !== 'week-1'),
      exercises: builderData.exercises.filter(item => item.sessionId !== 'session-1' && item.sessionId !== 'session-2'),
    })

    await confirmDeletion(screen, 'Elimina settimana')
    await flushPromises()

    expect(repository.updateWeekDetails).not.toHaveBeenCalled()
    expect(repository.updateSessionDetails).not.toHaveBeenCalled()
    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(repository.deleteWeek).toHaveBeenCalledWith(profile, 'week-1')
    expect(readLocalDraft('week', 'week-1')).toBeNull()
    expect(readLocalDraft('session', 'session-1')).toBeNull()
    expect(readLocalDraft('exercise', 'exercise-1')).toBeNull()
    expect(screen.textContent).not.toContain('Entità mancante')
  })

  it('conserva selezione, editor e bozza se l’eliminazione fallisce', async () => {
    repository.deleteExercise.mockRejectedValueOnce(new Error('Eliminazione non confermata.'))
    const screen = await renderBuilder()
    await editExerciseRest(screen, '435')

    await confirmDeletion(screen, 'Elimina esercizio')
    await flushPromises()

    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(repository.deleteExercise).toHaveBeenCalledTimes(1)
    expect(readLocalDraft('exercise', 'exercise-1')).not.toBeNull()
    expect(inputWithLabel(screen, 'Recupero').value).toBe('435')
    expect(screen.textContent).toContain('Eliminazione non confermata.')
  })

  it('salva una modifica ad altra entità effettuata durante un’eliminazione lenta', async () => {
    const pendingDelete = deferred<void>()
    repository.deleteExercise.mockReturnValueOnce(pendingDelete.promise)
    const screen = await renderBuilder()
    await act(async () => { screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click() })
    await confirmDeletion(screen, 'Elimina esercizio')
    expect(repository.deleteExercise).toHaveBeenCalledTimes(1)

    await act(async () => { changeInput(inputWithLabel(screen, 'Note / obiettivi'), 'Modifica durante eliminazione') })
    expect(repository.updateWeekDetails).not.toHaveBeenCalled()
    repository.loadProgramBuilder.mockResolvedValueOnce({
      ...builderData,
      weeks: builderData.weeks.map(item => item.id === 'week-1' ? { ...item, notes: 'Modifica durante eliminazione' } : item),
      exercises: [],
    })
    pendingDelete.resolve()
    await flushPromises()

    expect(repository.updateWeekDetails).toHaveBeenCalledWith(profile, 'week-1', 'Blocco uno', 'Forza', 'load', 'Modifica durante eliminazione')
    expect(repository.deleteExercise.mock.invocationCallOrder[0]).toBeLessThan(repository.updateWeekDetails.mock.invocationCallOrder[0])
    expect(inputWithLabel(screen, 'Note / obiettivi').value).toBe('Modifica durante eliminazione')
  })

  it('ignora clic rapidi duplicati durante pubblicazione ed eliminazione', async () => {
    const pendingPublish = deferred<void>()
    repository.publishProgram.mockReturnValueOnce(pendingPublish.promise)
    const screen = await renderBuilder()

    await act(async () => {
      const publishButton = buttonWithText(screen, 'Pubblica programma')
      publishButton.click()
      publishButton.click()
      await Promise.resolve()
    })
    expect(repository.publishProgram).toHaveBeenCalledTimes(1)
    pendingPublish.resolve()
    await flushPromises()

    const pendingDelete = deferred<void>()
    repository.deleteExercise.mockReturnValueOnce(pendingDelete.promise)
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    await act(async () => { buttonWithText(screen, 'Elimina esercizio').click() })
    const dialog = screen.querySelector('.confirm-dialog')
    if (!dialog) throw new Error('Conferma eliminazione esercizio non trovata')
    await act(async () => {
      const confirm = buttonWithText(dialog, 'Elimina definitivamente')
      confirm.click()
      confirm.click()
      await Promise.resolve()
    })
    expect(repository.deleteExercise).toHaveBeenCalledTimes(1)
    repository.loadProgramBuilder.mockResolvedValueOnce({ ...builderData, exercises: [] })
    pendingDelete.resolve()
    await flushPromises()
    expect(repository.deleteExercise).toHaveBeenCalledTimes(1)
  })
})

describe('BuilderScreen scenari integrati RC1', () => {
  it('mantiene serie e ripetizioni dopo cambio seduta e ritorno', async () => {
    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    const increaseSets = Array.from(screen.querySelectorAll<HTMLButtonElement>('.stepper button')).find(button => button.textContent?.trim() === '+')
    if (!increaseSets) throw new Error('Controllo aumento serie non trovato')
    await act(async () => { increaseSets.dispatchEvent(new Event('click', { bubbles: true })) })
    await flushPromises()
    expect(screen.querySelector('.stepper b')?.textContent).toBe('4')
    await act(async () => { changeInput(inputWithLabel(screen, 'Ripetizioni'), '7') })

    await act(async () => {
      buttonWithText(screen, 'Sessione due').click()
      await Promise.resolve()
    })
    await flushPromises()
    await act(async () => {
      buttonWithText(screen, 'Sessione uno').click()
      await Promise.resolve()
    })
    await act(async () => { buttonWithText(screen, 'Hang board').click() })

    expect(repository.updateExercise).toHaveBeenCalledWith(
      profile,
      'exercise-1',
      { sets: 3, reps: 5 },
      expect.objectContaining({ sets: 4, reps: 7 }),
    )
    expect(screen.querySelector('.stepper b')?.textContent).toBe('4')
    expect(inputWithLabel(screen, 'Ripetizioni').value).toBe('7')
  })

  it('mantiene le note dopo cambio settimana e ritorno', async () => {
    const screen = await renderBuilder()
    await act(async () => { screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Note / obiettivi'), 'Nota integrata RC1') })

    await act(async () => {
      screen.querySelector<HTMLButtonElement>('#builder-week-week-2')?.click()
      await Promise.resolve()
    })
    await flushPromises()
    await act(async () => {
      screen.querySelector<HTMLButtonElement>('#builder-week-week-1')?.click()
      await Promise.resolve()
    })
    await act(async () => { screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click() })

    expect(repository.updateWeekDetails).toHaveBeenCalledWith(profile, 'week-1', 'Blocco uno', 'Forza', 'load', 'Nota integrata RC1')
    expect(inputWithLabel(screen, 'Note / obiettivi').value).toBe('Nota integrata RC1')
  })

  it('mantiene un esercizio aggiunto dopo cambio settimana e ritorno', async () => {
    const screen = await renderBuilder()
    repository.loadProgramBuilder.mockResolvedValueOnce(dataWithAddedExercise('Campus RC1'))
    const submit = await prepareExerciseAddition(screen, 'Campus RC1')

    await act(async () => {
      submit.click()
      await Promise.resolve()
    })
    await flushPromises()
    await act(async () => {
      screen.querySelector<HTMLButtonElement>('#builder-week-week-2')?.click()
      await Promise.resolve()
    })
    await act(async () => {
      screen.querySelector<HTMLButtonElement>('#builder-week-week-1')?.click()
      await Promise.resolve()
    })

    expect(repository.addExercise).toHaveBeenCalledWith(profile, 'session-1', [1], 'Campus RC1', undefined)
    expect(buttonWithText(screen, 'Campus RC1')).toBeTruthy()
  })

  it('conserva una nuova seduta modificata dopo uscita e riapertura', async () => {
    const createdSession: ProgramBuilderData['sessions'][number] = { id: 'session-new', weekId: 'week-1', order: 3, title: 'Sessione 3', objective: '', durationMinutes: 0, scheduledDay: 1 }
    const screen = await renderBuilder()
    repository.loadProgramBuilder.mockResolvedValueOnce({ ...builderData, sessions: [...builderData.sessions, createdSession] })

    await act(async () => {
      buttonWithText(screen, 'AGGIUNGI SESSIONE').click()
      await Promise.resolve()
    })
    await flushPromises()
    await editSessionTitle(screen, 'Nuova seduta RC1')
    await act(async () => {
      buttonWithText(screen, 'Programmi').click()
      await Promise.resolve()
    })
    await flushPromises()
    await act(async () => {
      buttonWithText(screen, 'Programma').click()
      await Promise.resolve()
    })

    expect(repository.updateSessionDetails).toHaveBeenCalledWith(profile, 'session-new', 'Nuova seduta RC1', '', 0, 1)
    expect(buttonWithText(screen, 'Nuova seduta RC1')).toBeTruthy()
  })

  it('modifica la settimana duplicata senza alterare l’originale', async () => {
    const copiedWeek: ProgramBuilderData['weeks'][number] = { id: 'week-copy', programId: 'program-1', weekNumber: 4, blockName: 'Blocco uno copia', phase: 'Forza', status: 'planned', loadType: 'load', notes: null }
    const timerPrescription = { sets: 3, reps: 6, seconds: 7, timer: { mode: 'guided', execution_mode: 'single_hand', preparation_seconds: 5, hand_change_seconds: 3, interval_rest_seconds: 2, extension_flag: 'preserve' } }
    const sourceData: ProgramBuilderData = { ...builderData, exercises: builderData.exercises.map(item => ({ ...item, prescription: timerPrescription })) }
    const sourceSession = builderData.sessions.find(item => item.id === 'session-1')!
    const copiedSession = { ...sourceSession, id: 'session-copy', weekId: copiedWeek.id }
    const copiedExercise = { ...sourceData.exercises[0]!, id: 'exercise-copy', sessionId: copiedSession.id, prescription: structuredClone(timerPrescription) }
    const copiedData: ProgramBuilderData = {
      ...sourceData,
      weeks: [...sourceData.weeks, copiedWeek],
      sessions: [...sourceData.sessions, copiedSession],
      exercises: [...sourceData.exercises, copiedExercise],
    }
    repository.loadProgramBuilder.mockResolvedValueOnce(sourceData).mockResolvedValueOnce(copiedData)
    const screen = await renderBuilder()

    await act(async () => {
      buttonWithText(screen, 'Duplica settimana').click()
      await Promise.resolve()
    })
    await flushPromises()
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    expect(screen.querySelector<HTMLSelectElement>('select[aria-label="Modalità timer"]')?.value).toBe('guided')
    expect(screen.querySelector<HTMLSelectElement>('select[aria-label="Modalità esecuzione"]')?.value).toBe('alternate_hands')
    expect(screen.querySelector<HTMLInputElement>('input[aria-label="Pausa breve cambio mano"]')?.value).toBe('3')
    expect(screen.querySelector<HTMLInputElement>('input[aria-label="Pausa tra ripetizioni"]')?.value).toBe('2')
    await act(async () => { screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Note / obiettivi'), 'Solo sulla copia') })
    await act(async () => {
      screen.querySelector<HTMLButtonElement>('#builder-week-week-1')?.click()
      await Promise.resolve()
    })
    await flushPromises()
    await act(async () => { screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click() })
    expect(inputWithLabel(screen, 'Note / obiettivi').value).toBe('')

    await act(async () => {
      screen.querySelector<HTMLButtonElement>('#builder-week-week-copy')?.click()
      await Promise.resolve()
    })
    await act(async () => { screen.querySelector<HTMLButtonElement>('button[aria-label="Azioni settimana"]')?.click() })

    expect(repository.updateWeekDetails).toHaveBeenCalledWith(profile, 'week-copy', 'Blocco uno copia', 'Forza', 'load', 'Solo sulla copia')
    expect(inputWithLabel(screen, 'Note / obiettivi').value).toBe('Solo sulla copia')
  })
})

describe('BuilderScreen comunica le variazioni parziali dei carichi', () => {
  it('non comunica un successo completo quando il testo storico non è scalabile', async () => {
    repository.loadProgramBuilder.mockResolvedValueOnce({
      ...builderData,
      exercises: builderData.exercises.map(item => ({
        ...item,
        prescription: {
          sets: 3,
          reps: 6,
          seconds: 0,
          loadKg: 20,
          dose: '6 ripetizioni · 20 kg nella prima serie, poi aumentare progressivamente',
          unit: 'kg',
        },
      })),
    })
    const screen = await renderBuilder()
    await act(async () => { buttonWithText(screen, 'Hang board').click() })
    await act(async () => { changeInput(inputWithLabel(screen, 'Variazione %'), '10') })
    await act(async () => {
      buttonWithText(screen, 'Applica variazione a questo esercizio').click()
      await Promise.resolve()
    })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledWith(
      profile,
      'exercise-1',
      expect.objectContaining({ dose: expect.stringContaining('aumentare progressivamente') }),
      expect.objectContaining({ loadKg: 22 }),
    )
    expect(screen.textContent).toContain('carichi numerici')
    expect(screen.textContent).toContain('testo storico')
  })
})
