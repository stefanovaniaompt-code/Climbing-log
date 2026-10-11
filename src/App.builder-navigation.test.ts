// @vitest-environment happy-dom

import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppProfile, AppRole } from './onboarding/types'
import type { ProgramBuilderData } from './builder/programBuilder'

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

const appRuntime = vi.hoisted(() => ({
  countPendingOperations: vi.fn(),
  flushExerciseOutbox: vi.fn(),
  syncQueuedExercise: vi.fn(),
}))

vi.mock('./builder/programBuilderRepository', () => repository)
vi.mock('./builder/ExerciseTestTargetPanel', () => ({ ExerciseTestTargetPanel: () => null }))
vi.mock('./dataRuntime', () => ({ dataRuntime: { isConfigured: false } }))
vi.mock('./outbox', () => ({
  countPendingOperations: appRuntime.countPendingOperations,
  flushExerciseOutbox: appRuntime.flushExerciseOutbox,
  OUTBOX_CHANGED_EVENT: 'cc-test-outbox-changed',
}))
vi.mock('./session/sessionRunnerRepository', () => ({ syncQueuedExercise: appRuntime.syncQueuedExercise }))
vi.mock('./messaging/useMessageNotifications', () => ({ useMessageNotifications: () => ({ unreadCount: 0, toast: null }) }))
vi.mock('./pwa/useUpdateBlocker', () => ({ useUpdateBlocker: () => undefined }))
vi.mock('./dashboard/AthleteHomeScreen', () => ({ AthleteHomeScreen: () => null }))
vi.mock('./session/SessionScreen', () => ({ SessionScreen: () => null }))
vi.mock('./coach/DashboardScreen', () => ({ DashboardScreen: () => null }))
vi.mock('./coach/AthleteManagementScreen', () => ({ AthleteManagementScreen: () => null }))
vi.mock('./library/LibraryScreen', () => ({ LibraryScreen: () => null }))
vi.mock('./tests/TestScreen', () => ({ TestScreen: () => null }))
vi.mock('./features/system/SystemScreen', () => ({ SystemScreen: () => null }))
vi.mock('./features/migration/MigrationScreen', () => ({ MigrationScreen: () => null }))
vi.mock('./features/account/AccountSecurityScreen', () => ({ AccountSecurityScreen: () => null }))
vi.mock('./feedback/CoachFeedbackScreen', () => ({ CoachFeedbackScreen: () => null }))
vi.mock('./messaging/MessagesScreen', () => ({ MessagesScreen: () => null }))

import App from './App'

const coachProfile: AppProfile = {
  userId: 'coach-navigation-test',
  displayName: 'Coach Test',
  role: 'coach',
  athleteId: null,
  capabilities: { canAccessCoachArea: true, canAccessAthleteArea: false },
  workspaceId: 'workspace-test',
  workspaceName: 'Climbing Coach',
  onboardingCompletedAt: '2026-09-01T00:00:00.000Z',
  mustChangePassword: false,
}

const dualProfile: AppProfile = {
  ...coachProfile,
  userId: 'dual-navigation-test',
  athleteId: 'athlete-1',
  capabilities: { canAccessCoachArea: true, canAccessAthleteArea: true },
}

const builderData: ProgramBuilderData = {
  source: 'legacy-v1',
  athletes: [{ id: 'athlete-1', name: 'Atleta Test' }],
  programs: [{ id: 'program-1', athleteId: 'athlete-1', name: 'Programma Test', goal: null, programType: 'athlete', status: 'draft', startDate: '2026-09-01', endDate: null }],
  weeks: [{ id: 'week-1', programId: 'program-1', weekNumber: 1, blockName: 'Blocco Test', phase: 'Forza', status: 'planned', loadType: 'load', notes: null }],
  sessions: [{ id: 'session-1', weekId: 'week-1', order: 1, title: 'Sessione Test', objective: 'Obiettivo', durationMinutes: 60, scheduledDay: 1 }],
  library: [],
  exercises: [{ id: 'exercise-1', sessionId: 'session-1', exerciseId: null, order: 1, name: 'Hang board', prescription: { sets: 3, reps: 5 }, targetRpeMin: 7, targetRpeMax: 8, restSeconds: 120, instructions: 'Tecnica pulita' }],
  calendarEvents: [],
}

let root: Root | null = null
let container: HTMLDivElement | null = null

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
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

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function editExerciseRest(screen: HTMLElement, value: string) {
  await act(async () => { buttonWithText(screen, 'Hang board').click() })
  await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), value) })
}

async function editSessionTitle(screen: HTMLElement, value: string) {
  await act(async () => { buttonWithText(screen, 'DETTAGLI SESSIONE').click() })
  await act(async () => { changeInput(inputWithLabel(screen, 'Titolo sessione'), value) })
}

function AppHarness({ profile, onSignedOut }: { profile: AppProfile; onSignedOut: () => Promise<void> }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [signedIn, setSignedIn] = useState(true)
  const initialMode: AppRole = location.pathname.endsWith('/athlete') ? 'athlete' : 'coach'
  return createElement('div', { 'data-app-harness': true },
    createElement('output', { 'data-route-path': true }, location.pathname),
    createElement('button', { type: 'button', 'aria-label': 'Apri direttamente modalità atleta', onClick: () => navigate('/app/athlete') }, 'Route atleta'),
    signedIn
      ? createElement(App, {
        profile,
        initialMode,
        onSignOut: async () => {
          await onSignedOut()
          setSignedIn(false)
        },
      })
      : createElement('div', { 'data-screen': 'signed-out' }, 'Signed out'),
  )
}

async function renderApp(profile = coachProfile, onSignedOut = vi.fn().mockResolvedValue(undefined)) {
  window.localStorage.setItem(`cc-v2:view:${profile.userId}`, 'builder')
  window.localStorage.setItem(`cc-v2:athlete:${profile.userId}`, 'athlete-1')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MemoryRouter, { initialEntries: ['/app/coach'] }, createElement(AppHarness, { profile, onSignedOut })))
  })
  for (let cycle = 0; cycle < 5; cycle += 1) await flushPromises()
  if (!container.querySelector('.coach-builder')) throw new Error('Builder non montato')
  return { screen: container, onSignedOut }
}

function routePath(screen: ParentNode) {
  return screen.querySelector('[data-route-path]')?.textContent
}

async function openDirectAthleteRoute(screen: ParentNode) {
  await act(async () => { screen.querySelector<HTMLButtonElement>('button[aria-label="Apri direttamente modalità atleta"]')?.click() })
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  window.localStorage.clear()
  Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() })
  appRuntime.countPendingOperations.mockResolvedValue(0)
  appRuntime.flushExerciseOutbox.mockResolvedValue({ remaining: 0 })
  repository.loadProgramBuilder.mockResolvedValue(builderData)
  repository.updateWeekDetails.mockResolvedValue(undefined)
  repository.updateSessionDetails.mockResolvedValue(undefined)
  repository.updateExercise.mockResolvedValue(undefined)
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.useRealTimers()
})

describe('App protegge le uscite dal Program Builder', () => {
  it('salva una modifica esercizio prima di aprire la Dashboard entro 700 ms', async () => {
    const { screen } = await renderApp()
    await editExerciseRest(screen, '180')

    await act(async () => { buttonWithText(screen, 'Dashboard').click() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledWith(expect.objectContaining({ userId: coachProfile.userId }), 'exercise-1', expect.anything(), expect.objectContaining({ restSeconds: 180 }))
    expect(screen.querySelector('.coach-builder')).toBeNull()
    expect(screen.textContent).toContain('DASHBOARD COACH')
  })

  it('salva una modifica esercizio prima di aprire la Libreria esercizi', async () => {
    const { screen } = await renderApp()
    await editExerciseRest(screen, '195')

    await act(async () => { buttonWithText(screen, 'Esercizi').click() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledWith(expect.anything(), 'exercise-1', expect.anything(), expect.objectContaining({ restSeconds: 195 }))
    expect(screen.querySelector('.coach-builder')).toBeNull()
    expect(screen.textContent).toContain('LIBRERIA ESERCIZI')
  })

  it('salva i dettagli sessione prima di aprire le impostazioni account', async () => {
    const { screen } = await renderApp()
    await editSessionTitle(screen, 'Sessione salvata prima delle impostazioni')

    await act(async () => { buttonWithText(screen, 'Impostazioni').click() })
    await flushPromises()

    expect(repository.updateSessionDetails).toHaveBeenCalledWith(expect.anything(), 'session-1', 'Sessione salvata prima delle impostazioni', 'Obiettivo', 60, 1)
    expect(screen.querySelector('.coach-builder')).toBeNull()
    expect(screen.textContent).toContain('ACCOUNT E SICUREZZA')
  })

  it('salva una modifica esercizio prima del logout e smonta il builder', async () => {
    const pendingSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(pendingSave.promise)
    const onSignedOut = vi.fn().mockResolvedValue(undefined)
    const { screen } = await renderApp(coachProfile, onSignedOut)
    await editExerciseRest(screen, '210')

    await act(async () => { screen.querySelector<HTMLButtonElement>('button[title="Esci"]')?.click() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledWith(expect.anything(), 'exercise-1', expect.anything(), expect.objectContaining({ restSeconds: 210 }))
    expect(onSignedOut).not.toHaveBeenCalled()
    expect(screen.querySelector('.coach-builder')).toBeTruthy()

    await act(async () => { pendingSave.resolve(); await pendingSave.promise })
    await flushPromises()

    expect(onSignedOut).toHaveBeenCalledTimes(1)
    expect(screen.querySelector('.coach-builder')).toBeNull()
    expect(screen.querySelector('[data-screen="signed-out"]')).toBeTruthy()
  })

  it('attende un salvataggio lento prima di smontare il builder', async () => {
    const pendingSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(pendingSave.promise)
    const { screen } = await renderApp()
    await editExerciseRest(screen, '225')

    await act(async () => { buttonWithText(screen, 'Dashboard').click() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(screen.querySelector('.coach-builder')).toBeTruthy()
    expect(screen.textContent).toContain('PROGRAMMI')

    await act(async () => { pendingSave.resolve(); await pendingSave.promise })
    await flushPromises()

    expect(screen.querySelector('.coach-builder')).toBeNull()
    expect(screen.textContent).toContain('DASHBOARD COACH')
  })

  it('annulla l’uscita se il salvataggio fallisce e conserva la modifica', async () => {
    repository.updateExercise.mockRejectedValueOnce(new Error('Persistenza temporaneamente non disponibile.'))
    const { screen } = await renderApp()
    await editExerciseRest(screen, '240')

    await act(async () => { buttonWithText(screen, 'Dashboard').click() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(screen.querySelector('.coach-builder')).toBeTruthy()
    expect(inputWithLabel(screen, 'Recupero').value).toBe('240')
    expect(screen.textContent).toContain('Persistenza temporaneamente non disponibile.')
  })

  it('salva anche una modifica effettuata mentre l’uscita attende una scrittura', async () => {
    const firstSave = deferred<void>()
    const secondSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(firstSave.promise).mockReturnValueOnce(secondSave.promise)
    const { screen } = await renderApp()
    await editExerciseRest(screen, '255')

    await act(async () => { buttonWithText(screen, 'Dashboard').click() })
    await flushPromises()
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)

    await act(async () => { changeInput(inputWithLabel(screen, 'Recupero'), '270') })
    await act(async () => { firstSave.resolve(); await firstSave.promise })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(2)
    expect(repository.updateExercise).toHaveBeenLastCalledWith(expect.anything(), 'exercise-1', expect.anything(), expect.objectContaining({ restSeconds: 270 }))
    expect(screen.querySelector('.coach-builder')).toBeTruthy()

    await act(async () => { secondSave.resolve(); await secondSave.promise })
    await flushPromises()
    expect(screen.querySelector('.coach-builder')).toBeNull()
  })

  it('ignora una seconda navigazione rapida mentre la prima attende il salvataggio', async () => {
    const pendingSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(pendingSave.promise)
    const { screen } = await renderApp()
    await editExerciseRest(screen, '285')
    const dashboard = buttonWithText(screen, 'Dashboard')
    const library = buttonWithText(screen, 'Esercizi')

    await act(async () => { dashboard.click(); library.click() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(screen.querySelector('.coach-builder')).toBeTruthy()

    await act(async () => { pendingSave.resolve(); await pendingSave.promise })
    await flushPromises()

    expect(screen.textContent).toContain('DASHBOARD COACH')
    expect(screen.textContent).not.toContain('// LIBRERIA ESERCIZI')
  })

  it('rimuove il guard dopo il cambio modalità e non interferisce con la navigazione atleta', async () => {
    const { screen } = await renderApp(dualProfile)
    await editExerciseRest(screen, '300')

    await act(async () => { screen.querySelector<HTMLButtonElement>('button[aria-label="Passa alla modalità atleta"]')?.click() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(screen.querySelector('.coach-builder')).toBeNull()
    expect(screen.querySelector('.athlete-shell')).toBeTruthy()

    await act(async () => { buttonWithText(screen, 'Progressi').click() })
    await flushPromises()

    expect(screen.querySelector('.athlete-shell')).toBeTruthy()
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
  })

  it('mantiene immediata la navigazione quando non ci sono modifiche pendenti', async () => {
    const { screen } = await renderApp()

    await act(async () => { buttonWithText(screen, 'Dashboard').click() })
    await flushPromises()

    expect(repository.updateWeekDetails).not.toHaveBeenCalled()
    expect(repository.updateSessionDetails).not.toHaveBeenCalled()
    expect(repository.updateExercise).not.toHaveBeenCalled()
    expect(screen.querySelector('.coach-builder')).toBeNull()
    expect(screen.textContent).toContain('DASHBOARD COACH')
  })
})

describe('App mantiene coerenti route e modalità durante la guard', () => {
  it('ripristina la route coach se il salvataggio richiesto dalla route atleta fallisce', async () => {
    repository.updateExercise.mockRejectedValueOnce(new Error('Salvataggio route non disponibile.'))
    const { screen } = await renderApp(dualProfile)
    await editExerciseRest(screen, '315')

    await openDirectAthleteRoute(screen)

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(routePath(screen)).toBe('/app/coach')
    expect(screen.querySelector('.coach-builder')).toBeTruthy()
    expect(screen.querySelector('.athlete-shell')).toBeNull()
    expect(inputWithLabel(screen, 'Recupero').value).toBe('315')
    expect(screen.textContent).toContain('Salvataggio route non disponibile.')

    await flushPromises()
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
  })

  it('completa la route atleta dopo un salvataggio riuscito', async () => {
    const { screen } = await renderApp(dualProfile)
    await editExerciseRest(screen, '330')

    await openDirectAthleteRoute(screen)

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(routePath(screen)).toBe('/app/athlete')
    expect(screen.querySelector('.coach-builder')).toBeNull()
    expect(screen.querySelector('.athlete-shell')).toBeTruthy()
  })

  it('mantiene route coach e builder durante un salvataggio lento, poi completa la route', async () => {
    const pendingSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(pendingSave.promise)
    const { screen } = await renderApp(dualProfile)
    await editExerciseRest(screen, '345')

    await openDirectAthleteRoute(screen)

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(routePath(screen)).toBe('/app/coach')
    expect(screen.querySelector('.coach-builder')).toBeTruthy()

    await act(async () => { pendingSave.resolve(); await pendingSave.promise })
    await flushPromises()

    expect(routePath(screen)).toBe('/app/athlete')
    expect(screen.querySelector('.coach-builder')).toBeNull()
    expect(screen.querySelector('.athlete-shell')).toBeTruthy()
  })

  it('consente di ripetere una route annullata senza avviare retry automatici', async () => {
    repository.updateExercise.mockRejectedValueOnce(new Error('Primo tentativo non riuscito.'))
    const { screen } = await renderApp(dualProfile)
    await editExerciseRest(screen, '360')

    await openDirectAthleteRoute(screen)

    expect(routePath(screen)).toBe('/app/coach')
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    await flushPromises()
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)

    await openDirectAthleteRoute(screen)

    expect(repository.updateExercise).toHaveBeenCalledTimes(2)
    expect(routePath(screen)).toBe('/app/athlete')
    expect(screen.querySelector('.athlete-shell')).toBeTruthy()
  })

  it('gestisce un errore di logout senza lasciare una Promise non gestita', async () => {
    const onSignedOut = vi.fn().mockRejectedValueOnce(new Error('Logout temporaneamente non disponibile.'))
    const { screen } = await renderApp(coachProfile, onSignedOut)

    await act(async () => { screen.querySelector<HTMLButtonElement>('button[title="Esci"]')?.click() })
    await flushPromises()

    expect(onSignedOut).toHaveBeenCalledTimes(1)
    expect(screen.querySelector('.coach-builder')).toBeTruthy()
    expect(screen.querySelector('[data-screen="signed-out"]')).toBeNull()
    expect(screen.querySelector('[role="alert"]')?.textContent).toContain('Logout temporaneamente non disponibile.')
  })
})
