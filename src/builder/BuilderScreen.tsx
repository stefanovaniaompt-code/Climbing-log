import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, CircleEllipsis, ClipboardList, Copy, GripVertical, Layers3, Minus, Plus, Save, Settings2, TimerReset, Trash2, TriangleAlert, Users } from 'lucide-react'
import type { AppProfile } from '../onboarding/types'
import { ConfirmDialog, Panel, ScreenHeader, Tag } from '../shared/ui'
import { canPublishProgram, describePrescriptionLoadAdjustment, mergePrescriptionForUpdate, prescriptionSummary, readPrescriptionEditorValues, resizePrescriptionSteps, scalePrescriptionLoads, type ProgramBuilderData, type PrescriptionStep } from './programBuilder'
import { addExercise, createProgram, createSession, createWeek, deleteExercise, deleteProgram, deleteSession, deleteWeek, duplicateWeek, loadProgramBuilder, publishProgram, updateExercise, updateSessionDetails, updateWeekDetails, type ExercisePatch } from './programBuilderRepository'
import { builderDraftValuesMatch, compareBuilderLocalDraft, compareBuilderLocalDrafts, planBuilderLocalDraftRecovery, type BuilderDraftComparison, type BuilderDraftComparisonStatus, type BuilderDraftRecoveryPlan } from './builderLocalDraftComparison'
import { builderLocalDraftKey, claimBuilderLocalDraftRevision, clearBuilderLocalDraftRevision, readBuilderLocalDraft, scanBuilderLocalDrafts, writeBuilderLocalDraft, type BuilderDraftEntityType, type BuilderDraftIdentity, type BuilderLocalDraftScanIssue } from './builderLocalDraftStorage'
import { ExerciseTestTargetPanel } from './ExerciseTestTargetPanel'
import { readTimerSettings, resolveExerciseTimerValues, resolveTimerRestSeconds, timerSettingsEqual } from '../prescriptions/timerConfiguration'
import { TimerConfigurationEditor } from '../shared/TimerConfigurationEditor'
import './BuilderScreen.css'

type BuilderViewState = { showBuilder: boolean; creatingProgram: boolean; athleteId: string; programId: string; weekId: string; sessionId: string; exerciseId: string; sessionTab: 'exercises' | 'notes' | 'details'; exerciseEditorOpen: boolean; exerciseAdderOpen: boolean; weekSettingsOpen: boolean }
type BuilderDeleteTarget =
  | { kind: 'program' | 'week' | 'session' | 'exercise'; id: string; name: string }
  | { kind: 'block'; name: string; weekIds: string[] }
type WeekDetails = { blockName: string; phase: string; loadType: 'load' | 'deload'; notes: string }
type SessionDetails = { title: string; objective: string; durationMinutes: number; scheduledDay: number }
type PendingSave = { key: string; serialized: string; promise: Promise<boolean> }
type SaveSlot = { current: PendingSave | null }
type LocalDraftRevision = { generationId: string; revision: number; serialized: string }
type LocalDraftReview = { comparisons: BuilderDraftComparison[]; issues: BuilderLocalDraftScanIssue[]; verificationError: string }
type DraftReconciliationRequest = { id: number; data: ProgramBuilderData }
export type BuilderNavigationGuard = () => Promise<boolean>

const draftEntityLabels: Record<BuilderDraftEntityType, string> = { week: 'Settimana', session: 'Seduta', exercise: 'Esercizio' }
const draftStatusLabels: Record<BuilderDraftComparisonStatus, string> = {
  recoverable: 'Recuperabile',
  'already-synced': 'Già sincronizzata',
  conflict: 'Conflitto',
  'entity-missing': 'Entità mancante',
  error: 'Verifica non riuscita',
}

function formatDraftUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'data non disponibile'
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

function formatDraftValue(value: unknown) {
  if (typeof value === 'string') return value || 'vuoto'
  if (value === null || value === undefined) return 'vuoto'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function readExerciseLoadAdjustments(key: string): Record<string, number> {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= -100))
  } catch { return {} }
}

function readBuilderView(key: string): Partial<BuilderViewState> | null {
  try { return JSON.parse(window.localStorage.getItem(key) ?? 'null') as Partial<BuilderViewState> | null } catch { return null }
}

function draftIdentitiesForDelete(target: BuilderDeleteTarget, data: ProgramBuilderData, userId: string, fallbackProgramId: string) {
  const identities = new Map<string, BuilderDraftIdentity>()
  const add = (programId: string, entityType: BuilderDraftEntityType, entityId: string) => {
    if (!programId || !entityId) return
    const identity = { userId, programId, entityType, entityId }
    identities.set(builderLocalDraftKey(identity), identity)
  }

  const weekIds = new Set<string>()
  if (target.kind === 'program') data.weeks.filter(week => week.programId === target.id).forEach(week => weekIds.add(week.id))
  else if (target.kind === 'block') target.weekIds.forEach(id => weekIds.add(id))
  else if (target.kind === 'week') weekIds.add(target.id)

  const sessionIds = new Set<string>()
  if (target.kind === 'session') sessionIds.add(target.id)
  data.sessions.filter(session => weekIds.has(session.weekId)).forEach(session => sessionIds.add(session.id))

  const exerciseIds = new Set<string>()
  if (target.kind === 'exercise') exerciseIds.add(target.id)
  data.exercises.filter(exercise => sessionIds.has(exercise.sessionId)).forEach(exercise => exerciseIds.add(exercise.id))

  for (const weekId of weekIds) {
    const programId = data.weeks.find(week => week.id === weekId)?.programId ?? fallbackProgramId
    add(programId, 'week', weekId)
  }
  for (const sessionId of sessionIds) {
    const session = data.sessions.find(item => item.id === sessionId)
    const programId = data.weeks.find(week => week.id === session?.weekId)?.programId ?? fallbackProgramId
    add(programId, 'session', sessionId)
  }
  for (const exerciseId of exerciseIds) {
    const currentExercise = data.exercises.find(item => item.id === exerciseId)
    const currentSession = data.sessions.find(item => item.id === currentExercise?.sessionId)
    const programId = data.weeks.find(week => week.id === currentSession?.weekId)?.programId ?? fallbackProgramId
    add(programId, 'exercise', exerciseId)
  }

  return Array.from(identities.values())
}

export function BuilderScreen({ profile, selectedAthleteId, setSelectedAthleteId, registerNavigationGuard }: { profile: AppProfile; selectedAthleteId: string; setSelectedAthleteId: (id: string) => void; registerNavigationGuard?: (guard: BuilderNavigationGuard | null) => void }) {
  const builderViewKey = `cc-builder-view:${profile.userId}`
  const [savedView] = useState(() => readBuilderView(builderViewKey))
  const [showBuilder, setShowBuilder] = useState(savedView?.athleteId === selectedAthleteId ? savedView.showBuilder ?? Boolean(selectedAthleteId) : Boolean(selectedAthleteId))
  const [creatingProgram, setCreatingProgram] = useState(savedView?.creatingProgram ?? false)
  const [data, setData] = useState<ProgramBuilderData | null>(null)
  const [athleteId, setAthleteId] = useState(selectedAthleteId || savedView?.athleteId || '')
  const [programId, setProgramId] = useState(savedView?.programId ?? '')
  const [weekId, setWeekId] = useState(savedView?.weekId ?? '')
  const [sessionId, setSessionId] = useState(savedView?.sessionId ?? '')
  const [exerciseId, setExerciseId] = useState(savedView?.exerciseId ?? '')
  const [state, setState] = useState<'loading' | 'idle' | 'saving'>('loading')
  const [error, setError] = useState('')
  const [localDraftWarning, setLocalDraftWarning] = useState('')
  const [localDraftReview, setLocalDraftReview] = useState<LocalDraftReview | null>(null)
  const [discardDraftTarget, setDiscardDraftTarget] = useState<BuilderDraftComparison | null>(null)
  const [reconciliationRequest, setReconciliationRequest] = useState<DraftReconciliationRequest | null>(null)
  const [recoveryEpoch, setRecoveryEpoch] = useState(0)
  const [protectedDraftWarning, setProtectedDraftWarning] = useState('')
  const [message, setMessage] = useState('')
  const [newProgram, setNewProgram] = useState<{ name: string; goal: string; programType: 'athlete' | 'patient' }>({ name: '', goal: '', programType: 'athlete' })
  const [newExercise, setNewExercise] = useState('')
  const [libraryId, setLibraryId] = useState('')
  const [weekDetails, setWeekDetails] = useState<WeekDetails>({ blockName: '', phase: '', loadType: 'load', notes: '' })
  const [sessionDetails, setSessionDetails] = useState<SessionDetails>({ title: '', objective: '', durationMinutes: 0, scheduledDay: 1 })
  const [patch, setPatch] = useState<ExercisePatch>({ sets: 3, reps: 5, seconds: 0, loadKg: 0, rpe: 7, restSeconds: 120, instructions: '', steps: [] })
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [deleteTarget, setDeleteTarget] = useState<BuilderDeleteTarget | null>(null)
  const exerciseLoadKey = `cc-builder-exercise-load-adjustments:${profile.userId}`
  const [exerciseLoadPercentages, setExerciseLoadPercentages] = useState<Record<string, number>>(() => readExerciseLoadAdjustments(exerciseLoadKey))
  const testTargetLoadAdjustment = useRef<((percentage: number) => Promise<void>) | null>(null)
  const [hasTestDerivedTarget, setHasTestDerivedTarget] = useState(false)
  const registerTestTargetLoadAdjustment = useCallback((handler: ((percentage: number) => Promise<void>) | null) => {
    testTargetLoadAdjustment.current = handler
    setHasTestDerivedTarget(Boolean(handler))
  }, [])
  const [sessionTab, setSessionTab] = useState<'exercises' | 'notes' | 'details'>(savedView?.sessionTab ?? 'exercises')
  const [weekSettingsOpen, setWeekSettingsOpen] = useState(savedView?.weekSettingsOpen ?? false)
  const [exerciseEditorOpen, setExerciseEditorOpen] = useState(savedView?.exerciseEditorOpen ?? false)
  const [exerciseAdderOpen, setExerciseAdderOpen] = useState(savedView?.exerciseAdderOpen ?? false)
  const previousSessionId = useRef(sessionId)
  const loadedData = useRef<ProgramBuilderData | null>(null)
  const initialAthleteApplied = useRef(Boolean(savedView?.athleteId && (!selectedAthleteId || savedView.athleteId === selectedAthleteId)))
  const hydratedWeek = useRef('')
  const hydratedSession = useRef('')
  const hydratedExercise = useRef('')
  const hydratedWeekValue = useRef('')
  const hydratedSessionValue = useRef('')
  const hydratedExerciseValue = useRef('')
  const weekSaveTimer = useRef<number | null>(null)
  const sessionSaveTimer = useRef<number | null>(null)
  const exerciseSaveTimer = useRef<number | null>(null)
  const weekSaveInFlight = useRef<PendingSave | null>(null)
  const sessionSaveInFlight = useRef<PendingSave | null>(null)
  const exerciseSaveInFlight = useRef<PendingSave | null>(null)
  const localDraftRevisions = useRef(new Map<string, LocalDraftRevision>())
  const recoveredDraftValues = useRef(new Map<string, Record<string, unknown>>())
  const localDraftFailures = useRef(new Set<string>())
  const uncertainSaveKeys = useRef(new Set<string>())
  const draftReconciliationInFlight = useRef<Promise<boolean> | null>(null)
  const reconciliationSequence = useRef(0)
  const handledReconciliation = useRef(0)
  const draftResolutionInProgress = useRef(false)
  const navigationSaveInProgress = useRef(false)
  const hydratingWeek = useRef(false)
  const hydratingSession = useRef(false)
  const hydratingExercise = useRef(false)
  const weekDetailsRef = useRef(weekDetails)
  const sessionDetailsRef = useRef(sessionDetails)
  const patchRef = useRef(patch)
  weekDetailsRef.current = weekDetails
  sessionDetailsRef.current = sessionDetails
  patchRef.current = patch
  const draftKey = `cc-builder-draft:${profile.userId}`

  useEffect(() => {
    const snapshot: BuilderViewState = { showBuilder, creatingProgram, athleteId, programId, weekId, sessionId, exerciseId, sessionTab, exerciseEditorOpen, exerciseAdderOpen, weekSettingsOpen }
    try { window.localStorage.setItem(builderViewKey, JSON.stringify(snapshot)) } catch { /* Storage può essere disabilitato. */ }
  }, [builderViewKey, showBuilder, creatingProgram, athleteId, programId, weekId, sessionId, exerciseId, sessionTab, exerciseEditorOpen, exerciseAdderOpen, weekSettingsOpen])
  useEffect(() => { try { window.localStorage.setItem(exerciseLoadKey, JSON.stringify(exerciseLoadPercentages)) } catch { /* Storage può essere disabilitato. */ } }, [exerciseLoadKey, exerciseLoadPercentages])

  const inspectLocalDrafts = useCallback((remoteData: ProgramBuilderData | null, remoteError?: unknown) => {
    const scan = scanBuilderLocalDrafts(profile.userId)
    if (scan.ok && scan.drafts.length === 0 && scan.issues.length === 0) {
      setLocalDraftReview(null)
      return
    }
    const comparisons = compareBuilderLocalDrafts(scan.drafts, remoteData, remoteError).filter(comparison => (
      comparison.status === 'conflict' || comparison.status === 'entity-missing' || comparison.status === 'error'
    ))
    const remoteErrorMessage = remoteError instanceof Error ? remoteError.message : typeof remoteError === 'string' ? remoteError : ''
    const storageError = !scan.ok ? scan.issues.find(issue => issue.code === 'storage-unavailable')?.message ?? 'Le bozze locali non possono essere verificate.' : ''
    if (comparisons.length === 0 && scan.issues.length === 0 && !remoteErrorMessage && !storageError) {
      setLocalDraftReview(null)
      return
    }
    setLocalDraftReview({ comparisons, issues: scan.issues, verificationError: remoteErrorMessage || storageError })
  }, [profile.userId])

  const refresh = async () => {
    try {
      const next = await loadProgramBuilder(profile)
      loadedData.current = next
      setData(next)
      reconciliationSequence.current += 1
      setReconciliationRequest({ id: reconciliationSequence.current, data: next })
      return next
    } catch (reason) {
      inspectLocalDrafts(null, reason)
      throw reason
    }
  }
  const updateLoadedData = useCallback((update: (current: ProgramBuilderData) => ProgramBuilderData) => {
    if (!loadedData.current) return
    const next = update(loadedData.current)
    loadedData.current = next
    setData(next)
  }, [])

  useEffect(() => { refresh().catch(reason => setError(reason instanceof Error ? reason.message : 'Programmi non caricati.')).finally(() => setState('idle')) }, [profile.userId])
  useEffect(() => { try { const saved = window.localStorage.getItem(draftKey); if (saved) setNewProgram(JSON.parse(saved)) } catch { /* draft non disponibile */ } }, [draftKey])
  useEffect(() => { try { if (newProgram.name || newProgram.goal) window.localStorage.setItem(draftKey, JSON.stringify(newProgram)); else window.localStorage.removeItem(draftKey) } catch { /* draft non disponibile */ } }, [draftKey, newProgram])
  useEffect(() => {
    if (!data) return
    if (!initialAthleteApplied.current) {
      initialAthleteApplied.current = true
      if (selectedAthleteId && data.athletes.some(athlete => athlete.id === selectedAthleteId)) { setAthleteId(selectedAthleteId); return }
    }
    if (!data.athletes.some(athlete => athlete.id === athleteId)) setAthleteId(data.athletes[0]?.id ?? '')
  }, [data, athleteId, selectedAthleteId])
  const athletePrograms = data?.programs.filter(program => program.athleteId === athleteId) ?? []
  useEffect(() => {
    if (creatingProgram) return
    if (!athletePrograms.some(program => program.id === programId)) setProgramId(athletePrograms[0]?.id ?? '')
  }, [athleteId, athletePrograms, creatingProgram, programId])
  const weeks = data?.weeks.filter(week => week.programId === programId) ?? []
  useEffect(() => { if (!weeks.some(week => week.id === weekId)) setWeekId(weeks[0]?.id ?? '') }, [programId, data, weekId])
  const sessions = data?.sessions.filter(session => session.weekId === weekId) ?? []
  useEffect(() => { if (!sessions.some(session => session.id === sessionId)) setSessionId(sessions[0]?.id ?? '') }, [weekId, data, sessionId])
  useEffect(() => {
    if (previousSessionId.current === sessionId) return
    previousSessionId.current = sessionId
    setExerciseEditorOpen(false); setExerciseAdderOpen(false); setSessionTab('exercises')
  }, [sessionId])
  const exercises = data?.exercises.filter(exercise => exercise.sessionId === sessionId) ?? []
  useEffect(() => { if (!exercises.some(exercise => exercise.id === exerciseId)) setExerciseId(exercises[0]?.id ?? '') }, [sessionId, data, exerciseId])
  const program = athletePrograms.find(item => item.id === programId)
  const session = sessions.find(item => item.id === sessionId)
  const exercise = exercises.find(item => item.id === exerciseId)
  const inferredExerciseTimer = exercise
    ? resolveExerciseTimerValues(exercise.name, exercise.prescription, exercise.restSeconds, patch.instructions)
    : null
  const originalExerciseValues = exercise ? readPrescriptionEditorValues(exercise.prescription) : null
  const timerPreview = inferredExerciseTimer && originalExerciseValues ? {
    ...inferredExerciseTimer,
    ...patch.timerSettings,
    sets: patch.sets !== originalExerciseValues.sets ? patch.sets : inferredExerciseTimer.sets,
    reps: patch.reps !== originalExerciseValues.reps ? patch.reps : inferredExerciseTimer.reps,
    seconds: patch.seconds !== originalExerciseValues.seconds ? patch.seconds : inferredExerciseTimer.seconds,
    restSeconds: patch.restSeconds !== (resolveTimerRestSeconds(exercise!.prescription, exercise!.restSeconds, 120) ?? 0)
      ? patch.restSeconds : inferredExerciseTimer.restSeconds,
    series: patch.steps.length ? patch.steps.map(step => ({ reps: step.reps, seconds: step.seconds })) : inferredExerciseTimer.series,
  } : undefined
  const selectedWeek = weeks.find(item => item.id === weekId)
  const exerciseLoadPercentage = exercise ? exerciseLoadPercentages[exercise.id] ?? 0 : 0
  const safeExerciseLoadPercentage = Number.isFinite(exerciseLoadPercentage) && exerciseLoadPercentage >= -100 ? exerciseLoadPercentage : 0
  const scaledExercisePatch = scalePrescriptionLoads(patch, safeExerciseLoadPercentage)
  const exercisePatchSerialized = JSON.stringify(patch)
  const blocks = useMemo(() => {
    const grouped = new Map<string, typeof weeks>()
    weeks.forEach(week => {
      const name = week.blockName?.trim() || 'Blocco'
      grouped.set(name, [...(grouped.get(name) ?? []), week])
    })
    return Array.from(grouped, ([name, blockWeeks]) => ({ name, weeks: blockWeeks }))
  }, [weeks])
  const programDates = program?.startDate
    ? `${new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(program.startDate))} → ${program.endDate ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(program.endDate)) : '—'} · ${weeks.length} settimane`
    : `${weeks.length} ${weeks.length === 1 ? 'settimana' : 'settimane'}`

  const currentSelectionRef = useRef({ week: selectedWeek, session, exercise })
  currentSelectionRef.current = { week: selectedWeek, session, exercise }

  const draftIdentity = useCallback((entityType: BuilderDraftEntityType, entityId: string, targetProgramId = programId): BuilderDraftIdentity => ({
    userId: profile.userId,
    programId: targetProgramId,
    entityType,
    entityId,
  }), [profile.userId, programId])
  const hasUncertainSave = useCallback((entityType: BuilderDraftEntityType, entityId: string) => (
    Boolean(entityId) && uncertainSaveKeys.current.has(builderLocalDraftKey(draftIdentity(entityType, entityId)))
  ), [draftIdentity])
  const exerciseHasUnsavedChanges = Boolean(exercise && hydratedExercise.current === exercise.id && (
    exercisePatchSerialized !== hydratedExerciseValue.current || hasUncertainSave('exercise', exercise.id)
  ))
  const updateLocalDraftWarning = useCallback((key: string, errorMessage?: string) => {
    if (errorMessage) localDraftFailures.current.add(key)
    else localDraftFailures.current.delete(key)
    setLocalDraftWarning(localDraftFailures.current.size > 0 ? errorMessage || 'Una modifica non è protetta sul dispositivo.' : '')
  }, [])
  const captureLocalDraft = useCallback((entityType: BuilderDraftEntityType, entityId: string, remoteBaseSerialized: string, current: object, pendingRemoteSerialized: string | null) => {
    if (!programId || !entityId || !remoteBaseSerialized) return true
    const identity = draftIdentity(entityType, entityId)
    const key = builderLocalDraftKey(identity)
    let remoteBase: object
    try {
      remoteBase = JSON.parse(remoteBaseSerialized) as object
    } catch {
      updateLocalDraftWarning(key, 'La modifica non è protetta sul dispositivo: il riferimento remoto non è disponibile.')
      return true
    }
    const ownedDraft = localDraftRevisions.current.get(key) ?? null
    let pendingRemote: object | null = null
    try {
      pendingRemote = pendingRemoteSerialized ? JSON.parse(pendingRemoteSerialized) as object : null
    } catch { /* Le serializzazioni della coda sono prodotte internamente e non modificano lo storage. */ }
    const result = writeBuilderLocalDraft(identity, remoteBase, current, undefined, undefined, ownedDraft?.revision ?? null, {
      expectedGenerationId: ownedDraft?.generationId ?? null,
      pendingRemote,
    })
    if (!result.ok) {
      if (result.reason === 'unreconciled-draft') {
        setProtectedDraftWarning(result.error)
        return false
      }
      updateLocalDraftWarning(key, result.error)
      return true
    }
    setProtectedDraftWarning('')
    updateLocalDraftWarning(key)
    if (result.draft) {
      if (!result.draft.generationId) {
        updateLocalDraftWarning(key, 'La modifica non è protetta sul dispositivo: l’identità della bozza non è disponibile.')
        return true
      }
      localDraftRevisions.current.set(key, { generationId: result.draft.generationId, revision: result.draft.revision, serialized: JSON.stringify(current) })
    } else {
      localDraftRevisions.current.delete(key)
    }
    inspectLocalDrafts(loadedData.current)
    return true
  }, [draftIdentity, inspectLocalDrafts, programId, updateLocalDraftWarning])
  const localRevisionForSnapshot = useCallback((identity: BuilderDraftIdentity, serialized: string) => {
    const pending = localDraftRevisions.current.get(builderLocalDraftKey(identity))
    return pending?.serialized === serialized ? pending : null
  }, [])
  const acknowledgeLocalRevision = useCallback((identity: BuilderDraftIdentity, localDraft: LocalDraftRevision | null) => {
    if (localDraft === null) return
    const key = builderLocalDraftKey(identity)
    const result = clearBuilderLocalDraftRevision(identity, localDraft.revision, undefined, localDraft.generationId)
    if (!result.ok) {
      updateLocalDraftWarning(key, result.error)
      return
    }
    if (!result.cleared) return
    const current = localDraftRevisions.current.get(key)
    if (current?.revision === localDraft.revision && current.generationId === localDraft.generationId) localDraftRevisions.current.delete(key)
    recoveredDraftValues.current.delete(key)
    updateLocalDraftWarning(key)
    inspectLocalDrafts(loadedData.current)
  }, [inspectLocalDrafts, updateLocalDraftWarning])

  const updateWeekEditor = (update: (current: WeekDetails) => WeekDetails) => {
    const current = weekDetailsRef.current
    const next = update(current)
    const currentWeek = currentSelectionRef.current.week
    if (currentWeek && hydratedWeek.current === currentWeek.id && !captureLocalDraft('week', currentWeek.id, hydratedWeekValue.current, next, weekSaveInFlight.current?.serialized ?? null)) return
    weekDetailsRef.current = next
    setWeekDetails(next)
  }
  const updateSessionEditor = (update: (current: SessionDetails) => SessionDetails) => {
    const current = sessionDetailsRef.current
    const next = update(current)
    const currentSession = currentSelectionRef.current.session
    if (currentSession && hydratedSession.current === currentSession.id && !captureLocalDraft('session', currentSession.id, hydratedSessionValue.current, next, sessionSaveInFlight.current?.serialized ?? null)) return
    sessionDetailsRef.current = next
    setSessionDetails(next)
  }
  const updateExerciseEditor = (update: (current: ExercisePatch) => ExercisePatch) => {
    const current = patchRef.current
    const next = update(current)
    const currentExercise = currentSelectionRef.current.exercise
    if (currentExercise && hydratedExercise.current === currentExercise.id && !captureLocalDraft('exercise', currentExercise.id, hydratedExerciseValue.current, next, exerciseSaveInFlight.current?.serialized ?? null)) return
    patchRef.current = next
    setPatch(next)
  }

  const hasUnsavedWeek = useCallback(() => {
    const current = currentSelectionRef.current.week
    return Boolean(current && hydratedWeek.current === current.id && JSON.stringify(weekDetailsRef.current) !== hydratedWeekValue.current)
  }, [])
  const hasUnsavedSession = useCallback(() => {
    const current = currentSelectionRef.current.session
    return Boolean(current && hydratedSession.current === current.id && JSON.stringify(sessionDetailsRef.current) !== hydratedSessionValue.current)
  }, [])
  const hasUnsavedExercise = useCallback(() => {
    const current = currentSelectionRef.current.exercise
    return Boolean(current && hydratedExercise.current === current.id && JSON.stringify(patchRef.current) !== hydratedExerciseValue.current)
  }, [])
  const hasPendingCurrentChanges = useCallback((discardKeys: ReadonlySet<string> = new Set()) => {
    const current = currentSelectionRef.current
    const weekKey = current.week ? builderLocalDraftKey(draftIdentity('week', current.week.id, current.week.programId)) : ''
    const sessionKey = current.session ? builderLocalDraftKey(draftIdentity('session', current.session.id)) : ''
    const exerciseKey = current.exercise ? builderLocalDraftKey(draftIdentity('exercise', current.exercise.id)) : ''
    const includeWeek = !weekKey || !discardKeys.has(weekKey)
    const includeSession = !sessionKey || !discardKeys.has(sessionKey)
    const includeExercise = !exerciseKey || !discardKeys.has(exerciseKey)
    return (
      (includeWeek && (hasUnsavedWeek() || weekSaveTimer.current !== null || Boolean(weekSaveInFlight.current && !discardKeys.has(weekSaveInFlight.current.key)) || Boolean(current.week && hasUncertainSave('week', current.week.id))))
      || (includeSession && (hasUnsavedSession() || sessionSaveTimer.current !== null || Boolean(sessionSaveInFlight.current && !discardKeys.has(sessionSaveInFlight.current.key)) || Boolean(current.session && hasUncertainSave('session', current.session.id))))
      || (includeExercise && (hasUnsavedExercise() || exerciseSaveTimer.current !== null || Boolean(exerciseSaveInFlight.current && !discardKeys.has(exerciseSaveInFlight.current.key)) || Boolean(current.exercise && hasUncertainSave('exercise', current.exercise.id))))
      || Boolean(weekSaveInFlight.current && !discardKeys.has(weekSaveInFlight.current.key))
      || Boolean(sessionSaveInFlight.current && !discardKeys.has(sessionSaveInFlight.current.key))
      || Boolean(exerciseSaveInFlight.current && !discardKeys.has(exerciseSaveInFlight.current.key))
      || draftReconciliationInFlight.current !== null
    )
  }, [draftIdentity, hasUncertainSave, hasUnsavedExercise, hasUnsavedSession, hasUnsavedWeek])
  const clearSaveTimers = useCallback(() => {
    for (const timer of [weekSaveTimer, sessionSaveTimer, exerciseSaveTimer]) {
      if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
    }
  }, [])
  const markSaveStatusIfSettled = useCallback(() => {
    if (!hasPendingCurrentChanges()) setSaveStatus('saved')
  }, [hasPendingCurrentChanges])
  const verifyRemoteAfterSaveError = useCallback(async (reason: unknown, fallbackError: string) => {
    const operationError = reason instanceof Error ? reason.message : fallbackError
    try {
      const remoteData = await loadProgramBuilder(profile)
      inspectLocalDrafts(remoteData)
      return `${operationError} L’esito della scrittura non è confermato: lo stato remoto è stato riletto e la bozza locale resta da riconciliare.`
    } catch (verificationReason) {
      inspectLocalDrafts(null, verificationReason)
      const verificationError = verificationReason instanceof Error ? verificationReason.message : 'verifica remota non disponibile'
      return `${operationError} Impossibile verificare lo stato remoto: ${verificationError}. La bozza locale è stata conservata.`
    }
  }, [inspectLocalDrafts, profile])
  const runQueuedSave = useCallback(async (slot: SaveSlot, uncertaintyKey: string, serialized: string, isAlreadySaved: () => boolean, operation: () => Promise<void>, onSaved: () => void, fallbackError: string) => {
    while (slot.current) {
      if (!(await slot.current.promise)) return false
    }
    if (!uncertainSaveKeys.current.has(uncertaintyKey) && isAlreadySaved()) {
      onSaved()
      return true
    }

    setSaveStatus('saving')
    const operationPromise = (async () => {
      try {
        await operation()
        uncertainSaveKeys.current.delete(uncertaintyKey)
        onSaved()
        return true
      } catch (reason) {
        uncertainSaveKeys.current.add(uncertaintyKey)
        setError(await verifyRemoteAfterSaveError(reason, fallbackError))
        setSaveStatus('error')
        return false
      }
    })()
    const trackedPromise = operationPromise.finally(() => {
      if (slot.current?.promise === trackedPromise) slot.current = null
    })
    slot.current = { key: uncertaintyKey, serialized, promise: trackedPromise }
    return trackedPromise
  }, [verifyRemoteAfterSaveError])
  const persistWeekSnapshot = useCallback((week: ProgramBuilderData['weeks'][number], snapshot: WeekDetails, options: { identity?: BuilderDraftIdentity; force?: boolean } = {}) => {
    const serialized = JSON.stringify(snapshot)
    const identity = options.identity ?? draftIdentity('week', week.id, week.programId)
    const uncertaintyKey = builderLocalDraftKey(identity)
    const localRevision = localRevisionForSnapshot(identity, serialized)
    return runQueuedSave(
      weekSaveInFlight,
      uncertaintyKey,
      serialized,
      () => !options.force && hydratedWeek.current === week.id && hydratedWeekValue.current === serialized,
      () => updateWeekDetails(profile, week.id, snapshot.blockName, snapshot.phase, snapshot.loadType, snapshot.notes),
      () => {
        if (hydratedWeek.current === week.id) hydratedWeekValue.current = serialized
        updateLoadedData(current => ({ ...current, weeks: current.weeks.map(item => item.id === week.id ? { ...item, blockName: snapshot.blockName, phase: snapshot.phase, loadType: snapshot.loadType, notes: snapshot.notes } : item) }))
        acknowledgeLocalRevision(identity, localRevision)
      },
      'Settimana non salvata.',
    )
  }, [acknowledgeLocalRevision, draftIdentity, localRevisionForSnapshot, profile, runQueuedSave, updateLoadedData])
  const persistSessionSnapshot = useCallback((currentSession: ProgramBuilderData['sessions'][number], snapshot: SessionDetails, options: { identity?: BuilderDraftIdentity; force?: boolean } = {}) => {
    const serialized = JSON.stringify(snapshot)
    if (!snapshot.title.trim()) {
      setError('Inserisci un titolo per la sessione.')
      setSaveStatus('error')
      return Promise.resolve(false)
    }
    const identity = options.identity ?? draftIdentity('session', currentSession.id)
    const uncertaintyKey = builderLocalDraftKey(identity)
    const localRevision = localRevisionForSnapshot(identity, serialized)
    return runQueuedSave(
      sessionSaveInFlight,
      uncertaintyKey,
      serialized,
      () => !options.force && hydratedSession.current === currentSession.id && hydratedSessionValue.current === serialized,
      () => updateSessionDetails(profile, currentSession.id, snapshot.title, snapshot.objective, snapshot.durationMinutes, snapshot.scheduledDay),
      () => {
        if (hydratedSession.current === currentSession.id) hydratedSessionValue.current = serialized
        updateLoadedData(current => ({ ...current, sessions: current.sessions.map(item => item.id === currentSession.id ? { ...item, title: snapshot.title, objective: snapshot.objective, durationMinutes: snapshot.durationMinutes, scheduledDay: snapshot.scheduledDay } : item) }))
        acknowledgeLocalRevision(identity, localRevision)
      },
      'Sessione non salvata.',
    )
  }, [acknowledgeLocalRevision, draftIdentity, localRevisionForSnapshot, profile, runQueuedSave, updateLoadedData])
  const persistExerciseSnapshot = useCallback((currentExercise: ProgramBuilderData['exercises'][number], snapshot: ExercisePatch, options: { identity?: BuilderDraftIdentity; force?: boolean } = {}) => {
    const serialized = JSON.stringify(snapshot)
    const identity = options.identity ?? draftIdentity('exercise', currentExercise.id)
    const uncertaintyKey = builderLocalDraftKey(identity)
    const localRevision = localRevisionForSnapshot(identity, serialized)
    return runQueuedSave(
      exerciseSaveInFlight,
      uncertaintyKey,
      serialized,
      () => !options.force && hydratedExercise.current === currentExercise.id && hydratedExerciseValue.current === serialized,
      () => updateExercise(profile, currentExercise.id, currentExercise.prescription, snapshot),
      () => {
        if (hydratedExercise.current === currentExercise.id) hydratedExerciseValue.current = serialized
        updateLoadedData(current => ({ ...current, exercises: current.exercises.map(item => item.id === currentExercise.id ? {
          ...item,
          prescription: mergePrescriptionForUpdate(currentExercise.prescription, snapshot),
          targetRpeMin: Math.max(0, snapshot.rpe - 1),
          targetRpeMax: snapshot.rpe,
          restSeconds: snapshot.restSeconds,
          instructions: snapshot.instructions,
        } : item) }))
        acknowledgeLocalRevision(identity, localRevision)
      },
      'Esercizio non salvato.',
    )
  }, [acknowledgeLocalRevision, draftIdentity, localRevisionForSnapshot, profile, runQueuedSave, updateLoadedData])
  const persistRecoveredDraft = useCallback(async (plan: BuilderDraftRecoveryPlan, remoteData: ProgramBuilderData, allowConflict = false) => {
    if ((plan.comparison.status !== 'recoverable' && !(allowConflict && plan.comparison.status === 'conflict')) || !plan.mergedValues) return false
    const draft = plan.comparison.draft
    const identity: BuilderDraftIdentity = {
      userId: draft.userId,
      programId: draft.programId,
      entityType: draft.entityType,
      entityId: draft.entityId,
    }
    const key = builderLocalDraftKey(identity)
    const claim = claimBuilderLocalDraftRevision(identity, draft.revision, draft.generationId ?? null)
    if (!claim.ok) {
      updateLocalDraftWarning(key, claim.error)
      return false
    }
    if (!claim.claimed) return false

    const claimedPlan = planBuilderLocalDraftRecovery(claim.draft, remoteData)
    if ((claimedPlan.comparison.status !== 'recoverable' && !(allowConflict && claimedPlan.comparison.status === 'conflict')) || !claimedPlan.mergedValues) return false
    const serialized = JSON.stringify(claimedPlan.mergedValues)
    localDraftRevisions.current.set(key, { generationId: claim.draft.generationId, revision: claim.draft.revision, serialized })
    recoveredDraftValues.current.set(key, claimedPlan.mergedValues)
    setRecoveryEpoch(value => value + 1)
    setSaveStatus('saving')
    setError('')

    if (draft.entityType === 'week') {
      const week = remoteData.weeks.find(item => item.id === draft.entityId && item.programId === draft.programId)
      return week ? persistWeekSnapshot(week, claimedPlan.mergedValues as WeekDetails, { identity, force: true }) : false
    }
    if (draft.entityType === 'session') {
      const currentSession = remoteData.sessions.find(item => item.id === draft.entityId)
      const week = currentSession ? remoteData.weeks.find(item => item.id === currentSession.weekId && item.programId === draft.programId) : null
      return currentSession && week ? persistSessionSnapshot(currentSession, claimedPlan.mergedValues as SessionDetails, { identity, force: true }) : false
    }
    const currentExercise = remoteData.exercises.find(item => item.id === draft.entityId)
    const currentSession = currentExercise ? remoteData.sessions.find(item => item.id === currentExercise.sessionId) : null
    const week = currentSession ? remoteData.weeks.find(item => item.id === currentSession.weekId && item.programId === draft.programId) : null
    return currentExercise && currentSession && week
      ? persistExerciseSnapshot(currentExercise, claimedPlan.mergedValues as unknown as ExercisePatch, { identity, force: true })
      : false
  }, [persistExerciseSnapshot, persistSessionSnapshot, persistWeekSnapshot, updateLocalDraftWarning])
  const reconcileLocalDrafts = useCallback(async (remoteData: ProgramBuilderData) => {
    const scan = scanBuilderLocalDrafts(profile.userId)
    if (!scan.ok) {
      inspectLocalDrafts(remoteData)
      return false
    }

    let allSafeDraftsHandled = true
    for (const draft of scan.drafts) {
      const plan = planBuilderLocalDraftRecovery(draft, remoteData)
      const identity: BuilderDraftIdentity = {
        userId: draft.userId,
        programId: draft.programId,
        entityType: draft.entityType,
        entityId: draft.entityId,
      }
      const key = builderLocalDraftKey(identity)
      if (plan.comparison.status === 'already-synced') {
        const cleared = clearBuilderLocalDraftRevision(identity, draft.revision, undefined, draft.generationId ?? null)
        if (!cleared.ok) {
          updateLocalDraftWarning(key, cleared.error)
          allSafeDraftsHandled = false
        } else if (cleared.cleared) {
          localDraftRevisions.current.delete(key)
          recoveredDraftValues.current.delete(key)
          uncertainSaveKeys.current.delete(key)
          updateLocalDraftWarning(key)
        } else {
          allSafeDraftsHandled = false
        }
        continue
      }
      if (plan.comparison.status === 'recoverable') {
        if (!(await persistRecoveredDraft(plan, remoteData))) allSafeDraftsHandled = false
      }
    }

    inspectLocalDrafts(remoteData)
    markSaveStatusIfSettled()
    return allSafeDraftsHandled
  }, [inspectLocalDrafts, markSaveStatusIfSettled, persistRecoveredDraft, profile.userId, updateLocalDraftWarning])
  const startDraftReconciliation = useCallback((remoteData: ProgramBuilderData) => {
    if (draftReconciliationInFlight.current) return draftReconciliationInFlight.current
    const task = reconcileLocalDrafts(remoteData).catch(reason => {
      inspectLocalDrafts(null, reason)
      setError(reason instanceof Error ? reason.message : 'Recupero delle modifiche locali non completato.')
      setSaveStatus('error')
      return false
    })
    draftReconciliationInFlight.current = task
    void task.finally(() => {
      if (draftReconciliationInFlight.current === task) draftReconciliationInFlight.current = null
      markSaveStatusIfSettled()
    })
    return task
  }, [inspectLocalDrafts, markSaveStatusIfSettled, reconcileLocalDrafts])
  useEffect(() => {
    if (!reconciliationRequest || handledReconciliation.current === reconciliationRequest.id) return
    handledReconciliation.current = reconciliationRequest.id
    void startDraftReconciliation(reconciliationRequest.data)
  }, [reconciliationRequest, startDraftReconciliation])
  const flushPendingChanges = useCallback(async (discardKeys: ReadonlySet<string> = new Set()) => {
    while (true) {
      clearSaveTimers()
      if (draftReconciliationInFlight.current) {
        if (!(await draftReconciliationInFlight.current)) return false
        continue
      }
      for (const slot of [weekSaveInFlight, sessionSaveInFlight, exerciseSaveInFlight]) {
        while (slot.current) {
          const pending = slot.current
          if (!(await pending.promise) && !discardKeys.has(pending.key)) return false
        }
      }
      const currentWeek = currentSelectionRef.current.week
      const currentWeekKey = currentWeek ? builderLocalDraftKey(draftIdentity('week', currentWeek.id, currentWeek.programId)) : ''
      if (currentWeek && !discardKeys.has(currentWeekKey) && (hasUnsavedWeek() || hasUncertainSave('week', currentWeek.id))) {
        if (!(await persistWeekSnapshot(currentWeek, { ...weekDetailsRef.current }))) return false
      }

      const currentSession = currentSelectionRef.current.session
      const currentSessionKey = currentSession ? builderLocalDraftKey(draftIdentity('session', currentSession.id)) : ''
      if (currentSession && !discardKeys.has(currentSessionKey) && (hasUnsavedSession() || hasUncertainSave('session', currentSession.id))) {
        if (!(await persistSessionSnapshot(currentSession, { ...sessionDetailsRef.current }))) return false
      }

      const currentExercise = currentSelectionRef.current.exercise
      const currentExerciseKey = currentExercise ? builderLocalDraftKey(draftIdentity('exercise', currentExercise.id)) : ''
      if (currentExercise && !discardKeys.has(currentExerciseKey) && (hasUnsavedExercise() || hasUncertainSave('exercise', currentExercise.id))) {
        const currentPatch = patchRef.current
        if (!(await persistExerciseSnapshot(currentExercise, { ...currentPatch, steps: currentPatch.steps.map(step => ({ ...step })) }))) return false
      }

      if (!hasPendingCurrentChanges(discardKeys)) return true
    }
  }, [clearSaveTimers, draftIdentity, hasPendingCurrentChanges, hasUncertainSave, hasUnsavedExercise, hasUnsavedSession, hasUnsavedWeek, persistExerciseSnapshot, persistSessionSnapshot, persistWeekSnapshot])
  const runAfterSaving = useCallback(async (action: () => void | Promise<void>, options: { busy?: boolean; fallbackError?: string; discardDraftKeys?: ReadonlySet<string> } = {}) => {
    if (navigationSaveInProgress.current) return false
    navigationSaveInProgress.current = true
    const discardDraftKeys = options.discardDraftKeys ?? new Set<string>()
    const hasPendingChanges = hasPendingCurrentChanges()
    const hasPendingChangesToSave = hasPendingCurrentChanges(discardDraftKeys)
    const needsFlush = hasPendingChanges || discardDraftKeys.size > 0
    if (hasPendingChanges || options.busy) setState('saving')
    if (hasPendingChangesToSave) setSaveStatus('saving')
    setError(''); setMessage('')
    try {
      if (needsFlush) {
        if (!(await flushPendingChanges(discardDraftKeys))) return false
        if (hasPendingChangesToSave) setSaveStatus('saved')
      }
      await action()
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : options.fallbackError ?? 'Operazione non completata.')
      if (discardDraftKeys.size > 0 && hasPendingCurrentChanges()) setSaveStatus('error')
      return false
    } finally {
      navigationSaveInProgress.current = false
      if (hasPendingChanges || options.busy) setState('idle')
    }
  }, [flushPendingChanges, hasPendingCurrentChanges])

  const recheckLocalDrafts = useCallback(async () => {
    if (draftResolutionInProgress.current) return
    draftResolutionInProgress.current = true
    setError('')
    try {
      const remoteData = await loadProgramBuilder(profile)
      await startDraftReconciliation(remoteData)
    } catch (reason) {
      inspectLocalDrafts(null, reason)
      setError(reason instanceof Error ? reason.message : 'Verifica remota delle bozze non riuscita.')
    } finally {
      draftResolutionInProgress.current = false
    }
  }, [inspectLocalDrafts, profile, startDraftReconciliation])

  const useLocalDraft = useCallback(async (previousComparison: BuilderDraftComparison) => {
    if (draftResolutionInProgress.current) return
    draftResolutionInProgress.current = true
    setState('saving')
    setSaveStatus('saving')
    setError('')
    try {
      const draft = previousComparison.draft
      const identity: BuilderDraftIdentity = {
        userId: draft.userId,
        programId: draft.programId,
        entityType: draft.entityType,
        entityId: draft.entityId,
      }
      const currentDraft = readBuilderLocalDraft(identity)
      if (
        !currentDraft
        || currentDraft.revision !== draft.revision
        || (currentDraft.generationId ?? null) !== (draft.generationId ?? null)
      ) {
        setError('La bozza locale è cambiata. Ricontrolla i valori prima di scegliere quale versione usare.')
        inspectLocalDrafts(loadedData.current)
        return
      }

      const remoteData = await loadProgramBuilder(profile)
      const nextComparison = compareBuilderLocalDraft(currentDraft, remoteData)
      const remoteChangedAgain = previousComparison.fields.some(previousField => {
        const nextField = nextComparison.fields.find(field => field.field === previousField.field)
        return !nextField || !builderDraftValuesMatch(previousField.remoteCurrent, nextField.remoteCurrent)
      })
      if (remoteChangedAgain) {
        inspectLocalDrafts(remoteData)
        setError('La versione online è cambiata di nuovo. I valori sono stati ricontrollati: scegli dopo averli riletti.')
        return
      }

      const saved = await persistRecoveredDraft(planBuilderLocalDraftRecovery(currentDraft, remoteData), remoteData, true)
      if (!saved) return
      inspectLocalDrafts(remoteData)
      markSaveStatusIfSettled()
    } catch (reason) {
      inspectLocalDrafts(null, reason)
      setError(reason instanceof Error ? reason.message : 'Modifiche locali non salvate.')
      setSaveStatus('error')
    } finally {
      draftResolutionInProgress.current = false
      setState('idle')
    }
  }, [inspectLocalDrafts, markSaveStatusIfSettled, persistRecoveredDraft, profile])

  const confirmKeepOnlineDraft = useCallback(() => {
    const previousComparison = discardDraftTarget
    if (!previousComparison || draftResolutionInProgress.current) return
    setDiscardDraftTarget(null)
    draftResolutionInProgress.current = true
    setState('saving')
    setError('')
    void (async () => {
      try {
        const draft = previousComparison.draft
        const identity: BuilderDraftIdentity = {
          userId: draft.userId,
          programId: draft.programId,
          entityType: draft.entityType,
          entityId: draft.entityId,
        }
        const remoteData = await loadProgramBuilder(profile)
        const currentDraft = readBuilderLocalDraft(identity)
        if (
          !currentDraft
          || currentDraft.revision !== draft.revision
          || (currentDraft.generationId ?? null) !== (draft.generationId ?? null)
        ) {
          setError('La bozza locale è cambiata e non è stata eliminata. Ricontrolla i valori.')
          inspectLocalDrafts(remoteData)
          return
        }
        const cleared = clearBuilderLocalDraftRevision(identity, draft.revision, undefined, draft.generationId ?? null)
        if (!cleared.ok) {
          setError(cleared.error)
          return
        }
        if (!cleared.cleared) {
          setError('La bozza locale è cambiata e non è stata eliminata. Ricontrolla i valori.')
          inspectLocalDrafts(remoteData)
          return
        }
        const key = builderLocalDraftKey(identity)
        localDraftRevisions.current.delete(key)
        recoveredDraftValues.current.delete(key)
        uncertainSaveKeys.current.delete(key)
        loadedData.current = remoteData
        setData(remoteData)
        await startDraftReconciliation(remoteData)
        setMessage('Versione online mantenuta.')
        markSaveStatusIfSettled()
      } catch (reason) {
        inspectLocalDrafts(null, reason)
        setError(reason instanceof Error ? reason.message : 'Versione online non verificata; la bozza locale è stata conservata.')
      } finally {
        draftResolutionInProgress.current = false
        setState('idle')
      }
    })()
  }, [discardDraftTarget, inspectLocalDrafts, markSaveStatusIfSettled, profile, startDraftReconciliation])

  const flushBeforeExternalNavigation = useCallback(() => runAfterSaving(() => undefined), [runAfterSaving])
  useEffect(() => {
    if (!registerNavigationGuard) return
    registerNavigationGuard(flushBeforeExternalNavigation)
    return () => registerNavigationGuard(null)
  }, [flushBeforeExternalNavigation, registerNavigationGuard])

  useEffect(() => {
    if (hydratedWeek.current === weekId && JSON.stringify(weekDetailsRef.current) !== hydratedWeekValue.current) return
    const week = weeks.find(item => item.id === weekId)
    const remote = { blockName: week?.blockName ?? '', phase: week?.phase ?? '', loadType: week?.loadType ?? 'load' as 'load' | 'deload', notes: week?.notes ?? '' }
    const recovered = week ? recoveredDraftValues.current.get(builderLocalDraftKey(draftIdentity('week', week.id, week.programId))) as WeekDetails | undefined : undefined
    const next = recovered ?? remote
    hydratingWeek.current = true
    hydratedWeek.current = weekId
    hydratedWeekValue.current = JSON.stringify(remote)
    weekDetailsRef.current = next
    setWeekDetails(next)
  }, [draftIdentity, recoveryEpoch, weekId, selectedWeek?.blockName, selectedWeek?.phase, selectedWeek?.loadType, selectedWeek?.notes])
  useEffect(() => {
    if (hydratedSession.current === sessionId && JSON.stringify(sessionDetailsRef.current) !== hydratedSessionValue.current) return
    const remote = { title: session?.title ?? '', objective: session?.objective ?? '', durationMinutes: session?.durationMinutes ?? 0, scheduledDay: session?.scheduledDay ?? 1 }
    const currentWeek = session ? data?.weeks.find(item => item.id === session.weekId) : null
    const recovered = session && currentWeek ? recoveredDraftValues.current.get(builderLocalDraftKey(draftIdentity('session', session.id, currentWeek.programId))) as SessionDetails | undefined : undefined
    const next = recovered ?? remote
    hydratingSession.current = true
    hydratedSession.current = sessionId
    hydratedSessionValue.current = JSON.stringify(remote)
    sessionDetailsRef.current = next
    setSessionDetails(next)
  }, [data?.weeks, draftIdentity, recoveryEpoch, sessionId, session?.title, session?.objective, session?.durationMinutes, session?.scheduledDay])

  useEffect(() => {
    if (!exercise) return
    if (hydratedExercise.current === exercise.id && JSON.stringify(patchRef.current) !== hydratedExerciseValue.current) return
    const values = readPrescriptionEditorValues(exercise.prescription)
    const remote = { sets: values.sets, reps: values.reps, seconds: values.seconds, loadKg: values.loadKg, rpe: exercise.targetRpeMax ?? 7, restSeconds: resolveTimerRestSeconds(exercise.prescription, exercise.restSeconds, 120) ?? 0, instructions: exercise.instructions ?? '', steps: values.steps }
    const currentSession = data?.sessions.find(item => item.id === exercise.sessionId)
    const currentWeek = currentSession ? data?.weeks.find(item => item.id === currentSession.weekId) : null
    const recovered = currentWeek ? recoveredDraftValues.current.get(builderLocalDraftKey(draftIdentity('exercise', exercise.id, currentWeek.programId))) as ExercisePatch | undefined : undefined
    const next = recovered ?? remote
    hydratingExercise.current = true
    hydratedExercise.current = exercise.id
    hydratedExerciseValue.current = JSON.stringify(remote)
    patchRef.current = next
    setPatch(next)
  }, [data?.sessions, data?.weeks, draftIdentity, exerciseId, exercise?.prescription, exercise?.targetRpeMax, exercise?.restSeconds, exercise?.instructions, recoveryEpoch])

  useEffect(() => {
    const serialized = JSON.stringify(weekDetails)
    if (hydratingWeek.current) { hydratingWeek.current = false; return }
    if (!weekId || hydratedWeek.current !== weekId || (serialized === hydratedWeekValue.current && (!weekSaveInFlight.current || weekSaveInFlight.current.serialized === serialized))) return
    const currentWeek = selectedWeek
    if (!currentWeek) return
    setSaveStatus('saving'); setError('')
    const snapshot = { ...weekDetails }
    const timer = window.setTimeout(() => {
      if (weekSaveTimer.current === timer) weekSaveTimer.current = null
      void persistWeekSnapshot(currentWeek, snapshot).then(success => { if (success) markSaveStatusIfSettled() })
    }, 700)
    weekSaveTimer.current = timer
    return () => { window.clearTimeout(timer); if (weekSaveTimer.current === timer) weekSaveTimer.current = null }
  }, [markSaveStatusIfSettled, persistWeekSnapshot, selectedWeek, weekDetails, weekId])
  useEffect(() => {
    const serialized = JSON.stringify(sessionDetails)
    if (hydratingSession.current) { hydratingSession.current = false; return }
    if (!sessionId || hydratedSession.current !== sessionId || (serialized === hydratedSessionValue.current && (!sessionSaveInFlight.current || sessionSaveInFlight.current.serialized === serialized)) || !sessionDetails.title.trim()) return
    const currentSession = session
    if (!currentSession) return
    setSaveStatus('saving'); setError('')
    const snapshot = { ...sessionDetails }
    const timer = window.setTimeout(() => {
      if (sessionSaveTimer.current === timer) sessionSaveTimer.current = null
      void persistSessionSnapshot(currentSession, snapshot).then(success => { if (success) markSaveStatusIfSettled() })
    }, 700)
    sessionSaveTimer.current = timer
    return () => { window.clearTimeout(timer); if (sessionSaveTimer.current === timer) sessionSaveTimer.current = null }
  }, [markSaveStatusIfSettled, persistSessionSnapshot, session, sessionDetails, sessionId])
  useEffect(() => {
    const serialized = JSON.stringify(patch)
    if (hydratingExercise.current) { hydratingExercise.current = false; return }
    if (!exercise || hydratedExercise.current !== exercise.id || (serialized === hydratedExerciseValue.current && (!exerciseSaveInFlight.current || exerciseSaveInFlight.current.serialized === serialized))) return
    setSaveStatus('saving'); setError('')
    const snapshot = { ...patch, steps: patch.steps.map(step => ({ ...step })) }
    const timer = window.setTimeout(() => {
      if (exerciseSaveTimer.current === timer) exerciseSaveTimer.current = null
      void persistExerciseSnapshot(exercise, snapshot).then(success => { if (success) markSaveStatusIfSettled() })
    }, 700)
    exerciseSaveTimer.current = timer
    return () => { window.clearTimeout(timer); if (exerciseSaveTimer.current === timer) exerciseSaveTimer.current = null }
  }, [exercise, markSaveStatusIfSettled, patch, persistExerciseSnapshot])

  const run = async <T,>(operation: () => Promise<T>, success: string, onSuccess?: (result: T) => void) => {
    setState('saving'); setError(''); setMessage('')
    try { const result = await operation(); await refresh(); onSuccess?.(result); setMessage(success) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Operazione non completata.') } finally { setState('idle') }
  }
  const saveExerciseChanges = async () => {
    if (!exercise || (!exerciseHasUnsavedChanges && !exerciseSaveInFlight.current)) return true
    if (exerciseSaveTimer.current !== null) { window.clearTimeout(exerciseSaveTimer.current); exerciseSaveTimer.current = null }
    const snapshot = { ...patch, steps: patch.steps.map(step => ({ ...step })) }
    setState('saving'); setSaveStatus('saving'); setError(''); setMessage('')
    try {
      const saved = await persistExerciseSnapshot(exercise, snapshot)
      if (saved) {
        markSaveStatusIfSettled()
        setMessage('Modifiche esercizio salvate.')
      }
      return saved
    } finally {
      setState('idle')
    }
  }
  const chooseExercise = async (nextExerciseId: string) => {
    if (nextExerciseId === exerciseId) {
      setExerciseEditorOpen(current => !current)
      return
    }
    await runAfterSaving(() => {
      setExerciseId(nextExerciseId)
      setExerciseEditorOpen(true)
    })
  }
  const submitProgram = (event: FormEvent) => {
    event.preventDefault()
    if (!athleteId || !newProgram.name.trim()) return
    void run(() => createProgram(profile, athleteId, newProgram.name, newProgram.goal, newProgram.programType), 'Bozza creata. Ora aggiungi una settimana.', id => { setProgramId(id); setCreatingProgram(false); setNewProgram({ name: '', goal: '', programType: 'athlete' }); try { window.localStorage.removeItem(draftKey) } catch { /* ignore */ } })
  }
  const saveDraft = () => {
    if (!program || program.status !== 'draft') return
    void runAfterSaving(() => setMessage('Bozza salvata.'))
  }
  const chooseWeek = async (nextWeekId: string) => {
    if (nextWeekId === weekId) { setWeekSettingsOpen(false); return }
    await runAfterSaving(() => { setWeekId(nextWeekId); setWeekSettingsOpen(false) })
  }
  const chooseSession = async (nextSessionId: string) => {
    if (nextSessionId === sessionId) return
    await runAfterSaving(() => setSessionId(nextSessionId))
  }
  const refreshAfterConfirmedCreation = async <T,>(
    operation: () => Promise<T>,
    isPresent: (next: ProgramBuilderData, result: T) => boolean,
    onSuccess: (result: T) => void,
    successMessage: string,
    refreshErrorMessage: string,
  ) => {
    const result = await operation()
    let next: ProgramBuilderData
    try {
      next = await refresh()
    } catch (reason) {
      const detail = reason instanceof Error ? ` ${reason.message}` : ''
      setError(`${refreshErrorMessage} L'operazione è già stata confermata: aggiorna i dati prima di riprovare.${detail}`)
      return
    }
    if (!isPresent(next, result)) {
      setError(`${refreshErrorMessage} L'operazione è già stata confermata: aggiorna i dati prima di riprovare.`)
      return
    }
    if (!(await flushPendingChanges())) {
      setError(current => `${current || 'Modifiche non salvate.'} L'operazione è già stata confermata: aggiorna i dati prima di riprovare.`)
      return
    }
    setSaveStatus('saved')
    onSuccess(result)
    setMessage(successMessage)
  }
  const addWeek = () => void runAfterSaving(
    () => refreshAfterConfirmedCreation(
      () => createWeek(profile, programId, weeks.map(week => week.weekNumber)),
      (next, id) => next.weeks.some(item => item.id === id),
      id => setWeekId(id),
      'Settimana aggiunta senza modificare le precedenti.',
      'La settimana è stata creata, ma il programma aggiornato non è disponibile.',
    ),
    { busy: true, fallbackError: 'Settimana non creata.' },
  )
  const duplicateSelectedWeek = () => {
    const sourceWeek = weeks.find(item => item.id === weekId)
    if (!sourceWeek) return
    void runAfterSaving(
      () => refreshAfterConfirmedCreation(
        () => duplicateWeek(profile, sourceWeek.id),
        (next, id) => next.weeks.some(item => item.id === id),
        id => {
          setWeekId(id)
          setWeekSettingsOpen(false)
          window.requestAnimationFrame(() => document.getElementById(`builder-week-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }))
        },
        `Copia della settimana ${sourceWeek.weekNumber} pronta.`,
        'La copia è stata creata, ma il programma aggiornato non è disponibile.',
      ),
      { busy: true, fallbackError: 'Duplicazione non completata.' },
    )
  }
  const addSession = () => void runAfterSaving(
    () => refreshAfterConfirmedCreation(
      () => createSession(profile, weekId, sessions.map(item => item.order)),
      (next, id) => next.sessions.some(item => item.id === id),
      id => setSessionId(id),
      'Sessione aggiunta.',
      'La sessione è stata creata, ma il programma aggiornato non è disponibile.',
    ),
    { busy: true, fallbackError: 'Sessione non creata.' },
  )
  const openPrograms = () => void runAfterSaving(() => setShowBuilder(false))
  const openProgram = (nextProgramId: string, nextAthleteId: string) => void runAfterSaving(() => {
    setAthleteId(nextAthleteId)
    setSelectedAthleteId(nextAthleteId)
    setProgramId(nextProgramId)
    setCreatingProgram(false)
    setShowBuilder(true)
  })
  const chooseAthlete = (nextAthleteId: string) => void runAfterSaving(() => {
    setAthleteId(nextAthleteId)
    setSelectedAthleteId(nextAthleteId)
  })
  const submitExercise = (event: FormEvent) => {
    event.preventDefault()
    const libraryExercise = data?.library.find(item => item.id === libraryId)
    if (!sessionId || (!libraryExercise && !newExercise.trim())) return
    void runAfterSaving(
      () => refreshAfterConfirmedCreation(
        () => addExercise(profile, sessionId, exercises.map(item => item.order), newExercise, libraryExercise),
        (next, id) => next.exercises.some(item => item.id === id),
        id => { setExerciseId(id); setNewExercise(''); setLibraryId('') },
        'Esercizio aggiunto alla sessione.',
        "L'esercizio è stato aggiunto, ma il programma aggiornato non è disponibile.",
      ),
      { busy: true, fallbackError: 'Esercizio non aggiunto.' },
    )
  }
  const discardDeletedDrafts = useCallback((identities: BuilderDraftIdentity[]) => {
    let storageError = ''
    for (const identity of identities) {
      const key = builderLocalDraftKey(identity)
      const draft = readBuilderLocalDraft(identity)
      if (draft) {
        const cleared = clearBuilderLocalDraftRevision(identity, draft.revision, undefined, draft.generationId ?? null)
        if (!cleared.ok) storageError = cleared.error
        else if (!cleared.cleared) storageError = 'La bozza locale eliminata è cambiata durante la conferma e non è stata rimossa.'
      }
      localDraftRevisions.current.delete(key)
      recoveredDraftValues.current.delete(key)
      uncertainSaveKeys.current.delete(key)
      if (!storageError) updateLocalDraftWarning(key)
    }
    inspectLocalDrafts(loadedData.current)
    return storageError
  }, [inspectLocalDrafts, updateLocalDraftWarning])
  const confirmDelete = () => {
    const target = deleteTarget
    const currentData = loadedData.current
    if (!target || !currentData) return
    const discardedDraftIdentities = draftIdentitiesForDelete(target, currentData, profile.userId, programId)
    const discardedDraftKeys = new Set(discardedDraftIdentities.map(builderLocalDraftKey))
    const successMessage = target.kind === 'block'
      ? 'Blocco eliminato e numerazione aggiornata.'
      : target.kind === 'week'
        ? 'Settimana eliminata e numerazione aggiornata.'
        : `${target.kind === 'program' ? 'Programma' : target.kind === 'exercise' ? 'Esercizio' : 'Sessione'} eliminat${target.kind === 'program' || target.kind === 'exercise' ? 'o' : 'a'}.`

    void runAfterSaving(async () => {
      if (target.kind === 'block') await Promise.all(target.weekIds.map(id => deleteWeek(profile, id)))
      else if (target.kind === 'program') await deleteProgram(profile, target.id)
      else if (target.kind === 'week') await deleteWeek(profile, target.id)
      else if (target.kind === 'exercise') await deleteExercise(profile, target.id)
      else await deleteSession(profile, target.id)

      const followupSaved = await flushPendingChanges(discardedDraftKeys)
      const draftDiscardError = discardDeletedDrafts(discardedDraftIdentities)
      if (target.kind === 'block' && target.weekIds.includes(weekId)) setWeekId('')
      else if (target.kind === 'program') {
        setProgramId(''); setWeekId(''); setSessionId(''); setExerciseId(''); setCreatingProgram(false); setShowBuilder(false)
      } else if (target.kind === 'week' && target.id === weekId) setWeekId('')
      else if (target.kind === 'exercise' && target.id === exerciseId) { setExerciseId(''); setExerciseEditorOpen(false) }
      else if (target.kind === 'session' && target.id === sessionId) setSessionId('')
      setDeleteTarget(null)

      if (!followupSaved) {
        setError("L'eliminazione è stata confermata, ma una modifica effettuata durante l'operazione non è stata salvata. I dati non sono stati ricaricati per conservarla nell'editor.")
        return
      }
      try {
        await refresh()
      } catch (reason) {
        const detail = reason instanceof Error ? ` ${reason.message}` : ''
        setError(`L'eliminazione è stata confermata, ma i dati aggiornati non sono disponibili. Riapri il builder prima di riprovare.${detail}`)
        return
      }
      if (draftDiscardError) {
        setError(`L'eliminazione è stata confermata, ma la bozza locale non è stata rimossa. ${draftDiscardError}`)
        return
      }
      setError('')
      markSaveStatusIfSettled()
      setMessage(successMessage)
    }, { busy: true, fallbackError: 'Eliminazione non completata.', discardDraftKeys: discardedDraftKeys })
  }
  const applyExerciseLoadAdjustment = () => {
    if (!exercise) return
    const percentage = safeExerciseLoadPercentage
    if (!Number.isFinite(percentage) || percentage < -100) { setError('La variazione del carico non può essere inferiore a -100%.'); return }
    if (testTargetLoadAdjustment.current) {
      setState('saving'); setError(''); setMessage('')
      void testTargetLoadAdjustment.current(percentage).then(() => {
        setExerciseLoadPercentages(value => ({ ...value, [exercise.id]: 0 }))
        setMessage(`Variazione del ${Math.abs(percentage)}% applicata alle percentuali di tutte le serie.`)
      }).catch(reason => setError(reason instanceof Error ? reason.message : 'Variazione del carico non salvata.')).finally(() => setState('idle'))
      return
    }
    const current = readPrescriptionEditorValues(exercise.prescription)
    const adjustment = describePrescriptionLoadAdjustment(exercise.prescription)
    if (!(current.loadKg > 0) && !current.steps.some(step => step.loadKg !== null && step.loadKg > 0)) { setError('Questo esercizio non ha carichi numerici da variare.'); return }
    setError('')
    const nextPatch = { ...patch, ...scalePrescriptionLoads(patch, percentage) }
    if (exerciseSaveTimer.current !== null) { window.clearTimeout(exerciseSaveTimer.current); exerciseSaveTimer.current = null }
    updateExerciseEditor(() => nextPatch)
    setState('saving'); setSaveStatus('saving'); setMessage('')
    void persistExerciseSnapshot(exercise, nextPatch).then(saved => {
      if (!saved) return
      setExerciseLoadPercentages(value => ({ ...value, [exercise.id]: 0 }))
      setMessage(adjustment.unscalableValues > 0
        ? `Variazione del ${Math.abs(percentage)}% applicata ai carichi numerici. Il testo storico della prescrizione non è stato modificato: verificalo manualmente.`
        : `Variazione del ${Math.abs(percentage)}% salvata.`)
      markSaveStatusIfSettled()
    }).finally(() => setState('idle'))
  }
  const addStep = () => updateExerciseEditor(value => {
    const steps = [...value.steps, { label: `Set ${value.steps.length + 1}`, reps: value.reps || 1, seconds: 0, loadKg: value.loadKg || null }]
    return { ...value, sets: steps.length, steps }
  })
  const changeStep = (index: number, next: Partial<PrescriptionStep>) => updateExerciseEditor(value => ({ ...value, steps: value.steps.map((step, row) => row === index ? { ...step, ...next } : step) }))
  const publish = () => {
    if (!data || !program || !canPublishProgram(program.id, data)) { setError('Per pubblicare servono almeno una settimana, una sessione e un esercizio.'); return }
    void runAfterSaving(async () => {
      await publishProgram(profile, program.id, program.athleteId)
      try {
        await refresh()
      } catch (reason) {
        const detail = reason instanceof Error ? ` ${reason.message}` : ''
        setError(`La pubblicazione è stata confermata, ma i dati aggiornati non sono disponibili. Riapri il builder prima di riprovare.${detail}`)
        return
      }
      setMessage('Programma pubblicato. Il precedente resta archiviato e consultabile.')
    }, { busy: true, fallbackError: 'Programma non pubblicato.' })
  }

  if (state === 'loading' && !data) return <div className="screen"><ScreenHeader eyebrow="PROGRAMMA" title="Caricamento programma" text="Aggiornamento dati in corso." /><div className="skeleton-stack"><span /><span /><span /></div></div>

  if (!showBuilder) return <ProgramsOverview data={data} onOpen={openProgram} onCreate={() => { setProgramId(''); setCreatingProgram(true); setShowBuilder(true) }} />

  const localDraftVerificationFailed = Boolean(localDraftReview && (
    localDraftReview.verificationError
    || localDraftReview.issues.length > 0
    || localDraftReview.comparisons.some(comparison => comparison.status === 'error')
  ))

  return <div className="screen coach-builder">
    <div className="coach-builder__context">
      <button type="button" className="coach-programs__back" disabled={state === 'saving'} onClick={openPrograms}><ArrowLeft size={16} /> Programmi</button>
      {!program && <label className="coach-builder__athlete-select"><span>ATLETA</span><select aria-label="Seleziona atleta" value={athleteId} onChange={event => chooseAthlete(event.target.value)} disabled={state === 'saving'}>{data?.athletes.map(athlete => <option key={athlete.id} value={athlete.id}>{athlete.name}</option>)}</select></label>}
    </div>
    {!data?.athletes.length && <Panel title="Nessun atleta attivo" index="00"><div className="empty-state"><Users size={22} /><b>Collega o riattiva un atleta</b><span>Il builder mostra soltanto le relazioni coach-atleta attive.</span></div></Panel>}
    {!!athleteId && !program && <Panel title="Crea una bozza" index="00"><form className="builder-create-form" onSubmit={submitProgram}><label><span>Nome programma</span><input className="standalone-input" value={newProgram.name} onChange={event => setNewProgram(current => ({ ...current, name: event.target.value }))} placeholder="Es. Forza dita · Autunno" required /></label><label><span>Tipo programma</span><select value={newProgram.programType} onChange={event => setNewProgram(current => ({ ...current, programType: event.target.value as 'athlete' | 'patient' }))}><option value="athlete">Programma atleta</option><option value="patient">Programma paziente</option></select></label><label><span>Obiettivo</span><input className="standalone-input" value={newProgram.goal} onChange={event => setNewProgram(current => ({ ...current, goal: event.target.value }))} placeholder="Obiettivo del blocco" /></label><button className="button button--signal" disabled={state === 'saving'}><Plus size={16} /> Crea bozza</button></form></Panel>}
    {program && <>
      <section className="coach-builder__hero">
        <BuilderMountainBackground />
        <div className="coach-builder__hero-content">
          <p>PROGRAMMA</p>
          <div className="coach-builder__hero-title"><h1>{program.name}</h1>{program.status !== 'active' && <Tag tone={program.status === 'draft' ? 'signal' : 'neutral'}>{program.status}</Tag>}</div>
          <p className="coach-builder__dates">{programDates}</p>
          <label className="coach-builder__hero-athlete"><span>ATLETA</span><select aria-label="Seleziona atleta" value={athleteId} onChange={event => chooseAthlete(event.target.value)} disabled={state === 'saving'}>{data?.athletes.map(athlete => <option key={athlete.id} value={athlete.id}>{athlete.name}</option>)}</select></label>
        </div>
        <div className="coach-builder__hero-actions">{program.status === 'draft' && <button type="button" className="button button--secondary" disabled={state === 'saving'} onClick={saveDraft}><Save size={16} /> {saveStatus === 'saving' ? 'Salvataggio…' : 'Salva bozza'}</button>}<button type="button" className="button button--primary" disabled={state === 'saving' || program.status === 'active'} onClick={publish}><Save size={16} /> {program.status === 'active' ? 'Pubblicato' : 'Pubblica programma'}</button><button type="button" className="button button--danger builder-delete-program" disabled={state === 'saving' || saveStatus === 'saving'} onClick={() => setDeleteTarget({ kind: 'program', id: program.id, name: program.name })}><Trash2 size={16} /> Elimina programma</button></div>
        <div className="coach-builder__goal"><span>◎</span><b>OBIETTIVO</b><p>{program.goal || 'Obiettivo da definire'}</p></div>
      </section>
      <div className="coach-builder__layout">
      <aside className="coach-builder__structure">
        <header><div><h2>Struttura del programma</h2><p>Blocchi, settimane e sessioni.</p></div><button type="button" disabled={state === 'saving'} onClick={addWeek}><Plus size={14} /> BLOCCO</button></header>
        {!!blocks.length && <div className="coach-builder__blocks">{blocks.map((block, index) => <div className="coach-builder__block-item" key={`${block.name}-${index}`}>
          <button type="button" disabled={state === 'saving'} className={`coach-builder__block-select ${block.weeks.some(item => item.id === weekId) ? 'active' : index === blocks.length - 1 && block.weeks.every(item => item.loadType === 'deload') ? 'deload' : ''}`} onClick={() => void chooseWeek(block.weeks[0].id)}><b>{block.name}</b><span>Sett. {block.weeks[0].weekNumber}–{block.weeks.at(-1)?.weekNumber}</span></button>
          <details className="coach-builder__action-menu"><summary aria-label={`Azioni ${block.name}`} title={`Azioni ${block.name}`}><CircleEllipsis size={17} /></summary><div role="menu"><button type="button" role="menuitem" disabled={state === 'saving'} onClick={() => setDeleteTarget({ kind: 'block', name: block.name, weekIds: block.weeks.map(item => item.id) })}><Trash2 size={14} /> Elimina blocco ({block.weeks.length} {block.weeks.length === 1 ? 'settimana' : 'settimane'})</button></div></details>
        </div>)}</div>}
        <div className="coach-builder__weeks" aria-label="Settimane del programma">
          {weeks.map(week => <button type="button" disabled={state === 'saving'} id={`builder-week-${week.id}`} className={`${week.id === weekId ? 'active' : ''} week-type--${week.loadType}`} key={week.id} onClick={() => void chooseWeek(week.id)}><b>{String(week.weekNumber).padStart(2, '0')}</b><span>{week.loadType === 'deload' ? 'SCA' : 'CAR'}</span></button>)}
        </div>
        {!weekId && <div className="empty-state"><Layers3 size={22} /><b>Aggiungi la prima settimana</b><span>Le sessioni appariranno dentro la settimana selezionata.</span></div>}
        {weekId && <>
          <section className={`coach-builder__week-head week-type--${weekDetails.loadType}`}><div><h3>Settimana {selectedWeek?.weekNumber} · {weekDetails.blockName || 'Blocco'} · <span>{weekDetails.loadType === 'deload' ? 'SCARICO' : 'CARICO'}</span></h3>{weekDetails.notes && <small>{weekDetails.notes}</small>}</div><button type="button" aria-label="Azioni settimana" onClick={() => setWeekSettingsOpen(value => !value)}><CircleEllipsis size={16} /></button></section>
          {weekSettingsOpen && <div className="coach-builder__week-settings"><div className="builder-details builder-details--week"><label><span>Nome blocco</span><input value={weekDetails.blockName} onChange={event => updateWeekEditor(value => ({ ...value, blockName: event.target.value }))} /></label><label><span>Fase</span><input value={weekDetails.phase} onChange={event => updateWeekEditor(value => ({ ...value, phase: event.target.value }))} /></label><label><span>Tipo</span><select value={weekDetails.loadType} onChange={event => updateWeekEditor(value => ({ ...value, loadType: event.target.value as 'load' | 'deload' }))}><option value="load">Carico</option><option value="deload">Scarico</option></select></label><label><span>Note / obiettivi</span><input value={weekDetails.notes} onChange={event => updateWeekEditor(value => ({ ...value, notes: event.target.value }))} /></label></div><div className="coach-builder__week-actions"><button type="button" className="text-button danger" disabled={state === 'saving'} onClick={() => setDeleteTarget({ kind: 'week', id: weekId, name: `Settimana ${selectedWeek?.weekNumber ?? ''}` })}><Trash2 size={14} /> Elimina settimana</button></div></div>}
          <div className="builder-week-actions"><button type="button" className="text-button" disabled={state === 'saving'} onClick={duplicateSelectedWeek}><Copy size={14} /> Duplica settimana</button></div>
          <div className="coach-builder__session-list">{sessions.map(item => <button disabled={state === 'saving'} className={item.id === sessionId ? 'active' : ''} key={item.id} onClick={() => void chooseSession(item.id)}><b>{String(item.order).padStart(2, '0')}</b><span><strong>{item.title}</strong><small>{item.objective || `${data?.exercises.filter(candidate => candidate.sessionId === item.id).length ?? 0} esercizi`}</small></span><ArrowRight size={16} /></button>)}</div>
          {!sessionId && <div className="empty-state empty-state--compact"><TimerReset size={20} /><b>Aggiungi la prima sessione</b></div>}
          <button className="coach-builder__add-session" disabled={state === 'saving'} onClick={addSession}><Plus size={15} /> AGGIUNGI SESSIONE</button>
        </>}
      </aside>
      <main className="coach-builder__editor">
        {!weekId && <div className="empty-state"><Layers3 size={22} /><b>Aggiungi la prima settimana</b><span>Costruisci la struttura del programma dal pannello a sinistra.</span></div>}
        {weekId && <>
          <header className="coach-builder__session-head"><div><small>SESSIONE {session?.order ?? '—'}</small><h2>{session?.title ?? 'Nessuna sessione selezionata'}</h2>{sessionId && <button type="button" className="text-button" onClick={() => setSessionTab('details')}>Modifica nome</button>}<p>{session?.objective || 'Seleziona o crea una sessione nella settimana.'}</p></div>{sessionId && <div className="coach-builder__session-actions"><span><ClipboardList size={15} /> {exercises.length} esercizi</span><details className="coach-builder__action-menu coach-builder__action-menu--session"><summary aria-label="Azioni sessione" title="Azioni sessione"><CircleEllipsis size={17} /></summary><div role="menu"><button type="button" role="menuitem" disabled={state === 'saving'} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setDeleteTarget({ kind: 'session', id: sessionId, name: sessionDetails.title || `Sessione ${session?.order ?? ''}` }) }}><Trash2 size={14} /> Elimina sessione</button></div></details></div>}</header>
          {sessionId && <div className="coach-builder__tabs"><button type="button" className={sessionTab === 'exercises' ? 'active' : ''} onClick={() => setSessionTab('exercises')}>ESERCIZI ({exercises.length})</button><button type="button" className={sessionTab === 'notes' ? 'active' : ''} onClick={() => setSessionTab('notes')}>NOTE COACH</button><button type="button" className={sessionTab === 'details' ? 'active' : ''} onClick={() => setSessionTab('details')}>DETTAGLI SESSIONE</button></div>}
          {sessionId && sessionTab === 'details' && <div className="builder-details builder-details--session"><label><span>Titolo sessione</span><input value={sessionDetails.title} onChange={event => updateSessionEditor(value => ({ ...value, title: event.target.value }))} /></label><label><span>Obiettivo</span><input value={sessionDetails.objective} onChange={event => updateSessionEditor(value => ({ ...value, objective: event.target.value }))} /></label><label><span>Durata</span><input type="number" min="0" value={sessionDetails.durationMinutes} onChange={event => updateSessionEditor(value => ({ ...value, durationMinutes: Number(event.target.value) }))} /></label><label><span>Giorno 1–7</span><input type="number" min="1" max="7" value={sessionDetails.scheduledDay} onChange={event => updateSessionEditor(value => ({ ...value, scheduledDay: Number(event.target.value) }))} /></label></div>}
          {sessionId && sessionTab === 'notes' && <div className="coach-builder__notes"><label><span>Nota / obiettivo sessione</span><textarea value={sessionDetails.objective} onChange={event => updateSessionEditor(value => ({ ...value, objective: event.target.value }))} /></label></div>}
          {sessionTab === 'exercises' && exercises.map(item => <div className={`exercise-block ${item.id === exerciseId && exerciseEditorOpen ? 'active' : ''}`} key={item.id}><button type="button" disabled={state === 'saving'} className="exercise-block__select" onClick={() => void chooseExercise(item.id)}><GripVertical className="drag-handle" size={16} /><span className="exercise-number">{String(item.order).padStart(2, '0')}</span><div><b>{item.name}</b><small>{prescriptionSummary(item)}</small></div><ChevronDown size={17} /></button><details className="coach-builder__action-menu coach-builder__action-menu--exercise"><summary aria-label={`Azioni ${item.name}`} title={`Azioni ${item.name}`}><CircleEllipsis size={17} /></summary><div role="menu"><button type="button" role="menuitem" disabled={state === 'saving'} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setDeleteTarget({ kind: 'exercise', id: item.id, name: item.name }) }}><Trash2 size={14} /> Elimina esercizio</button></div></details></div>)}
          {sessionId && sessionTab === 'exercises' && !exerciseAdderOpen && <div className="coach-builder__add-exercise-actions"><button type="button" onClick={() => { setLibraryId(''); setExerciseAdderOpen(true) }}><Plus size={15} /> AGGIUNGI ESERCIZIO</button><button type="button" onClick={() => setExerciseAdderOpen(true)}><Layers3 size={15} /> AGGIUNGI DALLA LIBRERIA</button></div>}
          {sessionId && sessionTab === 'exercises' && exerciseAdderOpen && <form className="exercise-adder" onSubmit={submitExercise}><select value={libraryId} onChange={event => setLibraryId(event.target.value)}><option value="">Esercizio rapido…</option>{data?.library.map(item => <option value={item.id} key={item.id}>{item.name}{item.category ? ` · ${item.category}` : ''}</option>)}</select>{!libraryId && <input value={newExercise} onChange={event => setNewExercise(event.target.value)} placeholder="Nome esercizio" />}<button className="drop-zone" disabled={state === 'saving'}><Plus size={17} /> Aggiungi alla sessione</button><button type="button" className="text-button" onClick={() => setExerciseAdderOpen(false)}>Annulla</button></form>}
          {sessionId && sessionTab === 'exercises' && exerciseEditorOpen && <Panel className="inspector coach-builder__inspector" title="Parametri esercizio" index="03" action={exercise && <div className="builder-exercise-save"><span role="status">{saveStatus === 'saving' ? 'Modifiche da salvare' : saveStatus === 'error' ? 'Salvataggio non riuscito' : 'Salvato'}</span><button type="button" className="button button--primary" disabled={state === 'saving' || !exerciseHasUnsavedChanges} onClick={() => void saveExerciseChanges()}><Save size={15} /> {exerciseHasUnsavedChanges ? 'Salva modifiche' : 'Salvato'}</button></div>}>
        {!exercise && <div className="empty-state empty-state--compact"><Settings2 size={20} /><b>Seleziona un esercizio</b><span>Qui modificherai volume, carico, RPE e recupero.</span></div>}
        {exercise && <>
          <TimerConfigurationEditor
            value={{
              ...(patch.timerSettings ?? inferredExerciseTimer ?? readTimerSettings(exercise.prescription, patch.restSeconds)),
              sets: patch.sets,
              reps: patch.reps,
              seconds: patch.seconds,
              restSeconds: patch.restSeconds,
              series: patch.steps.length ? patch.steps.map(step => ({ reps: step.reps, seconds: step.seconds })) : undefined,
            }}
            previewValue={timerPreview}
            renderSetControl={(sets, onChange) => <label><span>Serie</span><div className="stepper"><button type="button" onClick={() => onChange(Math.max(1, sets - 1))}>−</button><b>{sets}</b><button type="button" onClick={() => onChange(sets + 1)}>+</button></div></label>}
            onChange={next => updateExerciseEditor(value => ({
              ...value,
              sets: next.sets,
              reps: next.reps,
              seconds: next.seconds,
              restSeconds: next.restSeconds ?? 0,
              timerSettings: timerSettingsEqual(inferredExerciseTimer ?? readTimerSettings(exercise.prescription, patch.restSeconds), {
                mode: next.mode,
                executionMode: next.executionMode,
                preparationSeconds: next.preparationSeconds,
                handChangeSeconds: next.handChangeSeconds,
                intervalRestSeconds: next.intervalRestSeconds,
              }) ? undefined : {
                mode: next.mode,
                executionMode: next.executionMode,
                preparationSeconds: next.preparationSeconds,
                handChangeSeconds: next.handChangeSeconds,
                intervalRestSeconds: next.intervalRestSeconds,
              },
              // The shared controls prescribe one reps/duration value across
              // sets; keep structured rows aligned when that value is edited.
              steps: resizePrescriptionSteps(value.steps, next.sets, value).map(step => ({
                ...step,
                ...(next.reps !== value.reps ? { reps: next.reps } : {}),
                ...(next.seconds !== value.seconds ? { seconds: next.seconds } : {}),
              })),
            }))}
          />
          <label><span>Carico</span><div className="input-shell"><input type="number" min="0" step="0.5" value={patch.loadKg} onChange={event => updateExerciseEditor(value => ({ ...value, loadKg: Number(event.target.value) }))} /><em>kg</em></div></label>
          <label><span>RPE target</span><div className="rpe-scale">{[6, 7, 8, 9, 10].map(value => <button className={value === patch.rpe ? 'active' : ''} key={value} onClick={() => updateExerciseEditor(current => ({ ...current, rpe: value }))}>{value}</button>)}</div></label>
          <label className="inspector-notes"><span>Indicazioni</span><textarea value={patch.instructions} onChange={event => updateExerciseEditor(value => ({ ...value, instructions: event.target.value }))} /></label>
          <section className="builder-exercise-load"><div className="builder-exercise-load__title"><b>Variazione carico esercizio</b><span>Ripetizioni, durata e recupero non cambiano.</span></div><label><span>Variazione %</span><input aria-label="Variazione percentuale carico per questo esercizio" type="number" min="-100" max="500" value={exerciseLoadPercentages[exercise.id] ?? 0} onChange={event => setExerciseLoadPercentages(value => ({ ...value, [exercise.id]: Number(event.target.value) }))} /></label><div className="builder-exercise-load__preview">{(scaledExercisePatch.steps.some(step => step.loadKg !== null && step.loadKg > 0) ? scaledExercisePatch.steps.map((step, index) => step.loadKg !== null && step.loadKg > 0 ? `${step.label || `S${index + 1}`}: ${patch.steps[index]?.loadKg} → ${step.loadKg} kg` : null).filter(Boolean) : patch.loadKg > 0 ? [`${patch.loadKg} → ${scaledExercisePatch.loadKg} kg`] : []).join(' · ') || (hasTestDerivedTarget ? 'Il carico viene calcolato dal test, mantenendo le ripetizioni di ogni serie.' : 'Nessun carico numerico in questa prescrizione.')}</div><button type="button" className="text-button" disabled={state === 'saving' || safeExerciseLoadPercentage === 0 || (!hasTestDerivedTarget && !((patch.loadKg > 0) || patch.steps.some(step => step.loadKg !== null && step.loadKg > 0)))} onClick={applyExerciseLoadAdjustment}>Applica variazione a questo esercizio</button></section>

          <div className="structured-prescription"><div className="structured-prescription__head"><span>Progressione a righe</span><button type="button" className="text-button" onClick={addStep}><Plus size={13} /> Riga</button></div>{patch.steps.map((step, index) => <div className="structured-prescription__row" key={index}><label><span>Set / nota</span><input aria-label="Etichetta" value={step.label} onChange={event => changeStep(index, { label: event.target.value })} /></label><label><span>Carico kg</span><input aria-label="Carico kg" type="number" step="0.5" value={step.loadKg ?? ''} onChange={event => changeStep(index, { loadKg: event.target.value === '' ? null : Number(event.target.value) })} /></label><label><span>Ripetizioni</span><input aria-label="Ripetizioni" type="number" min="0" value={step.reps} onChange={event => changeStep(index, { reps: Number(event.target.value), seconds: 0 })} /></label><label><span>Durata sec</span><input aria-label="Secondi" type="number" min="0" value={step.seconds} onChange={event => changeStep(index, { seconds: Number(event.target.value), reps: 0 })} /></label><button type="button" aria-label="Elimina riga" onClick={() => updateExerciseEditor(value => { const steps = value.steps.filter((_, row) => row !== index); return { ...value, sets: Math.max(1, steps.length), steps } })}><Minus size={13} /></button></div>)}</div>

          <ExerciseTestTargetPanel
            profile={profile}
            athleteId={athleteId}
            exerciseId={exercise.id}
            setCount={patch.sets}
            loadAdjustmentPercentage={safeExerciseLoadPercentage}
            onRegisterLoadAdjustment={registerTestTargetLoadAdjustment}
          />
        </>}
      </Panel>}
        </>}
      </main>
    </div></>}
    {localDraftReview && <div className={`completion-banner${localDraftVerificationFailed ? ' completion-banner--error' : ''}`} role="status"><TriangleAlert size={19} /><div>
      <b>{localDraftVerificationFailed
        ? 'Verifica bozze non riuscita'
        : `${localDraftReview.comparisons.length} ${localDraftReview.comparisons.length === 1 ? 'bozza locale rilevata' : 'bozze locali rilevate'}`}</b>
      {localDraftVerificationFailed && localDraftReview.comparisons.length > 0 && <span>{localDraftReview.comparisons.length} {localDraftReview.comparisons.length === 1 ? 'bozza locale non verificata' : 'bozze locali non verificate'}</span>}
      {localDraftReview.verificationError && <span>{localDraftReview.verificationError}</span>}
      {localDraftReview.comparisons.map(comparison => <div className="builder-draft-review" key={builderLocalDraftKey(comparison.draft)}>
        <span>{comparison.programName} · {draftEntityLabels[comparison.draft.entityType]} · {formatDraftUpdatedAt(comparison.draft.updatedAt)} · {draftStatusLabels[comparison.status]}{comparison.error ? ` · ${comparison.error}` : ''}</span>
        {comparison.status === 'conflict' && <>
          {comparison.fields.filter(field => field.status === 'conflict').map(field => <span key={field.field}>
            {field.field}: base {formatDraftValue(field.remoteBase)} · locale {formatDraftValue(field.localValue)} · online {formatDraftValue(field.remoteCurrent)}
          </span>)}
          <div className="builder-draft-review__actions">
            <button type="button" className="text-button" disabled={state === 'saving'} onClick={() => void recheckLocalDrafts()}>Ricontrolla</button>
            <button type="button" className="text-button" disabled={state === 'saving'} onClick={() => void useLocalDraft(comparison)}>Usa modifiche locali</button>
            <button type="button" className="text-button danger" disabled={state === 'saving'} onClick={() => setDiscardDraftTarget(comparison)}>Mantieni versione online</button>
          </div>
        </>}
      </div>)}
      {localDraftReview.issues.map(issue => <span key={issue.key || issue.code}>
        {issue.identity ? `${issue.identity.programId} · ${draftEntityLabels[issue.identity.entityType]} · ` : ''}{issue.message}
      </span>)}
    </div></div>}
    {protectedDraftWarning && <div className="completion-banner completion-banner--error" role="alert"><TriangleAlert size={19} /><div><b>Bozza locale da recuperare</b><span>{protectedDraftWarning}</span></div></div>}
    {localDraftWarning && <div className="completion-banner completion-banner--error" role="alert"><TriangleAlert size={19} /><div><b>Bozza locale non disponibile</b><span>{localDraftWarning}</span></div></div>}
    {error && <div className="completion-banner completion-banner--error"><TriangleAlert size={19} /><div><b>Operazione non completata</b><span>{error}</span></div></div>}
    <span className="coach-builder__sr-status" role="status" aria-live="polite">{message}</span>
    {discardDraftTarget && <ConfirmDialog title="Mantenere la versione online?" text="Le modifiche conservate nella bozza locale verranno eliminate soltanto dopo una nuova lettura riuscita dei dati online." confirmLabel="Mantieni versione online" onCancel={() => setDiscardDraftTarget(null)} onConfirm={confirmKeepOnlineDraft} />}
    {deleteTarget && <ConfirmDialog title={`Eliminare ${deleteTarget.kind === 'block' ? `il blocco ${deleteTarget.name}` : deleteTarget.name}?`} text={deleteTarget.kind === 'program' ? 'Saranno eliminati in modo permanente programma, settimane, sessioni, esercizi e storico di allenamento e feedback collegati. Questa operazione non si può annullare.' : deleteTarget.kind === 'block' ? `Saranno eliminate tutte le ${deleteTarget.weekIds.length} settimane del blocco, con le rispettive sessioni ed esercizi.` : deleteTarget.kind === 'week' ? 'Saranno eliminate anche tutte le sessioni e gli esercizi della settimana; le successive saranno rinumerate.' : deleteTarget.kind === 'session' ? 'Saranno eliminati anche tutti gli esercizi della sessione.' : 'L’esercizio e la sua prescrizione saranno eliminati dalla sessione.'} confirmLabel="Elimina definitivamente" busy={state === 'saving'} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />}
  </div>
}

function BuilderMountainBackground() {
  return <svg viewBox="0 0 1500 270" preserveAspectRatio="xMidYMid slice" className="coach-builder__mountains" aria-hidden="true">
    <defs><linearGradient id="builderMountainFade" x1="0" x2="1"><stop offset="0%" stopColor="#EEE5F2" stopOpacity="0.15" /><stop offset="46%" stopColor="#C6AED4" stopOpacity="0.50" /><stop offset="100%" stopColor="#55206F" stopOpacity="0.54" /></linearGradient></defs>
    <rect width="1500" height="270" fill="url(#builderMountainFade)" />
    <path d="M730 270 L850 151 L915 190 L1020 52 L1085 149 L1160 93 L1250 181 L1350 79 L1500 202 L1500 270 Z" fill="#55206F" opacity="0.23" />
    <path d="M900 270 L1005 165 L1060 200 L1140 92 L1215 185 L1292 125 L1370 196 L1450 116 L1500 159 L1500 270 Z" fill="#2C103A" opacity="0.17" />
    <path d="M1020 52 L1085 149 L1160 93 L1250 181" fill="none" stroke="#55206F" strokeWidth="2" opacity="0.23" />
  </svg>
}

function ProgramsOverview({ data, onOpen, onCreate }: { data: ProgramBuilderData | null; onOpen: (programId: string, athleteId: string) => void; onCreate: () => void }) {
  const activePrograms = data?.programs.filter(item => item.status === 'active').length ?? 0
  return <div className="coach-programs">
    <header className="coach-programs__intro">
      <p className="coach-kicker">// PROCESS</p>
      <div>
        <section><h1>PROGRAMMI <span aria-hidden="true" /></h1><p>Pianificazione dei percorsi di allenamento e gestione delle sessioni.</p></section>
        <button onClick={onCreate}><Plus size={16} /> NUOVO PROGRAMMA</button>
      </div>
    </header>
    <section className="coach-programs__cards">
      <article className="coach-programs__builder-card">
        <Layers3 size={23} />
        <p>PROGRAM BUILDER</p>
        <h2>COSTRUISCI PROGRAMMA</h2>
        <span>Crea settimane, sessioni ed esercizi all'interno del percorso dell'atleta.</span>
        <button onClick={() => { const first = data?.programs[0]; if (first) onOpen(first.id, first.athleteId); else onCreate() }}>APRI BUILDER <ArrowRight size={15} /></button>
      </article>
      <article className="coach-programs__metric-card">
        <CalendarDays size={23} />
        <p>PROGRAMMI ATTIVI</p>
        <strong>{String(activePrograms).padStart(2, '0')}</strong>
        <span>Percorsi attualmente in corso.</span>
      </article>
    </section>
    <section className="coach-programs__history">
      <header><div><p>STORICO PROGRAMMI</p><h2>Tutte le programmazioni</h2></div><span>{data?.programs.length ?? 0}</span></header>
      {!data?.programs.length && <div className="empty-state"><Layers3 size={22} /><b>Nessun programma</b><span>Crea la prima programmazione per iniziare.</span></div>}
      <div className="coach-programs__history-list">{data?.programs.map(item => {
        const athlete = data.athletes.find(candidate => candidate.id === item.athleteId)
        const weekCount = data.weeks.filter(week => week.programId === item.id).length
        return <button type="button" key={item.id} onClick={() => onOpen(item.id, item.athleteId)}><span><b>{item.name}</b><small>{athlete?.name ?? 'Atleta'} · {weekCount} {weekCount === 1 ? 'settimana' : 'settimane'}</small></span><Tag tone={item.status === 'active' ? 'success' : item.status === 'draft' ? 'signal' : 'neutral'}>{item.status}</Tag><ArrowRight size={16} /></button>
      })}</div>
    </section>
  </div>
}
