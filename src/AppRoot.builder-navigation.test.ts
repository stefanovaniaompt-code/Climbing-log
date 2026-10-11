// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgramBuilderData } from './builder/programBuilder'
import type { AppProfile } from './onboarding/types'

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

const authRuntime = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}))

const profileRuntime = vi.hoisted(() => ({
  loadProfile: vi.fn(),
}))

vi.mock('./builder/programBuilderRepository', () => repository)
vi.mock('./builder/ExerciseTestTargetPanel', () => ({ ExerciseTestTargetPanel: () => null }))
vi.mock('./dataRuntime', () => ({ dataRuntime: { isConfigured: true, backendSchema: 'legacy-v1' } }))
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: authRuntime.getSession,
      onAuthStateChange: authRuntime.onAuthStateChange,
      signOut: authRuntime.signOut,
    },
  },
}))
vi.mock('./onboarding/profileRepository', () => ({ loadProfile: profileRuntime.loadProfile }))
vi.mock('./outbox', () => ({
  countPendingOperations: appRuntime.countPendingOperations,
  flushExerciseOutbox: appRuntime.flushExerciseOutbox,
  OUTBOX_CHANGED_EVENT: 'cc-approot-test-outbox-changed',
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
vi.mock('./auth/AuthScreen', () => ({ AuthScreen: () => null }))
vi.mock('./auth/PasswordRecoveryScreen', () => ({ PasswordRecoveryScreen: () => null }))
vi.mock('./auth/TemporaryPasswordScreen', () => ({ TemporaryPasswordScreen: () => null }))
vi.mock('./onboarding/OnboardingScreen', () => ({ OnboardingScreen: () => null }))

import AppRoot from './AppRoot'
import { AuthProvider } from './auth/AuthProvider'

const coachProfile: AppProfile = {
  userId: 'coach-approot-test',
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
  userId: 'dual-approot-test',
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
let createTestTree: (() => ReturnType<typeof createElement>) | null = null

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

function NavigationHarness() {
  const location = useLocation()
  const navigate = useNavigate()
  return createElement('div', { 'data-root-harness': true },
    createElement('output', { 'data-route-path': true }, location.pathname),
    createElement('button', { type: 'button', 'aria-label': 'Route atleta diretta', onClick: () => navigate('/app/athlete') }, 'Route atleta'),
    createElement('button', { type: 'button', 'aria-label': 'Route non riconosciuta', onClick: () => navigate('/app/invalid') }, 'Route invalida'),
    createElement('button', { type: 'button', 'aria-label': 'Indietro browser', onClick: () => navigate(-1) }, 'Indietro'),
    createElement('button', { type: 'button', 'aria-label': 'Avanti browser', onClick: () => navigate(1) }, 'Avanti'),
    createElement(AppRoot),
  )
}

async function renderAppRoot(profile = coachProfile) {
  profileRuntime.loadProfile.mockResolvedValue(profile)
  window.localStorage.setItem(`cc-v2:view:${profile.userId}`, 'builder')
  window.localStorage.setItem(`cc-v2:athlete:${profile.userId}`, 'athlete-1')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  createTestTree = () => createElement(
    MemoryRouter,
    { initialEntries: ['/app/coach'] },
    createElement(AuthProvider, null, createElement(NavigationHarness)),
  )
  await act(async () => { root?.render(createTestTree?.()) })
  for (let cycle = 0; cycle < 8; cycle += 1) await flushPromises()
  if (!container.querySelector('.coach-builder')) throw new Error('Builder non montato attraverso AppRoot')
  return container
}

function routePath(screen: ParentNode) {
  return screen.querySelector('[data-route-path]')?.textContent
}

async function navigateWithLabel(screen: ParentNode, label: string) {
  await act(async () => { screen.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click() })
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  window.localStorage.clear()
  Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() })
  authRuntime.getSession.mockResolvedValue({
    data: { session: { user: { id: coachProfile.userId, email: 'coach.test@example.invalid' } } },
    error: null,
  })
  authRuntime.onAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: authRuntime.unsubscribe } } }))
  authRuntime.signOut.mockResolvedValue({ error: null })
  appRuntime.countPendingOperations.mockResolvedValue(0)
  appRuntime.flushExerciseOutbox.mockResolvedValue({ remaining: 0 })
  repository.loadProgramBuilder.mockImplementation(async () => structuredClone(builderData))
  repository.updateWeekDetails.mockResolvedValue(undefined)
  repository.updateSessionDetails.mockResolvedValue(undefined)
  repository.updateExercise.mockResolvedValue(undefined)
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
  createTestTree = null
  vi.useRealTimers()
})

describe('AppRoot protegge il Program Builder durante i redirect', () => {
  it('mantiene builder e bozza quando un coach senza area atleta apre direttamente /app/athlete', async () => {
    const screen = await renderAppRoot()
    await editExerciseRest(screen, '315')

    await navigateWithLabel(screen, 'Route atleta diretta')

    expect(routePath(screen)).toBe('/app/coach')
    expect(screen.querySelector('.coach-builder')).toBeTruthy()
    expect(inputWithLabel(screen, 'Recupero').value).toBe('315')
    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(1)
  })

  it('normalizza una route sconosciuta senza perdere la bozza e conserva il guard', async () => {
    const screen = await renderAppRoot()
    await editExerciseRest(screen, '330')

    await navigateWithLabel(screen, 'Route non riconosciuta')

    expect(routePath(screen)).toBe('/app/coach')
    expect(screen.querySelector('.coach-builder')).toBeTruthy()
    expect(inputWithLabel(screen, 'Recupero').value).toBe('330')

    await act(async () => { buttonWithText(screen, 'Dashboard').click() })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledWith(expect.anything(), 'exercise-1', expect.anything(), expect.objectContaining({ restSeconds: 330 }))
    expect(screen.querySelector('.coach-builder')).toBeNull()
  })

  it('non smonta il builder quando il redirect arriva durante un salvataggio già in corso', async () => {
    const pendingSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(pendingSave.promise)
    const screen = await renderAppRoot()
    await editExerciseRest(screen, '345')
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve() })
    await flushPromises()
    expect(repository.updateExercise).toHaveBeenCalledTimes(1)

    await navigateWithLabel(screen, 'Route atleta diretta')

    expect(routePath(screen)).toBe('/app/coach')
    expect(screen.querySelector('.coach-builder')).toBeTruthy()
    expect(inputWithLabel(screen, 'Recupero').value).toBe('345')

    await act(async () => { pendingSave.resolve(); await pendingSave.promise })
    await flushPromises()

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(1)
    expect(inputWithLabel(screen, 'Recupero').value).toBe('345')
  })

  it('preserva la bozza dopo il refresh dei componenti e nella cronologia avanti/indietro', async () => {
    const screen = await renderAppRoot()
    await editExerciseRest(screen, '360')

    await navigateWithLabel(screen, 'Route non riconosciuta')
    await act(async () => { root?.render(createTestTree?.()) })
    await flushPromises()
    await navigateWithLabel(screen, 'Indietro browser')
    await navigateWithLabel(screen, 'Avanti browser')

    expect(routePath(screen)).toBe('/app/coach')
    expect(repository.loadProgramBuilder).toHaveBeenCalledTimes(1)
    expect(screen.querySelector('.coach-builder')).toBeTruthy()
    expect(inputWithLabel(screen, 'Recupero').value).toBe('360')
  })

  it('mantiene il flusso del Task 04A.1 per un profilo con entrambe le capacità', async () => {
    const pendingSave = deferred<void>()
    repository.updateExercise.mockReturnValueOnce(pendingSave.promise)
    const screen = await renderAppRoot(dualProfile)
    await editExerciseRest(screen, '375')

    await navigateWithLabel(screen, 'Route atleta diretta')

    expect(repository.updateExercise).toHaveBeenCalledTimes(1)
    expect(routePath(screen)).toBe('/app/coach')
    expect(screen.querySelector('.coach-builder')).toBeTruthy()

    await act(async () => { pendingSave.resolve(); await pendingSave.promise })
    await flushPromises()

    expect(routePath(screen)).toBe('/app/athlete')
    expect(screen.querySelector('.coach-builder')).toBeNull()
    expect(screen.querySelector('.athlete-shell')).toBeTruthy()
  })
})
