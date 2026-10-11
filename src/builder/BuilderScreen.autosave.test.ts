// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppProfile } from '../onboarding/types'
import type { ProgramBuilderData } from './programBuilder'

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

import { BuilderScreen } from './BuilderScreen'

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

async function renderBuilder() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)

  await act(async () => {
    root?.render(createElement(BuilderScreen, {
      profile,
      selectedAthleteId: 'athlete-1',
      setSelectedAthleteId,
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
})

describe('BuilderScreen autosave durante i cambi di selezione', () => {
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
