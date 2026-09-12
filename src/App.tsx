import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardCheck,
  Home,
  KeyRound,
  Layers3,
  LogOut,
  Mail,
  Menu,
  Mountain,
  Pause,
  Play,
  Plus,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TestTube2,
  TimerReset,
  TrendingUp,
  Trash2,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { dataRuntime } from './dataRuntime'
import { countPendingOperations, flushExerciseOutbox, OUTBOX_CHANGED_EVENT } from './outbox'
import { availableModes, defaultMode, type AppProfile, type AppRole } from './onboarding/types'
import { AthleteHomeScreen as HomeScreen } from './dashboard/AthleteHomeScreen'
import { createExerciseTimerState, exerciseTimerPhaseLabel, firstOpenExerciseIndex, formatPrescription, getExerciseTimerConfig, getRestSeconds, getSetCount, getVariableSeries, restoreExerciseTimerSnapshot, summarizeRunner, tickExerciseTimer, type ExerciseTimerSnapshot, type ExerciseTimerState, type SessionRunnerData } from './session/sessionRunner'
import { autosaveSessionDraft, beginSession, finishSession, loadSessionRunner, saveExerciseProgress, syncQueuedExercise } from './session/sessionRunnerRepository'
import { loadCoachDashboard } from './coach/coachDashboardRepository'
import type { CoachDashboardData } from './coach/coachDashboard'
import { createManagedAthlete, decideCoachLinkRequest, inviteAthlete, loadAthleteManagement, removeAthleteRelationship, resolveInvitationEmail, revokeInvitation, setAthleteStatus, type AthleteManagementData } from './coach/athleteManagementRepository'
import { canPublishProgram, prescriptionSummary, type ProgramBuilderData } from './builder/programBuilder'
import { addExercise, createProgram, createSession, createWeek, loadProgramBuilder, publishProgram, updateExercise, updateSessionDetails, updateWeekDetails, type ExercisePatch } from './builder/programBuilderRepository'
import { ExerciseTestTargetPanel } from './builder/ExerciseTestTargetPanel'
import { emptyExercise, filterExercises, validateExercise, type ExerciseLibraryInput, type ExerciseLibraryItem, type LibraryStatusFilter } from './library/exerciseLibrary'
import { createLibraryExercise, deleteLibraryExercise, loadExerciseLibrary, setLibraryExerciseArchived, updateLibraryExercise } from './library/exerciseLibraryRepository'
import { TestScreen } from './tests/TestScreen'
import { Bars, ConfirmDialog, Metric, Panel, ScreenHeader, Tag } from './shared/ui'
import { useScreenWakeLock } from './shared/hooks/useScreenWakeLock'
import { useUpdateBlocker } from './pwa/useUpdateBlocker'
import { SystemScreen } from './features/system/SystemScreen'
import { MigrationScreen } from './features/migration/MigrationScreen'
import { AccountSecurityScreen } from './features/account/AccountSecurityScreen'

type ViewId = 'system' | 'home' | 'session' | 'dashboard' | 'athletes' | 'builder' | 'library' | 'test' | 'migration' | 'account'

type NavItem = {
  id: ViewId
  label: string
  shortLabel: string
  icon: LucideIcon
  group: string
  roles: AppRole[]
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Home atleta', shortLabel: 'Home', icon: Home, group: 'Allenamento', roles: ['athlete'] },
  { id: 'session', label: 'Sessione', shortLabel: 'Sessione', icon: TimerReset, group: 'Allenamento', roles: ['athlete'] },
  { id: 'dashboard', label: 'Coach dashboard', shortLabel: 'Coach', icon: Users, group: 'Coaching', roles: ['coach'] },
  { id: 'athletes', label: 'Atleti e inviti', shortLabel: 'Atleti', icon: Mail, group: 'Coaching', roles: ['coach'] },
  { id: 'builder', label: 'Program builder', shortLabel: 'Builder', icon: SlidersHorizontal, group: 'Coaching', roles: ['coach'] },
  { id: 'library', label: 'Libreria esercizi', shortLabel: 'Esercizi', icon: BookOpen, group: 'Coaching', roles: ['coach'] },
  { id: 'test', label: 'Test / retest', shortLabel: 'Test', icon: TestTube2, group: 'Analisi', roles: ['athlete', 'coach'] },
  { id: 'account', label: 'Account e sicurezza', shortLabel: 'Account', icon: KeyRound, group: 'Account', roles: ['athlete', 'coach'] },
]

type ExerciseInputDraft = {
  rpe: string
  notes: string
}

type ExerciseSaveState =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'queued'
  | 'error'

type SessionLocalDraft = {
  version: 1
  sessionId: string
  outcome: 'completed' | 'partial' | ''
  missedIds: string[]
  sessionRpe: string
  sessionNote: string
  timer: ExerciseTimerSnapshot | null
  exerciseInputs: Record<string, ExerciseInputDraft>
}

function readExerciseInputDrafts(
  value: unknown,
): Record<string, ExerciseInputDraft> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {}
  }

  const result: Record<string, ExerciseInputDraft> = {}

  for (const [exerciseId, raw] of Object.entries(value)) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw)
    ) {
      continue
    }

    const entry = raw as Record<string, unknown>

    result[exerciseId] = {
      rpe:
        typeof entry.rpe === 'string'
          ? entry.rpe
          : '',
      notes:
        typeof entry.notes === 'string'
          ? entry.notes
          : '',
    }
  }

  return result
}

function readSessionLocalDraft(
  key: string,
): SessionLocalDraft | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<SessionLocalDraft>

    if (
      parsed.version !== 1 ||
      typeof parsed.sessionId !== 'string'
    ) {
      return null
    }

    const timerCandidate =
      parsed.timer &&
      typeof parsed.timer === 'object' &&
      typeof parsed.timer.savedAt === 'number' &&
      parsed.timer.state &&
      typeof parsed.timer.state.exerciseId === 'string'
        ? parsed.timer as ExerciseTimerSnapshot
        : null

    return {
      version: 1,
      sessionId: parsed.sessionId,
      outcome:
        parsed.outcome === 'completed' ||
        parsed.outcome === 'partial'
          ? parsed.outcome
          : '',
      missedIds: Array.isArray(parsed.missedIds)
        ? parsed.missedIds.filter(
            (value): value is string =>
              typeof value === 'string',
          )
        : [],
      sessionRpe:
        typeof parsed.sessionRpe === 'string'
          ? parsed.sessionRpe
          : '',
      sessionNote:
        typeof parsed.sessionNote === 'string'
          ? parsed.sessionNote
          : '',
      timer: timerCandidate,
      exerciseInputs:
        readExerciseInputDrafts(
          parsed.exerciseInputs,
        ),
    }
  } catch {
    return null
  }
}

function writeSessionLocalDraft(
  key: string,
  draft: SessionLocalDraft,
) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(draft),
    )
  } catch {
    // Local storage can be unavailable.
  }
}

function clearSessionLocalDraft(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Local storage can be unavailable.
  }
}

function SessionScreen({ profile, sessionId }: { profile: AppProfile; sessionId: string }) {
  const [runner, setRunner] = useState<SessionRunnerData | null | undefined>(undefined)
  const [timerState, setTimerState] = useState<ExerciseTimerState | null>(null)
  const [outcome, setOutcome] = useState<'completed' | 'partial' | ''>('')
  const [missedIds, setMissedIds] = useState<string[]>([])
  const [sessionRpe, setSessionRpe] = useState('')
  const [sessionNote, setSessionNote] = useState('')
  const [exerciseInputs, setExerciseInputs] = useState<Record<string, ExerciseInputDraft>>({})
  const [exerciseSaveStates, setExerciseSaveStates] = useState<Record<string, ExerciseSaveState>>({})
  const [saveState, setSaveState] = useState<'idle' | 'starting' | 'finishing' | 'saved' | 'queued' | 'error'>('idle')
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [draftReady, setDraftReady] = useState(false)
  const draftStorageKey = `cc-v2:session-draft:${profile.userId}:${sessionId}`
  const wakeLockStatus = useScreenWakeLock(Boolean(runner && runner.session.status !== 'completed'))

  useEffect(() => {
    let active = true
    setDraftReady(false)

    loadSessionRunner(profile, sessionId || null).then(data => {
      if (!active) return

      setRunner(data)

      if (!data) {
        setDraftReady(true)
        return
      }

      if (data.session.status === 'completed') {
        clearSessionLocalDraft(draftStorageKey)
        setTimerState(null)
        setMissedIds([])
        setExerciseInputs({})
        setExerciseSaveStates({})
        setSessionRpe(
          data.session.sessionRpe?.toString() ?? '',
        )
        setSessionNote(data.session.notes ?? '')
        setOutcome(
          data.session.completionOutcome ?? '',
        )
        setDraftReady(true)
        return
      }

      const draft =
        readSessionLocalDraft(draftStorageKey)

      if (
        draft &&
        draft.sessionId === data.session.id
      ) {
        setOutcome(draft.outcome)
        setMissedIds(draft.missedIds)
        setSessionRpe(draft.sessionRpe)
        setSessionNote(draft.sessionNote)
        setExerciseInputs(draft.exerciseInputs)
        setExerciseSaveStates({})
        setTimerState(
          draft.timer
            ? restoreExerciseTimerSnapshot(
                draft.timer,
              )
            : null,
        )
      } else {
        setOutcome(
          data.session.completionOutcome ?? '',
        )
        setMissedIds([])
        setExerciseInputs({})
        setExerciseSaveStates({})
        setSessionRpe(
          data.session.sessionRpe?.toString() ?? '',
        )
        setSessionNote(data.session.notes ?? '')
        setTimerState(null)
      }

      setDraftReady(true)
    }).catch(reason => {
      if (active) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Sessione non disponibile.',
        )
        setDraftReady(true)
      }
    })

    return () => {
      active = false
    }
  }, [
    profile,
    sessionId,
    reloadKey,
    draftStorageKey,
  ])

  useEffect(() => {
    const refreshFromOutbox = () => setReloadKey(value => value + 1)
    window.addEventListener(OUTBOX_CHANGED_EVENT, refreshFromOutbox)
    return () => window.removeEventListener(OUTBOX_CHANGED_EVENT, refreshFromOutbox)
  }, [])
  useEffect(() => {
    if (
      !draftReady ||
      !runner ||
      runner.session.status === 'completed'
    ) {
      return
    }

    writeSessionLocalDraft(
      draftStorageKey,
      {
        version: 1,
        sessionId: runner.session.id,
        outcome,
        missedIds,
        sessionRpe,
        sessionNote,
        exerciseInputs,
        timer: timerState
          ? {
              state: timerState,
              savedAt: Date.now(),
            }
          : null,
      },
    )
  }, [
    draftReady,
    draftStorageKey,
    exerciseInputs,
    missedIds,
    outcome,
    runner,
    sessionNote,
    sessionRpe,
    timerState,
  ])

  useEffect(() => {
    if (!draftReady) return

    const reconcileTimer = () => {
      if (
        document.visibilityState === 'hidden'
      ) {
        return
      }

      const draft =
        readSessionLocalDraft(draftStorageKey)

      if (
        !draft?.timer ||
        draft.timer.state.phase === 'complete'
      ) {
        return
      }

      setTimerState(
        restoreExerciseTimerSnapshot(
          draft.timer,
        ),
      )
    }

    document.addEventListener(
      'visibilitychange',
      reconcileTimer,
    )
    window.addEventListener(
      'focus',
      reconcileTimer,
    )

    return () => {
      document.removeEventListener(
        'visibilitychange',
        reconcileTimer,
      )
      window.removeEventListener(
        'focus',
        reconcileTimer,
      )
    }
  }, [
    draftReady,
    draftStorageKey,
  ])

  useEffect(() => {
    if (
      !draftReady ||
      !runner?.session.logId ||
      runner.session.status !== 'in_progress'
    ) {
      return
    }

    const parsedRpe =
      sessionRpe.trim()
        ? Number(sessionRpe)
        : null

    if (
      parsedRpe !== null &&
      (
        !Number.isFinite(parsedRpe) ||
        parsedRpe < 0 ||
        parsedRpe > 10
      )
    ) {
      return
    }

    const handle = window.setTimeout(() => {
      void autosaveSessionDraft(
        profile,
        runner.session.logId!,
        {
          rpe: parsedRpe,
          notes: sessionNote,
        },
      ).catch(() => {
        // Local draft remains the source of recovery
        // if cloud autosave is temporarily unavailable.
      })
    }, 750)

    return () => {
      window.clearTimeout(handle)
    }
  }, [
    draftReady,
    profile,
    runner?.session.logId,
    runner?.session.status,
    sessionNote,
    sessionRpe,
  ])


  useEffect(() => {
    if (!timerState?.running || timerState.phase === 'complete') return
    const interval = window.setInterval(() => setTimerState(value => value ? tickExerciseTimer(value) : null), 1000)
    return () => window.clearInterval(interval)
  }, [timerState?.running, timerState?.phase])

  useEffect(() => {
    if (
      !draftReady ||
      !runner ||
      runner.session.status !== 'in_progress'
    ) {
      return
    }

    const openIndex =
      firstOpenExerciseIndex(runner.exercises)

    const nextExercise =
      runner.exercises[openIndex]

    if (
      !nextExercise ||
      nextExercise.progress?.completed
    ) {
      return
    }

    const handle = window.setTimeout(() => {
      document
        .getElementById(
          `exercise-${nextExercise.id}`,
        )
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
    }, 120)

    return () => {
      window.clearTimeout(handle)
    }
  }, [draftReady, runner])

  if (error && !runner) return <div className="screen"><Panel className="home-state home-state--error" title="Sessione non disponibile" index="!"><TriangleAlert size={24} /><p>{error}</p></Panel></div>
  if (runner === undefined) return <div className="screen"><Panel className="home-state" title="Caricamento sessione" index="…"><div className="skeleton-stack" aria-label="Caricamento"><span /><span /><span /></div></Panel></div>
  if (!runner || runner.exercises.length === 0) return <div className="screen"><Panel className="home-state" title="Nessuna sessione pronta" index="00"><ClipboardCheck size={24} /><p>Non risultano esercizi prescritti nella sessione corrente.</p></Panel></div>

  const summary = summarizeRunner(runner.exercises)
  const canEdit = runner.session.status !== 'completed'
  const nextOpenIndex =
    firstOpenExerciseIndex(runner.exercises)
  const nextOpenExercise =
    runner.exercises[nextOpenIndex]
  const nextOpenExerciseId =
    nextOpenExercise &&
    !nextOpenExercise.progress?.completed
      ? nextOpenExercise.id
      : null

  const startCurrentSession = async () => {
    setSaveState('starting')
    setError('')
    try {
      const log = await beginSession(profile, runner.session.id)
      setRunner(value => value ? { ...value, session: { ...value.session, logId: log.id, status: log.status, startedAt: log.started_at } } : value)
      setSaveState('idle')
    } catch (reason) {
      setSaveState('error')
      setError(reason instanceof Error ? reason.message : 'Avvio non riuscito.')
    }
  }

  const toggleTimer = (exercise: SessionRunnerData['exercises'][number]) => {
    setTimerState(current => {
      if (current?.exerciseId === exercise.id) {
        if (current.phase === 'complete') {
          const restarted = createExerciseTimerState(exercise)
          return restarted ? { ...restarted, running: true } : null
        }
        return { ...current, running: !current.running }
      }
      const created = createExerciseTimerState(exercise)
      return created ? { ...created, running: true } : null
    })
  }

  const resetTimer = (exercise: SessionRunnerData['exercises'][number]) => {
    setTimerState(createExerciseTimerState(exercise))
  }

  const toggleMissed = (exerciseId: string) => {
    setMissedIds(ids => ids.includes(exerciseId) ? ids.filter(id => id !== exerciseId) : [...ids, exerciseId])
    setSaveState('idle')
    setError('')
  }

  const updateExerciseInput = (
    exerciseId: string,
    patch: Partial<ExerciseInputDraft>,
  ) => {
    setExerciseInputs(current => ({
      ...current,
      [exerciseId]: {
        rpe: current[exerciseId]?.rpe ?? '',
        notes: current[exerciseId]?.notes ?? '',
        ...patch,
      },
    }))

    setExerciseSaveStates(current => ({
      ...current,
      [exerciseId]: 'idle',
    }))
  }

  const recordExercise = async (
    exercise: SessionRunnerData['exercises'][number],
  ) => {
    if (exercise.progress?.completed) return

    const input =
      exerciseInputs[exercise.id] ?? {
        rpe: '',
        notes: '',
      }

    const parsedRpe =
      input.rpe.trim()
        ? Number(input.rpe)
        : null

    if (
      parsedRpe !== null &&
      (
        !Number.isFinite(parsedRpe) ||
        parsedRpe < 0 ||
        parsedRpe > 10
      )
    ) {
      setExerciseSaveStates(current => ({
        ...current,
        [exercise.id]: 'error',
      }))

      setError(
        "L'RPE dell'esercizio deve essere compreso tra 0 e 10.",
      )
      return
    }

    setExerciseSaveStates(current => ({
      ...current,
      [exercise.id]: 'saving',
    }))
    setError('')

    try {
      let logId = runner.session.logId
      let startedAt = runner.session.startedAt

      if (!logId) {
        const log = await beginSession(
          profile,
          runner.session.id,
        )

        logId = log.id
        startedAt = log.started_at
      }

      const result = await saveExerciseProgress(
        profile,
        logId,
        exercise,
        {
          rpe: parsedRpe,
          notes: input.notes,
        },
      )

      setRunner(current => {
        if (!current) return current

        return {
          ...current,
          session: {
            ...current.session,
            logId,
            status: 'in_progress',
            startedAt:
              current.session.startedAt ??
              startedAt,
          },
          exercises: current.exercises.map(item =>
            item.id === exercise.id
              ? {
                  ...item,
                  progress: result.progress,
                }
              : item,
          ),
        }
      })

      setMissedIds(current =>
        current.filter(
          id => id !== exercise.id,
        ),
      )

      if (
        timerState?.exerciseId ===
        exercise.id
      ) {
        setTimerState(null)
      }

      setExerciseSaveStates(current => ({
        ...current,
        [exercise.id]:
          result.disposition === 'queued'
            ? 'queued'
            : 'saved',
      }))
    } catch (reason) {
      setExerciseSaveStates(current => ({
        ...current,
        [exercise.id]: 'error',
      }))

      setError(
        reason instanceof Error
          ? reason.message
          : 'Esercizio non registrato.',
      )
    }
  }

  const completeCurrentSession = async () => {
    if (!outcome) { setError('Scegli se la sessione è stata completata oppure no.'); return }
    if (outcome === 'partial' && missedIds.length === 0) { setError('Indica almeno un esercizio non eseguito.'); return }
    const parsedSessionRpe = sessionRpe.trim() ? Number(sessionRpe) : null
    if (parsedSessionRpe !== null && (!Number.isFinite(parsedSessionRpe) || parsedSessionRpe < 0 || parsedSessionRpe > 10)) { setError('L’RPE sessione deve essere compreso tra 0 e 10.'); return }

    setSaveState('finishing')
    setError('')
    try {
      let logId = runner.session.logId
      if (!logId) {
        const log = await beginSession(profile, runner.session.id)
        logId = log.id
      }

      let hasQueuedWrites = false
      const updatedExercises = [...runner.exercises]
      for (let index = 0; index < updatedExercises.length; index += 1) {
        const exercise = updatedExercises[index]
        const shouldRecord = outcome === 'completed' || !missedIds.includes(exercise.id)
        if (!shouldRecord || exercise.progress?.completed) {
          if (exercise.progress?.syncState === 'queued') hasQueuedWrites = true
          continue
        }
        const result = await saveExerciseProgress(profile, logId, exercise, { rpe: null, notes: '' })
        updatedExercises[index] = { ...exercise, progress: result.progress }
        if (result.disposition === 'queued') hasQueuedWrites = true
      }

      const nextRunner = { ...runner, session: { ...runner.session, logId, status: 'in_progress' }, exercises: updatedExercises }
      setRunner(nextRunner)
      if (hasQueuedWrites) {
        setSaveState('queued')
        setError('La sessione è protetta nella coda offline. Verrà chiusa dopo la sincronizzazione.')
        return
      }

      const missedNames = updatedExercises.filter(exercise => missedIds.includes(exercise.id)).map(exercise => exercise.name)
      const finalNotes = [sessionNote.trim(), outcome === 'partial' ? 'Non eseguiti: ' + missedNames.join(', ') : ''].filter(Boolean).join('\n')
      const result = await finishSession(profile, logId, { allCompleted: outcome === 'completed', rpe: parsedSessionRpe, notes: finalNotes })
      setRunner(value => value ? { ...value, session: { ...value.session, status: 'completed', completionOutcome: outcome, completedAt: result.completedAt, notes: finalNotes } } : value)
      setSaveState('saved')
      setTimerState(null)
      clearSessionLocalDraft(draftStorageKey)
    } catch (reason) {
      setSaveState('error')
      setError(reason instanceof Error ? reason.message : 'Chiusura non riuscita.')
    }
  }

  return (
    <div className="screen screen--session">
      <ScreenHeader eyebrow="SESSIONE / PANORAMICA" title={runner.session.title} text={[runner.session.objective, runner.session.durationMinutes ? String(runner.session.durationMinutes) + ' min' : ''].filter(Boolean).join(' · ')} action={<div className="header-actions"><Tag tone={runner.source === 'legacy-v1' ? 'success' : 'neutral'}>{runner.source === 'legacy-v1' ? 'DATI LIVE' : 'DEMO'}</Tag>{wakeLockStatus === 'active' && <Tag tone="success">SCHERMO ATTIVO</Tag>}</div>} />
      <div className="session-status session-status--compact">
        <div className="session-status__progress"><span>ESERCIZI DELLA SESSIONE</span><b>{String(runner.exercises.length).padStart(2, '0')} · {summary.completed} registrati</b><div className="progress-line"><i style={{ width: String(summary.percentage) + '%' }} /></div></div>
      </div>

      <div className="session-exercise-list">
        {runner.exercises.map(exercise => {
          const variableSeries = getVariableSeries(exercise)
          const isMissed = missedIds.includes(exercise.id)
          const exerciseInput =
            exerciseInputs[exercise.id] ?? {
              rpe: '',
              notes: '',
            }
          const exerciseSaveState =
            exerciseSaveStates[exercise.id] ?? 'idle'
          const isNext =
            exercise.id === nextOpenExerciseId
          const timerConfig = getExerciseTimerConfig(exercise)
          const timerActive = timerState?.exerciseId === exercise.id
          const activeTimer = timerActive ? timerState : createExerciseTimerState(exercise)
          const timerSeconds = activeTimer?.remaining ?? getRestSeconds(exercise)
          const timerLabel = String(Math.floor(timerSeconds / 60)).padStart(2, '0') + ':' + String(timerSeconds % 60).padStart(2, '0')
          const dose = String(exercise.prescription.dose ?? 'Dose indicata dal coach')
          const load = exercise.prescription.load_value == null ? 'Corpo libero' : String(exercise.prescription.load_value) + (exercise.prescription.unit ? ' ' + String(exercise.prescription.unit) : '')
          return <article
            id={`exercise-${exercise.id}`}
            className={
              'session-exercise-card ' +
              (isMissed ? 'is-missed' : '') +
              (exercise.progress?.completed ? ' is-recorded' : '') +
              (isNext ? ' is-next' : '')
            }
            key={exercise.id}
          >
            <div className="session-exercise-card__head">
              <span>{String(exercise.order).padStart(2, '0')}</span>
              <div>
                <h2>{exercise.name}</h2>
                <p>{formatPrescription(exercise)}</p>
              </div>
              {exercise.progress?.completed
                ? (
                  <Tag
                    tone={
                      exercise.progress.syncState === 'queued'
                        ? 'warning'
                        : 'success'
                    }
                  >
                    {exercise.progress.syncState === 'queued'
                      ? 'IN CODA'
                      : 'REGISTRATO'}
                  </Tag>
                )
                : isNext
                  ? <Tag tone="signal">PROSSIMO</Tag>
                  : <Tag tone="purple">{getSetCount(exercise)} serie</Tag>}
            </div>
            {variableSeries.length > 0 ? <div className="variable-series"><div className="variable-series__label"><b>Carichi differenti</b><span>Una riga per ogni serie</span></div><ol>{variableSeries.map((series, index) => <li key={series + index}><span>{String(index + 1).padStart(2, '0')}</span><b>{series}</b></li>)}</ol></div> : <div className="uniform-prescription"><div><small>STRUTTURA</small><b>{getSetCount(exercise)} serie</b></div><div><small>DOSE</small><b>{dose}</b></div><div><small>CARICO</small><b>{load}</b></div><div><small>RECUPERO</small><b>{getRestSeconds(exercise)} sec</b></div></div>}
            <div className="exercise-guidance"><span>Indicazioni</span><p>{exercise.instructions || runner.session.coachNotes || 'Segui la prescrizione e interrompi in caso di dolore.'}</p></div>
            {canEdit && timerConfig && activeTimer && <div className={'exercise-timer ' + (timerActive ? 'is-active' : '')}><div><small>{exerciseTimerPhaseLabel(activeTimer)}</small><strong>{timerLabel}</strong><span>Serie {activeTimer.set}/{timerConfig.sets}{timerConfig.repetitions > 1 ? ` · Rip. ${activeTimer.repetition}/${timerConfig.repetitions}` : ''}</span></div><button className="exercise-timer__control" onClick={() => toggleTimer(exercise)} aria-label={timerActive && timerState?.running ? `Metti in pausa il timer di ${exercise.name}` : `Avvia il timer di ${exercise.name}`}>{timerActive && timerState?.running ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}<span>{timerActive && timerState?.running ? 'Pausa' : timerActive && timerState?.phase !== 'complete' ? 'Riprendi' : timerActive ? 'Ricomincia' : 'Avvia'}</span></button><button className="exercise-timer__reset" onClick={() => resetTimer(exercise)} aria-label={`Reimposta il timer di ${exercise.name}`}><TimerReset size={17} /></button></div>}
            {canEdit && !exercise.progress?.completed && (
              <div className="exercise-entry">
                <div className="exercise-entry__fields">
                  <label>
                    <span>RPE esercizio</span>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={exerciseInput.rpe}
                      onChange={event =>
                        updateExerciseInput(
                          exercise.id,
                          {
                            rpe:
                              event.target.value,
                          },
                        )
                      }
                      placeholder="0-10"
                    />
                  </label>

                  <label>
                    <span>Note esercizio</span>
                    <textarea
                      value={exerciseInput.notes}
                      onChange={event =>
                        updateExerciseInput(
                          exercise.id,
                          {
                            notes:
                              event.target.value,
                          },
                        )
                      }
                      placeholder="Carico reale, sensazioni, dolore, adattamenti..."
                    />
                  </label>
                </div>

                <div className="exercise-entry__actions">
                  <span>
                    {exerciseSaveState === 'queued'
                      ? 'Salvato sul dispositivo: sincronizzazione in attesa.'
                      : exerciseSaveState === 'error'
                        ? 'Controlla i dati e riprova.'
                        : 'RPE e note sono facoltativi.'}
                  </span>

                  <button
                    className="button button--primary"
                    disabled={
                      exerciseSaveState === 'saving'
                    }
                    onClick={() =>
                      void recordExercise(exercise)
                    }
                  >
                    <Save size={16} />
                    {exerciseSaveState === 'saving'
                      ? 'Salvataggio...'
                      : 'Registra esercizio'}
                  </button>
                </div>
              </div>
            )}

            {exercise.progress?.completed && (
              <div className="exercise-recorded-detail">
                <Check size={17} />
                <div>
                  <b>
                    {exercise.progress.syncState === 'queued'
                      ? 'Registrazione in coda offline'
                      : 'Esercizio registrato'}
                  </b>

                  <span>
                    {[
                      exercise.progress.rpe !== null
                        ? `RPE ${exercise.progress.rpe}/10`
                        : '',
                      exercise.progress.notes,
                    ]
                      .filter(Boolean)
                      .join(' ? ') ||
                      'Nessuna nota aggiuntiva.'}
                  </span>
                </div>
              </div>
            )}

          </article>
        })}
      </div>

      {runner.session.status === 'completed' ? <div className="completion-banner"><ShieldCheck size={19} /><div><b>{runner.session.completionOutcome === 'partial' ? 'Sessione registrata come non completata' : 'Sessione completata'}</b><span>{runner.session.completionOutcome === 'partial' ? runner.session.notes : 'Lo storico è stato salvato.'}</span></div></div> : runner.session.logId ? <Panel className="session-outcome-panel" title="Esito sessione" index="✓">
        <div className="session-outcome-choice" role="group" aria-label="Esito della sessione"><button className={outcome === 'completed' ? 'active' : ''} onClick={() => { setOutcome('completed'); setMissedIds([]); setError('') }}><Check size={18} /><span><b>Completata</b><small>Ho eseguito tutti gli esercizi.</small></span></button><button className={outcome === 'partial' ? 'active partial' : ''} onClick={() => { setOutcome('partial'); setError('') }}><TriangleAlert size={18} /><span><b>Non completata</b><small>Indicherò cosa non ho eseguito.</small></span></button></div>
        {outcome === 'partial' && <fieldset className="missed-exercises"><legend>Cosa non hai eseguito?</legend>{runner.exercises.map(exercise => <label className={exercise.progress?.completed ? 'is-disabled' : ''} key={exercise.id}><input type="checkbox" checked={missedIds.includes(exercise.id)} disabled={Boolean(exercise.progress?.completed)} onChange={() => toggleMissed(exercise.id)} /><span><b>{exercise.name}</b><small>{exercise.progress?.completed ? 'Già registrato' : formatPrescription(exercise)}</small></span></label>)}</fieldset>}
        <div className="session-feedback"><label><span>RPE sessione</span><input type="number" min="0" max="10" step="0.5" value={sessionRpe} onChange={event => setSessionRpe(event.target.value)} /></label><label><span>Note</span><textarea value={sessionNote} onChange={event => setSessionNote(event.target.value)} placeholder="Sensazioni, dolore, osservazioni…" /></label></div>
        <button className="button button--signal button--wide session-submit" disabled={!outcome || saveState === 'finishing'} onClick={() => void completeCurrentSession()}><span>{saveState === 'finishing' ? 'Salvataggio…' : 'Registra esito sessione'}</span><ArrowRight size={17} /></button>
      </Panel> : <div className="session-dock"><div><small>SESSIONE PRONTA</small><b>{runner.session.title}</b></div><button className="button button--signal" disabled={saveState === 'starting'} onClick={startCurrentSession}><span>{saveState === 'starting' ? 'Avvio…' : 'Avvia sessione'}</span><Play size={17} /></button></div>}

      {error && <div className={'completion-banner ' + (saveState === 'queued' ? 'completion-banner--queued' : 'completion-banner--error')}><TriangleAlert size={19} /><div><b>{saveState === 'queued' ? 'Sessione in attesa di sincronizzazione' : 'Operazione non completata'}</b><span>{error}</span></div></div>}
      {saveState === 'saved' && <div className="completion-banner"><Check size={19} /><div><b>Esito salvato</b><span>La sessione e gli esercizi eseguiti sono stati registrati.</span></div></div>}
    </div>
  )
}

function DashboardScreen({ profile, goTo, openAthlete }: { profile: AppProfile; goTo: (view: ViewId) => void; openAthlete: (athleteId: string) => void }) {
  const [data, setData] = useState<CoachDashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setError('')
    loadCoachDashboard(profile).then(value => { if (active) setData(value) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Dashboard non disponibile.') })
    return () => { active = false }
  }, [profile])

  if (error) return <div className="screen"><ScreenHeader eyebrow="COACH / PORTAFOGLIO" title="Dati coach non disponibili." text={error} action={<button className="button button--secondary" onClick={() => window.location.reload()}>Riprova</button>} /></div>
  if (!data) return <div className="screen"><ScreenHeader eyebrow="COACH / PORTAFOGLIO" title="Sto leggendo il lavoro degli atleti." text="Programmi, sessioni e test vengono ricomposti dal backend." /><Panel title="Caricamento" index="01"><div className="skeleton-stack"><span /><span /><span /></div></Panel></div>

  const totalRelationships = data.relationshipDistribution.active + data.relationshipDistribution.inactive + data.relationshipDistribution.pending
  const activeShare = totalRelationships ? Math.round(data.relationshipDistribution.active / totalRelationships * 100) : 0
  return (
    <div className="screen">
      <ScreenHeader eyebrow="COACH / PORTAFOGLIO" title={`${data.activeAthletes} ${data.activeAthletes === 1 ? 'atleta attivo' : 'atleti attivi'}, ${data.needsReview} da rivedere.`} text="La dashboard mette prima eccezioni e aderenza, leggendo programmi, sessioni e test aggiornati." action={<div className="header-actions"><Tag tone={data.source === 'legacy-v1' ? 'success' : 'neutral'}>{data.source === 'legacy-v1' ? 'DATI LIVE' : 'DEMO'}</Tag><button className="button button--primary" onClick={() => goTo('athletes')}><Users size={16} /> Gestisci atleti</button></div>} />
      <div className="coach-summary">
        <Metric label="Atleti attivi" value={String(data.activeAthletes).padStart(2, '0')} />
        <Metric label="Aderenza media" value={data.averageAdherence === null ? '—' : String(data.averageAdherence)} unit={data.averageAdherence === null ? undefined : '%'} />
        <Metric label="Da rivedere" value={String(data.needsReview).padStart(2, '0')} signal={data.needsReview > 0} />
      </div>
      <div className="grid grid--2-1">
        <Panel title="Atleti" index="01" action={<button className="icon-button" onClick={() => goTo('athletes')} aria-label="Gestisci atleti"><Search size={17} /></button>}>
          <div className="athlete-list">
            {data.athletes.length === 0 && <div className="empty-state"><Users size={22} /><b>Nessun atleta collegato</b><span>Crea il primo invito dalla gestione atleti.</span></div>}
            {data.athletes.map(athlete => (
              <button className="athlete" key={athlete.id} onClick={() => openAthlete(athlete.id)}>
                <span className="avatar">{athlete.initials}</span>
                <span className="athlete__copy"><b>{athlete.name}</b><small>{athlete.programLabel}</small></span>
                <span className="athlete__score"><b>{athlete.adherence ?? '—'}</b><small>{athlete.adherence === null ? 'N/D' : '%'}</small></span>
                <Tag tone={athlete.relationshipStatus !== 'active' || athlete.needsAttention ? 'warning' : 'success'}>{athlete.relationshipStatus !== 'active' ? athlete.relationshipStatus : athlete.needsAttention ? 'Controlla' : 'In linea'}</Tag>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Attenzione" index="02">
          {data.alerts.length === 0 && <div className="empty-state empty-state--compact"><Check size={20} /><b>Nessuna eccezione aperta</b><span>Il portafoglio è allineato.</span></div>}
          {data.alerts.map(alert => <div className={`alert-card ${alert.tone === 'neutral' ? 'alert-card--neutral' : ''}`} key={alert.id}>{alert.tone === 'warning' ? <TriangleAlert size={20} /> : <ClipboardCheck size={20} />}<div><b>{alert.title}</b><p>{alert.detail}</p><button onClick={() => openAthlete(alert.athleteId)}>Apri atleta</button></div></div>)}
        </Panel>
      </div>
      <div className="grid grid--2">
        <Panel title="Aderenza / ultime settimane" index="03">{data.adherenceTrend.length ? <Bars values={data.adherenceTrend} accentAt={data.adherenceTrend.length - 1} /> : <div className="empty-state empty-state--compact"><TrendingUp size={20} /><b>Trend in costruzione</b><span>Comparirà dopo le prime settimane pianificate.</span></div>}<div className="chart-legend"><span><i className="purple" /> Completato</span><span><i className="mustard" /> Settimana corrente</span></div></Panel>
        <Panel title="Relazioni atleti" index="04"><div className="distribution"><div className="donut" style={{ background: `conic-gradient(var(--purple-700) 0 ${activeShare}%, var(--mustard-500) ${activeShare}% 100%)` }}><span>{activeShare}<small>%</small></span></div><ul><li><i className="purple" /> Attivi <b>{data.relationshipDistribution.active}</b></li><li><i className="mustard" /> Inattivi <b>{data.relationshipDistribution.inactive}</b></li><li><i className="pale" /> In attesa <b>{data.relationshipDistribution.pending}</b></li></ul></div></Panel>
      </div>
    </div>
  )
}

function AthleteManagementScreen({ profile, selectedAthleteId, setSelectedAthleteId, goTo, goToAthlete }: { profile: AppProfile; selectedAthleteId: string; setSelectedAthleteId: (athleteId: string) => void; goTo: (view: ViewId) => void; goToAthlete: (view: 'builder' | 'test', athleteId: string) => void }) {
  const [data, setData] = useState<AthleteManagementData | null>(null)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'saving'>('loading')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null)

  const refresh = async () => {
    setState('loading')
    setError('')
    try { setData(await loadAthleteManagement(profile)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Elenco atleti non disponibile.') } finally { setState('idle') }
  }
  useEffect(() => { void refresh() }, [profile])

  const submitInvite = async (event: FormEvent) => {
    event.preventDefault()
    setState('saving'); setError(''); setMessage('')
    try {
      if (!selectedAthleteId) throw new Error('Seleziona prima un atleta.')
      const savedEmail = data?.athletes.find(athlete => athlete.id === selectedAthleteId)?.email ?? ''
      const result = await inviteAthlete(profile, selectedAthleteId, resolveInvitationEmail(email, savedEmail))
      setMessage(result.delivered ? 'Invito registrato e link di accesso inviato.' : `Invito registrato. Invio email non confermato${result.deliveryError ? `: ${result.deliveryError}` : '.'}`)
      setEmail('')
      setData(await loadAthleteManagement(profile))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Invito non creato.') } finally { setState('idle') }
  }

  const submitAthlete = async (event: FormEvent) => {
    event.preventDefault(); setState('saving'); setError(''); setMessage('')
    try {
      const athleteId = await createManagedAthlete(profile, firstName, lastName, email)
      setFirstName(''); setLastName(''); setEmail(''); setMessage('Atleta creato. Puoi già aprire il profilo e preparare programma e test.'); setData(await loadAthleteManagement(profile)); setSelectedAthleteId(athleteId)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Atleta non creato.') } finally { setState('idle') }
  }

  const decideRequest = async (requestId: string, accept: boolean) => {
    setState('saving'); setError(''); setMessage('')
    try { await decideCoachLinkRequest(profile, requestId, accept); setMessage(accept ? 'Richiesta accettata: atleta collegato.' : 'Richiesta rifiutata.'); setData(await loadAthleteManagement(profile)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Richiesta non aggiornata.') } finally { setState('idle') }
  }

  const changeStatus = async (athleteId: string, status: 'active' | 'inactive') => {
    setState('saving'); setError(''); setMessage('')
    try { await setAthleteStatus(profile, athleteId, status); setMessage(status === 'active' ? 'Atleta riattivato.' : 'Atleta sospeso. Storico e allenamenti restano intatti.'); setData(await loadAthleteManagement(profile)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Stato non aggiornato.') } finally { setState('idle') }
  }

  const revoke = async (invitationId: string) => {
    setState('saving'); setError(''); setMessage('')
    try { await revokeInvitation(profile, invitationId); setMessage('Invito revocato senza cancellare alcun dato.'); setData(await loadAthleteManagement(profile)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Invito non revocato.') } finally { setState('idle') }
  }

  const removeAthlete = async () => {
    if (!removeTarget) return
    setState('saving'); setError(''); setMessage('')
    try {
      await removeAthleteRelationship(profile, removeTarget.id)
      setSelectedAthleteId('')
      setRemoveTarget(null)
      setMessage('Collegamento rimosso. Profilo, allenamenti completati, log esercizi e test dell’atleta sono rimasti intatti.')
      setData(await loadAthleteManagement(profile))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Atleta non rimosso.') } finally { setState('idle') }
  }

  const selectedAthlete = data?.athletes.find(athlete => athlete.id === selectedAthleteId)

  if (selectedAthlete) return <div className="screen athlete-detail-screen">
    <button className="back-button" onClick={() => { setSelectedAthleteId(''); goTo('dashboard') }}><ArrowLeft size={17} /> Torna alla dashboard coach</button>
    <ScreenHeader eyebrow="COACH / DETTAGLIO ATLETA" title={selectedAthlete.name} text="Da qui apri il programma, consulta o registra i test e gestisci il collegamento con il coach." action={<Tag tone={selectedAthlete.status === 'active' ? 'success' : 'warning'}>{selectedAthlete.status}</Tag>} />
    <div className="athlete-detail-grid">
      <button className="athlete-action-card" onClick={() => goToAthlete('builder', selectedAthlete.id)}><SlidersHorizontal size={22} /><span><b>Programma di esercizi</b><small>Apri schede, settimane, sessioni e parametri.</small></span><ArrowRight size={18} /></button>
      <button className="athlete-action-card" onClick={() => goToAthlete('test', selectedAthlete.id)}><TestTube2 size={22} /><span><b>Test e progressi</b><small>Consulta lo storico o registra una nuova rilevazione.</small></span><ArrowRight size={18} /></button>
    </div>
    <Panel title="Gestione collegamento" index="03"><div className="relationship-actions"><div><b>Rimuovi atleta dal coach</b><p>Viene eliminato solo il collegamento. L’account dell’atleta e tutto il suo storico restano nel database.</p></div><button className="button button--danger" disabled={state === 'saving'} onClick={() => setRemoveTarget({ id: selectedAthlete.id, name: selectedAthlete.name })}><Trash2 size={16} /> Rimuovi atleta</button></div></Panel>
    <Panel title="Accesso app" index="04">{selectedAthlete.appAccessActive ? <div className="completion-banner"><Check size={19} /><div><b>Accesso app attivo</b><span>L’account è collegato a questa identità atleta.</span></div></div> : <form className="invite-form" onSubmit={submitInvite}><b>Accesso app non attivo</b><label><span>Email atleta</span><input className="standalone-input" type="email" value={email || selectedAthlete.email || ''} onChange={event => setEmail(event.target.value)} required /></label><button className="button button--signal" disabled={state === 'saving'}><Mail size={16} /> Invita alla app</button></form>}</Panel>
    {error && <div className="completion-banner completion-banner--error"><TriangleAlert size={19} /><div><b>Operazione non completata</b><span>{error}</span></div></div>}
    {message && <div className="completion-banner"><ShieldCheck size={19} /><div><b>Operazione confermata</b><span>{message}</span></div></div>}
    {removeTarget && <ConfirmDialog title={`Rimuovere ${removeTarget.name}?`} text="Perderai l’accesso coach ai suoi dati finché non verrà collegato di nuovo. Profilo, allenamenti completati, esercizi registrati e test non saranno cancellati." confirmLabel="Rimuovi atleta" busy={state === 'saving'} onCancel={() => setRemoveTarget(null)} onConfirm={() => void removeAthlete()} />}
  </div>

  return <div className="screen">
    <ScreenHeader eyebrow="COACH / ATLETI" title="Crea l’atleta, poi lavora subito." text="L’account app è facoltativo e può essere collegato in seguito senza cambiare atleta o perdere lo storico." action={data && <Tag tone={data.source === 'legacy-v1' ? 'success' : 'neutral'}>{data.source === 'legacy-v1' ? 'DATI LIVE' : 'DEMO'}</Tag>} />
    <div className="grid grid--2-1">
      <Panel title="Atleti collegati" index="01">
        {state === 'loading' && !data && <div className="skeleton-stack"><span /><span /><span /></div>}
        {data?.athletes.length === 0 && <div className="empty-state"><Users size={22} /><b>Nessun atleta collegato</b><span>Creane uno: l’email non è obbligatoria.</span></div>}
        <div className="management-list">{data?.athletes.map(athlete => <div className="management-row" key={athlete.id}><button className="management-athlete-link" onClick={() => { setEmail(athlete.email ?? ''); setSelectedAthleteId(athlete.id) }}><span className="avatar">{athlete.initials}</span><span><b>{athlete.name}</b><small>{athlete.appAccessActive ? 'Accesso app attivo' : 'Accesso app non attivo'}</small></span></button><Tag tone={athlete.status === 'active' ? 'success' : 'warning'}>{athlete.status}</Tag><button className="button button--secondary" disabled={state === 'saving'} onClick={() => void changeStatus(athlete.id, athlete.status === 'active' ? 'inactive' : 'active')}>{athlete.status === 'active' ? 'Sospendi' : 'Riattiva'}</button></div>)}</div>
      </Panel>
      <Panel title="Aggiungi nuovo atleta" index="02">
        <form className="invite-form" onSubmit={submitAthlete}><label><span>Nome *</span><input className="standalone-input" value={firstName} onChange={event => setFirstName(event.target.value)} required /></label><label><span>Cognome *</span><input className="standalone-input" value={lastName} onChange={event => setLastName(event.target.value)} required /></label><label><span>Email (facoltativa)</span><input className="standalone-input" type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><p>L’atleta viene creato subito. L’invito alla app resta un’azione separata.</p><button className="button button--signal button--wide" disabled={state === 'saving'}><Plus size={16} /> {state === 'saving' ? 'Creazione…' : 'Crea atleta'}</button></form>
      </Panel>
    </div>
    {error && <div className="completion-banner completion-banner--error"><TriangleAlert size={19} /><div><b>Operazione non completata</b><span>{error}</span></div></div>}
    {message && <div className="completion-banner"><ShieldCheck size={19} /><div><b>Operazione confermata</b><span>{message}</span></div></div>}
    <Panel title="Storico inviti" index="03">
      {data?.invitations.length === 0 && <div className="empty-state empty-state--compact"><Mail size={20} /><b>Nessun invito</b><span>Gli inviti inviati compariranno qui.</span></div>}
      <div className="invitation-list">{data?.invitations.map(invite => <div className="invitation-row" key={invite.id}><div><b>{invite.email}</b><small>{new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(invite.invitedAt))}</small></div><Tag tone={invite.status === 'accepted' ? 'success' : invite.status === 'pending' ? 'signal' : 'warning'}>{invite.status}</Tag>{invite.status === 'pending' ? <button className="text-button" disabled={state === 'saving'} onClick={() => void revoke(invite.id)}>Revoca</button> : <span />}</div>)}</div>
    </Panel>
    <Panel title="Richieste di collegamento" index="04">{data?.linkRequests.filter(request => request.status === 'pending').length === 0 && <div className="empty-state empty-state--compact"><Users size={20} /><b>Nessuna richiesta</b></div>}<div className="invitation-list">{data?.linkRequests.filter(request => request.status === 'pending').map(request => <div className="invitation-row" key={request.id}><div><b>{request.athleteName}</b><small>Richiesta atleta</small></div><button className="button button--secondary" disabled={state === 'saving'} onClick={() => void decideRequest(request.id, false)}>Rifiuta</button><button className="button button--signal" disabled={state === 'saving'} onClick={() => void decideRequest(request.id, true)}>Accetta</button></div>)}</div></Panel>
  </div>
}

function BuilderScreen({ profile, selectedAthleteId }: { profile: AppProfile; selectedAthleteId: string }) {
  const [data, setData] = useState<ProgramBuilderData | null>(null)
  const [athleteId, setAthleteId] = useState(selectedAthleteId)
  const [programId, setProgramId] = useState('')
  const [weekId, setWeekId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [exerciseId, setExerciseId] = useState('')
  const [state, setState] = useState<'loading' | 'idle' | 'saving'>('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [newProgram, setNewProgram] = useState({ name: '', goal: '' })
  const [newExercise, setNewExercise] = useState('')
  const [libraryId, setLibraryId] = useState('')
  const [weekDetails, setWeekDetails] = useState({ blockName: '', phase: '' })
  const [sessionDetails, setSessionDetails] = useState({ title: '', objective: '', durationMinutes: 0, scheduledDay: 1 })
  const [patch, setPatch] = useState<ExercisePatch>({ sets: 3, reps: 5, seconds: 0, loadKg: 0, rpe: 7, restSeconds: 120, instructions: '' })
  const initialAthleteApplied = useRef(false)

  const refresh = async () => {
    const next = await loadProgramBuilder(profile)
    setData(next)
    return next
  }

  useEffect(() => { refresh().catch(reason => setError(reason instanceof Error ? reason.message : 'Programmi non caricati.')).finally(() => setState('idle')) }, [profile.userId])
  useEffect(() => {
    if (!data) return
    if (!initialAthleteApplied.current) {
      initialAthleteApplied.current = true
      if (selectedAthleteId && data.athletes.some(athlete => athlete.id === selectedAthleteId)) { setAthleteId(selectedAthleteId); return }
    }
    if (!data.athletes.some(athlete => athlete.id === athleteId)) setAthleteId(data.athletes[0]?.id ?? '')
  }, [data, athleteId, selectedAthleteId])
  const athletePrograms = data?.programs.filter(program => program.athleteId === athleteId) ?? []
  useEffect(() => { if (!athletePrograms.some(program => program.id === programId)) setProgramId(athletePrograms[0]?.id ?? '') }, [athleteId, data, programId])
  const weeks = data?.weeks.filter(week => week.programId === programId) ?? []
  useEffect(() => { if (!weeks.some(week => week.id === weekId)) setWeekId(weeks[0]?.id ?? '') }, [programId, data, weekId])
  const sessions = data?.sessions.filter(session => session.weekId === weekId) ?? []
  useEffect(() => { if (!sessions.some(session => session.id === sessionId)) setSessionId(sessions[0]?.id ?? '') }, [weekId, data, sessionId])
  const exercises = data?.exercises.filter(exercise => exercise.sessionId === sessionId) ?? []
  useEffect(() => { if (!exercises.some(exercise => exercise.id === exerciseId)) setExerciseId(exercises[0]?.id ?? '') }, [sessionId, data, exerciseId])
  const program = data?.programs.find(item => item.id === programId)
  const session = data?.sessions.find(item => item.id === sessionId)
  const exercise = data?.exercises.find(item => item.id === exerciseId)

  useEffect(() => {
    const week = data?.weeks.find(item => item.id === weekId)
    setWeekDetails({ blockName: week?.blockName ?? '', phase: week?.phase ?? '' })
  }, [data, weekId])
  useEffect(() => {
    setSessionDetails({ title: session?.title ?? '', objective: session?.objective ?? '', durationMinutes: session?.durationMinutes ?? 0, scheduledDay: session?.scheduledDay ?? 1 })
  }, [session])

  useEffect(() => {
    if (!exercise) return
    setPatch({ sets: Number(exercise.prescription.sets) || 1, reps: Number(exercise.prescription.reps) || 0, seconds: Number(exercise.prescription.seconds) || 0, loadKg: Number(exercise.prescription.loadKg) || 0, rpe: exercise.targetRpeMax ?? 7, restSeconds: exercise.restSeconds ?? 120, instructions: exercise.instructions ?? '' })
  }, [exercise])

  const run = async (operation: () => Promise<void>, success: string) => {
    setState('saving'); setError(''); setMessage('')
    try { await operation(); await refresh(); setMessage(success) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Operazione non completata.') } finally { setState('idle') }
  }
  const submitProgram = (event: FormEvent) => {
    event.preventDefault()
    if (!athleteId || !newProgram.name.trim()) return
    void run(async () => { const id = await createProgram(profile, athleteId, newProgram.name, newProgram.goal); setProgramId(id); setNewProgram({ name: '', goal: '' }) }, 'Bozza creata. Ora aggiungi una settimana.')
  }
  const addWeek = () => void run(async () => { const id = await createWeek(profile, programId, weeks.map(week => week.weekNumber)); setWeekId(id) }, 'Settimana aggiunta senza modificare le precedenti.')
  const addSession = () => void run(async () => { const id = await createSession(profile, weekId, sessions.map(item => item.order)); setSessionId(id) }, 'Sessione aggiunta.')
  const submitExercise = (event: FormEvent) => {
    event.preventDefault()
    const libraryExercise = data?.library.find(item => item.id === libraryId)
    if (!sessionId || (!libraryExercise && !newExercise.trim())) return
    void run(async () => { const id = await addExercise(profile, sessionId, exercises.map(item => item.order), newExercise, libraryExercise); setExerciseId(id); setNewExercise(''); setLibraryId('') }, 'Esercizio aggiunto alla sessione.')
  }
  const saveParameters = () => exercise && void run(() => updateExercise(profile, exercise.id, patch), 'Parametri salvati sul programma.')
  const saveWeek = () => weekId && void run(() => updateWeekDetails(profile, weekId, weekDetails.blockName, weekDetails.phase), 'Dettagli della settimana salvati.')
  const saveSession = () => sessionId && void run(() => updateSessionDetails(profile, sessionId, sessionDetails.title, sessionDetails.objective, sessionDetails.durationMinutes, sessionDetails.scheduledDay), 'Dettagli della sessione salvati.')
  const publish = () => {
    if (!data || !program || !canPublishProgram(program.id, data)) { setError('Per pubblicare servono almeno una settimana, una sessione e un esercizio.'); return }
    void run(() => publishProgram(profile, program.id, program.athleteId), 'Programma pubblicato. Il precedente resta archiviato e consultabile.')
  }

  if (state === 'loading' && !data) return <div className="screen"><ScreenHeader eyebrow="PROGRAM BUILDER" title="Carico la programmazione…" text="Recupero atleti, programmi e libreria esercizi." /><div className="skeleton-stack"><span /><span /><span /></div></div>

  return <div className="screen">
    <ScreenHeader eyebrow="PROGRAM BUILDER / LIVE" title={program?.name ?? 'Nuovo programma'} text="Costruisci la scheda per livelli. Ogni salvataggio è verificato dal database e lo storico non viene eliminato." action={<div className="header-actions"><Tag tone={data?.source === 'legacy-v1' ? 'success' : 'neutral'}>{data?.source === 'legacy-v1' ? 'DATI LIVE' : 'DEMO'}</Tag><button className="button button--primary" disabled={!program || state === 'saving' || program.status === 'active'} onClick={publish}><Save size={16} /> {program?.status === 'active' ? 'Pubblicato' : 'Pubblica'}</button></div>} />
    <div className="builder-toolbar">
      <label><span>Atleta</span><select value={athleteId} onChange={event => setAthleteId(event.target.value)} disabled={state === 'saving'}>{data?.athletes.map(athlete => <option key={athlete.id} value={athlete.id}>{athlete.name}</option>)}</select></label>
      <label><span>Programma</span><select value={programId} onChange={event => setProgramId(event.target.value)} disabled={state === 'saving'}><option value="">Nuova bozza…</option>{athletePrograms.map(item => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label>
      {program && <div className="builder-program-status"><small>STATO</small><Tag tone={program.status === 'active' ? 'success' : program.status === 'draft' ? 'signal' : 'neutral'}>{program.status}</Tag><span>{program.goal || 'Obiettivo da definire'}</span></div>}
    </div>
    {!data?.athletes.length && <Panel title="Nessun atleta attivo" index="00"><div className="empty-state"><Users size={22} /><b>Collega o riattiva un atleta</b><span>Il builder mostra soltanto le relazioni coach-atleta attive.</span></div></Panel>}
    {!!athleteId && !program && <Panel title="Crea una bozza" index="00"><form className="builder-create-form" onSubmit={submitProgram}><label><span>Nome programma</span><input className="standalone-input" value={newProgram.name} onChange={event => setNewProgram(current => ({ ...current, name: event.target.value }))} placeholder="Es. Forza dita · Autunno" required /></label><label><span>Obiettivo</span><input className="standalone-input" value={newProgram.goal} onChange={event => setNewProgram(current => ({ ...current, goal: event.target.value }))} placeholder="Obiettivo del blocco" /></label><button className="button button--signal" disabled={state === 'saving'}><Plus size={16} /> Crea bozza</button></form></Panel>}
    {program && <div className="builder-layout">
      <Panel className="week-rail" title="Settimane" index="01">
        {weeks.map(week => <button className={week.id === weekId ? 'active' : ''} key={week.id} onClick={() => setWeekId(week.id)}><span>W{String(week.weekNumber).padStart(2, '0')}</span><b>{week.blockName || `Settimana ${week.weekNumber}`}</b><em>{week.phase || week.status}</em></button>)}
        <button className="add-row" disabled={state === 'saving'} onClick={addWeek}><Plus size={15} /> Aggiungi</button>
      </Panel>
      <div className="builder-main">
        {!weekId && <Panel title="Inizia dalla struttura" index="02"><div className="empty-state"><Layers3 size={22} /><b>Aggiungi la prima settimana</b><span>Le sessioni appariranno dentro la settimana selezionata.</span></div></Panel>}
        {weekId && <Panel title={session?.title ?? 'Sessioni'} index="02" action={<button className="button button--secondary" disabled={state === 'saving'} onClick={addSession}><Plus size={15} /> Sessione</button>}>
          <div className="builder-details builder-details--week"><label><span>Blocco settimana</span><input value={weekDetails.blockName} onChange={event => setWeekDetails(value => ({ ...value, blockName: event.target.value }))} /></label><label><span>Fase</span><input value={weekDetails.phase} onChange={event => setWeekDetails(value => ({ ...value, phase: event.target.value }))} /></label><button className="text-button" disabled={state === 'saving'} onClick={saveWeek}><Save size={14} /> Salva settimana</button></div>
          <div className="session-tabs">{sessions.map(item => <button className={item.id === sessionId ? 'active' : ''} key={item.id} onClick={() => setSessionId(item.id)}><b>S{String(item.order).padStart(2, '0')}</b><span>{item.title}</span></button>)}</div>
          {!sessionId && <div className="empty-state empty-state--compact"><TimerReset size={20} /><b>Aggiungi la prima sessione</b></div>}
          {sessionId && <div className="builder-details builder-details--session"><label><span>Titolo sessione</span><input value={sessionDetails.title} onChange={event => setSessionDetails(value => ({ ...value, title: event.target.value }))} /></label><label><span>Obiettivo</span><input value={sessionDetails.objective} onChange={event => setSessionDetails(value => ({ ...value, objective: event.target.value }))} /></label><label><span>Durata</span><input type="number" min="0" value={sessionDetails.durationMinutes} onChange={event => setSessionDetails(value => ({ ...value, durationMinutes: Number(event.target.value) }))} /></label><label><span>Giorno 1–7</span><input type="number" min="1" max="7" value={sessionDetails.scheduledDay} onChange={event => setSessionDetails(value => ({ ...value, scheduledDay: Number(event.target.value) }))} /></label><button className="text-button" disabled={state === 'saving'} onClick={saveSession}><Save size={14} /> Salva sessione</button></div>}
          {exercises.map(item => <button className={`exercise-block ${item.id === exerciseId ? 'active' : ''}`} key={item.id} onClick={() => setExerciseId(item.id)}><span className="drag-handle">⠿</span><span className="exercise-number">{String(item.order).padStart(2, '0')}</span><div><b>{item.name}</b><small>{prescriptionSummary(item)}</small></div><Tag tone="purple">Esercizio</Tag><ChevronDown size={17} /></button>)}
          {sessionId && <form className="exercise-adder" onSubmit={submitExercise}><select value={libraryId} onChange={event => setLibraryId(event.target.value)}><option value="">Esercizio rapido…</option>{data?.library.map(item => <option value={item.id} key={item.id}>{item.name}{item.category ? ` · ${item.category}` : ''}</option>)}</select>{!libraryId && <input value={newExercise} onChange={event => setNewExercise(event.target.value)} placeholder="Nome esercizio" />}<button className="drop-zone" disabled={state === 'saving'}><Plus size={17} /> Aggiungi alla sessione</button></form>}
        </Panel>}
      </div>
      <Panel className="inspector" title="Parametri" index="03">
        {!exercise && <div className="empty-state empty-state--compact"><Settings2 size={20} /><b>Seleziona un esercizio</b><span>Qui modificherai volume, carico, RPE e recupero.</span></div>}
        {exercise && <>
          <label><span>Serie</span><div className="stepper"><button onClick={() => setPatch(value => ({ ...value, sets: Math.max(1, value.sets - 1) }))}>−</button><b>{patch.sets}</b><button onClick={() => setPatch(value => ({ ...value, sets: value.sets + 1 }))}>+</button></div></label>
          <label><span>Ripetizioni</span><div className="input-shell"><input type="number" min="0" value={patch.reps} onChange={event => setPatch(value => ({ ...value, reps: Number(event.target.value) }))} /><em>rep</em></div></label>
          <label><span>Durata</span><div className="input-shell"><input type="number" min="0" value={patch.seconds} onChange={event => setPatch(value => ({ ...value, seconds: Number(event.target.value) }))} /><em>sec</em></div></label>
          <label><span>Carico</span><div className="input-shell"><input type="number" min="0" step="0.5" value={patch.loadKg} onChange={event => setPatch(value => ({ ...value, loadKg: Number(event.target.value) }))} /><em>kg</em></div></label>
          <label><span>Recupero</span><div className="input-shell"><input type="number" min="0" step="15" value={patch.restSeconds} onChange={event => setPatch(value => ({ ...value, restSeconds: Number(event.target.value) }))} /><em>sec</em></div></label>
          <label><span>RPE target</span><div className="rpe-scale">{[6, 7, 8, 9, 10].map(value => <button className={value === patch.rpe ? 'active' : ''} key={value} onClick={() => setPatch(current => ({ ...current, rpe: value }))}>{value}</button>)}</div></label>
          <label className="inspector-notes"><span>Indicazioni</span><textarea value={patch.instructions} onChange={event => setPatch(value => ({ ...value, instructions: event.target.value }))} /></label>

          <ExerciseTestTargetPanel
            profile={profile}
            athleteId={athleteId}
            exerciseId={exercise.id}
            setCount={patch.sets}
          />
          <button className="button button--signal button--wide" disabled={state === 'saving'} onClick={saveParameters}><Save size={15} /> {state === 'saving' ? 'Salvo…' : 'Salva parametri'}</button>
        </>}
      </Panel>
    </div>}
    {error && <div className="completion-banner completion-banner--error"><TriangleAlert size={19} /><div><b>Operazione non completata</b><span>{error}</span></div></div>}
    {message && <div className="completion-banner"><ShieldCheck size={19} /><div><b>Program Builder aggiornato</b><span>{message}</span></div></div>}
  </div>
}

function LibraryScreen({ profile }: { profile: AppProfile }) {
  const [items, setItems] = useState<ExerciseLibraryItem[]>([])
  const [source, setSource] = useState<'demo' | 'legacy-v1'>('demo')
  const [selectedId, setSelectedId] = useState('')
  const [input, setInput] = useState<ExerciseLibraryInput>(emptyExercise)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<LibraryStatusFilter>('active')
  const [state, setState] = useState<'loading' | 'idle' | 'saving'>('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ExerciseLibraryItem | null>(null)

  const refresh = async () => {
    const next = await loadExerciseLibrary(profile)
    setItems(next.items); setSource(next.source)
    return next.items
  }

  useEffect(() => { refresh().then(next => setSelectedId(current => current || next.find(item => !item.archived)?.id || next[0]?.id || '')).catch(reason => setError(reason instanceof Error ? reason.message : 'Libreria non caricata.')).finally(() => setState('idle')) }, [profile.userId])
  const selected = items.find(item => item.id === selectedId)
  useEffect(() => {
    if (!selected) { setInput(emptyExercise()); return }
    setInput({ name: selected.name, category: selected.category, modality: selected.modality, description: selected.description, defaultInstructions: selected.defaultInstructions, defaultPrescription: { ...selected.defaultPrescription } })
  }, [selected])

  const categories = [...new Set(items.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'))
  const visibleItems = filterExercises(items, search, category, status)
  const usedCount = items.filter(item => item.usageCount > 0).length

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateExercise(input)
    if (validationError) { setError(validationError); return }
    setState('saving'); setError(''); setMessage('')
    try {
      if (selected) {
        await updateLibraryExercise(profile, selected.id, input)
        setMessage('Esercizio aggiornato. Le sessioni già svolte conservano i valori registrati.')
      } else {
        const id = await createLibraryExercise(profile, input)
        setSelectedId(id); setMessage('Esercizio creato e disponibile nel Program Builder.')
      }
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Esercizio non salvato.') } finally { setState('idle') }
  }

  const toggleArchive = () => {
    if (!selected) return
    setState('saving'); setError(''); setMessage('')
    setLibraryExerciseArchived(profile, selected.id, !selected.archived).then(async () => {
      await refresh()
      setMessage(selected.archived ? 'Esercizio ripristinato nella libreria attiva.' : 'Esercizio archiviato. Rimane nelle sessioni e nello storico.')
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Stato non aggiornato.')).finally(() => setState('idle'))
  }

  const removeExercise = async () => {
    if (!deleteTarget) return
    setState('saving'); setError(''); setMessage('')
    try {
      await deleteLibraryExercise(profile, deleteTarget.id)
      const remaining = await refresh()
      setSelectedId(remaining.find(item => !item.archived)?.id ?? remaining[0]?.id ?? '')
      setDeleteTarget(null)
      setMessage('Esercizio eliminato definitivamente dalla libreria. Le copie nelle sessioni e i risultati già registrati sono rimasti intatti.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Esercizio non eliminato.') } finally { setState('idle') }
  }

  return <div className="screen">
    <ScreenHeader eyebrow="LIBRERIA / ESERCIZI" title="Un esercizio, una definizione chiara." text="Crea prescrizioni riutilizzabili nei programmi. L’eliminazione richiede conferma e non modifica le sessioni o lo storico già registrati." action={<div className="header-actions"><Tag tone={source === 'legacy-v1' ? 'success' : 'neutral'}>{source === 'legacy-v1' ? 'DATI LIVE' : 'DEMO'}</Tag><button className="button button--signal" onClick={() => { setSelectedId(''); setInput(emptyExercise()); setError(''); setMessage('') }}><Plus size={16} /> Nuovo esercizio</button></div>} />
    <div className="library-summary"><Metric label="Esercizi totali" value={String(items.length).padStart(2, '0')} /><Metric label="In uso" value={String(usedCount).padStart(2, '0')} /><Metric label="Archivio precedente" value={String(items.filter(item => item.archived).length).padStart(2, '0')} /></div>
    <div className="library-layout">
      <Panel className="library-catalog" title="Catalogo" index="01">
        <div className="library-filters"><div className="library-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cerca nome, categoria…" /></div><select value={category} onChange={event => setCategory(event.target.value)}><option value="">Tutte le categorie</option>{categories.map(value => <option key={value}>{value}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value as LibraryStatusFilter)}><option value="active">Attivi</option><option value="archived">Archiviati</option><option value="all">Tutti</option></select></div>
        {state === 'loading' && <div className="skeleton-stack"><span /><span /><span /></div>}
        {!visibleItems.length && state !== 'loading' && <div className="empty-state"><BookOpen size={22} /><b>Nessun esercizio trovato</b><span>Modifica i filtri oppure crea il primo esercizio.</span></div>}
        <div className="exercise-library-list">{visibleItems.map(item => <button className={item.id === selectedId ? 'active' : ''} key={item.id} onClick={() => setSelectedId(item.id)}><span className="exercise-library-list__mark">{item.name.slice(0, 2).toUpperCase()}</span><div><b>{item.name}</b><small>{[item.category, item.modality].filter(Boolean).join(' · ') || 'Senza categoria'}</small></div><span className="exercise-library-list__usage">{item.usageCount}<small>usi</small></span>{item.archived ? <Tag tone="warning">Archivio</Tag> : <ChevronDown size={16} />}</button>)}</div>
      </Panel>
      <Panel className="library-editor" title={selected ? 'Modifica esercizio' : 'Nuovo esercizio'} index="02" action={selected && <Tag tone={selected.archived ? 'warning' : 'success'}>{selected.archived ? 'Archiviato' : 'Attivo'}</Tag>}>
        <form onSubmit={save}>
          <div className="library-form-grid"><label className="library-form-grid__wide"><span>Nome</span><input value={input.name} onChange={event => setInput(value => ({ ...value, name: event.target.value }))} placeholder="Es. Max hang · 20 mm" required /></label><label><span>Categoria</span><input value={input.category} onChange={event => setInput(value => ({ ...value, category: event.target.value }))} placeholder="Dita, Trazione…" /></label><label><span>Modalità</span><input value={input.modality} onChange={event => setInput(value => ({ ...value, modality: event.target.value }))} placeholder="Forza, Isometrico…" /></label><label><span>Serie</span><input type="number" min="1" step="1" value={input.defaultPrescription.sets} onChange={event => setInput(value => ({ ...value, defaultPrescription: { ...value.defaultPrescription, sets: Number(event.target.value) } }))} /></label><label><span>Ripetizioni</span><input type="number" min="0" value={input.defaultPrescription.reps} onChange={event => setInput(value => ({ ...value, defaultPrescription: { ...value.defaultPrescription, reps: Number(event.target.value) } }))} /></label><label><span>Durata</span><div className="input-shell"><input type="number" min="0" value={input.defaultPrescription.seconds} onChange={event => setInput(value => ({ ...value, defaultPrescription: { ...value.defaultPrescription, seconds: Number(event.target.value) } }))} /><em>sec</em></div></label><label><span>Carico</span><div className="input-shell"><input type="number" min="0" step="0.5" value={input.defaultPrescription.loadKg} onChange={event => setInput(value => ({ ...value, defaultPrescription: { ...value.defaultPrescription, loadKg: Number(event.target.value) } }))} /><em>kg</em></div></label><label className="library-form-grid__wide"><span>Descrizione</span><textarea value={input.description} onChange={event => setInput(value => ({ ...value, description: event.target.value }))} placeholder="Scopo e configurazione dell’esercizio" /></label><label className="library-form-grid__wide"><span>Indicazioni predefinite</span><textarea value={input.defaultInstructions} onChange={event => setInput(value => ({ ...value, defaultInstructions: event.target.value }))} placeholder="Tecnica, criteri di stop, sicurezza…" /></label></div>
          {error && <p className="form-error form-error--box" role="alert">{error}</p>}
          <div className="library-actions"><button className="button button--primary" disabled={state === 'saving'}><Save size={16} /> {state === 'saving' ? 'Salvo…' : selected ? 'Salva modifiche' : 'Crea esercizio'}</button>{selected?.archived && <button type="button" className="button button--secondary" disabled={state === 'saving'} onClick={toggleArchive}><Archive size={16} /> Ripristina</button>}{selected && <button type="button" className="button button--danger" disabled={state === 'saving'} onClick={() => setDeleteTarget(selected)}><Trash2 size={16} /> Elimina</button>}</div>
        </form>
      </Panel>
    </div>
    {message && <div className="completion-banner"><ShieldCheck size={19} /><div><b>Libreria aggiornata</b><span>{message}</span></div></div>}
    {deleteTarget && <ConfirmDialog title={`Eliminare ${deleteTarget.name}?`} text={`${deleteTarget.usageCount ? `È usato in ${deleteTarget.usageCount} sessioni. ` : ''}La voce sparirà dalla libreria, ma le sessioni già create e i risultati registrati manterranno nome, parametri e storico.`} confirmLabel="Elimina definitivamente" busy={state === 'saving'} onCancel={() => setDeleteTarget(null)} onConfirm={() => void removeExercise()} />}
  </div>
}

type ScreenProps = {
  goTo: (view: ViewId) => void
  goToAthlete: (view: 'builder' | 'test', athleteId: string) => void
  openAthlete: (athleteId: string) => void
  openSession: (sessionId: string) => void
  profile: AppProfile
  selectedAthleteId: string
  setSelectedAthleteId: (athleteId: string) => void
  selectedSessionId: string
}

const viewMeta: Record<ViewId, { label: string; component: (props: ScreenProps) => ReactNode }> = {
  system: { label: 'Sistema UI', component: () => <SystemScreen /> },
  home: { label: 'Home atleta', component: ({ openSession, profile }) => <HomeScreen openSession={openSession} profile={profile} /> },
  session: { label: 'Sessione', component: ({ profile, selectedSessionId }) => <SessionScreen profile={profile} sessionId={selectedSessionId} /> },
  dashboard: { label: 'Coach dashboard', component: ({ profile, goTo, openAthlete }) => <DashboardScreen profile={profile} goTo={goTo} openAthlete={openAthlete} /> },
  athletes: { label: 'Atleti e inviti', component: ({ profile, goTo, selectedAthleteId, setSelectedAthleteId, goToAthlete }) => <AthleteManagementScreen profile={profile} goTo={goTo} selectedAthleteId={selectedAthleteId} setSelectedAthleteId={setSelectedAthleteId} goToAthlete={goToAthlete} /> },
  builder: { label: 'Program builder', component: ({ profile, selectedAthleteId }) => <BuilderScreen profile={profile} selectedAthleteId={selectedAthleteId} /> },
  library: { label: 'Libreria esercizi', component: ({ profile }) => <LibraryScreen profile={profile} /> },
  test: { label: 'Test / retest', component: ({ profile, selectedAthleteId }) => <TestScreen profile={profile} selectedAthleteId={selectedAthleteId} /> },
  migration: { label: 'Migrazione', component: () => <MigrationScreen /> },
  account: { label: 'Account e sicurezza', component: ({ profile }) => <AccountSecurityScreen profile={profile} /> },
}

export default function App({ profile, onSignOut, initialMode }: { profile: AppProfile; onSignOut: () => Promise<void>; initialMode: AppRole }) {
  const routeNavigate = useNavigate()
  const modes = availableModes(profile.capabilities)
  const [mode, setMode] = useState<AppRole>(() => {
    return modes.includes(initialMode) ? initialMode : defaultMode(profile.capabilities)
  })
  const activeProfile = useMemo(() => ({ ...profile, role: mode }), [mode, profile])
  const roleNavItems = navItems.filter(item => item.roles.includes(mode))
  const initialView: ViewId = mode === 'coach' ? 'dashboard' : 'home'
  const viewStorageKey = `cc-v2:view:${profile.userId}`
  const athleteStorageKey = `cc-v2:athlete:${profile.userId}`
  const sessionStorageKey = `cc-v2:session:${profile.userId}`
  const [view, setView] = useState<ViewId>(() => {
    try {
      const saved = window.localStorage.getItem(viewStorageKey) as ViewId | null
      return saved && navItems.some(item => item.id === saved && item.roles.includes(mode)) ? saved : initialView
    } catch { return initialView }
  })
  const [selectedAthleteId, setSelectedAthleteId] = useState(() => {
    try { return window.localStorage.getItem(athleteStorageKey) ?? '' } catch { return '' }
  })
  const [selectedSessionId, setSelectedSessionId] = useState(() => {
    try { return window.localStorage.getItem(sessionStorageKey) ?? '' } catch { return '' }
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const syncLock = useRef(false)
  const Screen = viewMeta[view].component

  const updateUnsafeView =
    view !== 'home' &&
    view !== 'dashboard'

  useUpdateBlocker(
    `app-view:${profile.userId}`,
    updateUnsafeView,
  )
  const groups = [...new Set(roleNavItems.map(item => item.group))]
  const initials = profile.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'CC'

  const changeMode = (next: AppRole) => {
    if (!modes.includes(next)) return
    setMode(next); setView(next === 'coach' ? 'dashboard' : 'home'); setMenuOpen(false)
    routeNavigate(`/app/${next}`)
    try { window.localStorage.setItem(`cc-mode:${profile.userId}`, next) } catch { /* Storage può essere disabilitato. */ }
  }

  useEffect(() => {
    if (!modes.includes(initialMode) || initialMode === mode) return
    setMode(initialMode)
    setView(initialMode === 'coach' ? 'dashboard' : 'home')
  }, [initialMode, mode, modes])

  useEffect(() => {
    try { window.localStorage.setItem(viewStorageKey, view) } catch { /* Storage può essere disabilitato dal browser. */ }
  }, [view, viewStorageKey])

  useEffect(() => {
    try {
      if (selectedAthleteId) window.localStorage.setItem(athleteStorageKey, selectedAthleteId)
      else window.localStorage.removeItem(athleteStorageKey)
    } catch { /* Storage può essere disabilitato dal browser. */ }
  }, [athleteStorageKey, selectedAthleteId])

  useEffect(() => {
    try {
      if (selectedSessionId) window.localStorage.setItem(sessionStorageKey, selectedSessionId)
      else window.localStorage.removeItem(sessionStorageKey)
    } catch { /* Storage può essere disabilitato dal browser. */ }
  }, [sessionStorageKey, selectedSessionId])

  useEffect(() => {
    const refreshPendingCount = () => {
      countPendingOperations(profile.userId).then(setPendingCount).catch(() => setPendingCount(0))
    }
    refreshPendingCount()
    window.addEventListener(OUTBOX_CHANGED_EVENT, refreshPendingCount)
    window.addEventListener('online', refreshPendingCount)
    return () => {
      window.removeEventListener(OUTBOX_CHANGED_EVENT, refreshPendingCount)
      window.removeEventListener('online', refreshPendingCount)
    }
  }, [profile.userId])

  const synchronizePending = async () => {
    if (!dataRuntime.isConfigured || profile.userId.startsWith('00000000-') || syncLock.current) return
    syncLock.current = true
    setSyncing(true)
    try {
      const result = await flushExerciseOutbox(profile.userId, payload => syncQueuedExercise(profile, payload))
      setPendingCount(result.remaining)
    } catch {
      setPendingCount(await countPendingOperations(profile.userId).catch(() => 0))
    } finally {
      syncLock.current = false
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (navigator.onLine) void synchronizePending()
    const handleOnline = () => void synchronizePending()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [profile.userId])

  useEffect(() => {
    const context = document.modelContext
    if (!context?.registerTool) return
    const lifecycle = new AbortController()
    const registration = context.registerTool({
      name: 'start_training_session',
      title: 'Avvia sessione di allenamento',
      description: 'Apre il runner della sessione assegnata e lo rende visibile nell’app.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Object.keys(input).length > 0) {
          throw new Error('Questo comando non accetta parametri.')
        }
        setView('session')
        setMenuOpen(false)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return { view: 'session', status: 'ready' }
      },
    }, { signal: lifecycle.signal })
    void Promise.resolve(registration).catch(() => undefined)
    return () => lifecycle.abort()
  }, [])

  const navigate = (next: ViewId) => {
    if (!navItems.some(item => item.id === next && item.roles.includes(mode))) return
    if (next === 'athletes') setSelectedAthleteId('')
    if (next === 'session' && mode === 'athlete') setSelectedSessionId('')
    setView(next)
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openSession = (sessionId: string) => {
    setSelectedSessionId(sessionId)
    setView('session')
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openAthlete = (athleteId: string) => {
    setSelectedAthleteId(athleteId)
    setView('athletes')
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goToAthlete = (next: 'builder' | 'test', athleteId: string) => {
    setSelectedAthleteId(athleteId)
    setView(next)
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div className="brand"><div className="brand__mark"><Mountain size={22} /></div><div><b>CLIMBING<br />COACH</b><span>TRAINING SYSTEM</span></div></div>
        <nav aria-label="Navigazione prototipo">
          {groups.map(group => <div className="nav-group" key={group}><small>{group}</small>{roleNavItems.filter(item => item.group === group).map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={17} /><span>{item.label}</span><i>{item.id === 'migration' ? '!' : ''}</i></button> })}</div>)}
        </nav>
        <div className="sidebar__foot"><div><span className={`status-dot ${pendingCount ? 'status-dot--sync' : 'status-dot--ok'}`} /><b>{profile.workspaceName}</b></div><small>{dataRuntime.isConfigured ? 'Supabase collegato' : 'Demo locale'} · {pendingCount ? `${pendingCount} modifiche in coda` : 'coda vuota'}</small></div>
      </aside>
      <div className="app-main">
        <div className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Apri navigazione"><Menu size={20} /></button>
          <div className="topbar__crumb"><span>CC</span><i>/</i><b>{viewMeta[view].label}</b></div>
          <div className="topbar__tools">{modes.length > 1 ? <div className="mode-switch" aria-label="Modalità"><button className={mode === 'coach' ? 'active' : ''} onClick={() => changeMode('coach')}>Coach</button><button className={mode === 'athlete' ? 'active' : ''} onClick={() => changeMode('athlete')}>Atleta</button></div> : <span className="role-chip">{mode === 'coach' ? 'Coach' : 'Atleta'}</span>}<button className="sync-chip" onClick={() => void synchronizePending()} disabled={syncing || pendingCount === 0} title="Sincronizza la coda offline"><span className={`status-dot ${pendingCount ? 'status-dot--sync' : 'status-dot--ok'}`} />{syncing ? 'Sincronizzo…' : pendingCount ? `${pendingCount} in coda` : 'Cloud allineato'}</button><button className="icon-button" aria-label="Ricerca"><Search size={17} /></button><button className="icon-button" aria-label="Account e sicurezza" onClick={() => navigate('account')}><Settings2 size={17} /></button><button className="profile-button" onClick={() => void onSignOut()} title="Esci"><span>{initials}</span><LogOut size={14} /></button></div>
        </div>
        <main><Screen goTo={navigate} goToAthlete={goToAthlete} openAthlete={openAthlete} openSession={openSession} profile={activeProfile} selectedAthleteId={selectedAthleteId} setSelectedAthleteId={setSelectedAthleteId} selectedSessionId={selectedSessionId} /></main>
        <nav className="bottom-nav" aria-label="Navigazione mobile">
          {roleNavItems.filter(item => mode === 'coach' ? ['dashboard', 'athletes', 'builder', 'test'].includes(item.id) : ['home', 'session', 'test'].includes(item.id)).slice(0, 4).map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.shortLabel}</span></button> })}
        </nav>
      </div>
      {menuOpen && <button className="scrim" aria-label="Chiudi navigazione" onClick={() => setMenuOpen(false)} />}
    </div>
  )
}
