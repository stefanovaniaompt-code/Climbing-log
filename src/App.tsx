import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Check,
  ClipboardCheck,
  Home,
  KeyRound,
  LogOut,
  Mail,
  Menu,
  Mountain,
  Pause,
  Play,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TestTube2,
  TimerReset,
  TriangleAlert,
  Users,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react'
import { dataRuntime } from './dataRuntime'
import { countPendingOperations, flushExerciseOutbox, OUTBOX_CHANGED_EVENT } from './outbox'
import { availableModes, defaultMode, type AppProfile, type AppRole } from './onboarding/types'
import { AthleteHomeScreen as HomeScreen } from './dashboard/AthleteHomeScreen'
import { createExerciseTimerState, exerciseTimerPhaseLabel, exerciseTimerProgressLabel, firstOpenExerciseIndex, formatPrescription, getExerciseTimerConfig, getRestSeconds, getSetCount, getVariableSeries, restartExerciseTimerState, restoreExerciseTimerSnapshot, summarizeRunner, tickExerciseTimer, type ExerciseTimerSnapshot, type ExerciseTimerState, type SessionRunnerData } from './session/sessionRunner'
import { autosaveSessionDraft, beginSession, loadSessionRunner, saveExerciseProgress, saveSessionFeedback, syncQueuedExercise } from './session/sessionRunnerRepository'
import { SessionFeedbackPanel } from './session/SessionFeedbackPanel'
import { validateSessionFeedback, type CompletionOutcome, type SessionFeedbackInput } from './session/sessionFeedback'
import { DashboardScreen } from './coach/DashboardScreen'
import { AthleteManagementScreen } from './coach/AthleteManagementScreen'
import { BuilderScreen } from './builder/BuilderScreen'
import { LibraryScreen } from './library/LibraryScreen'
import { TestScreen } from './tests/TestScreen'
import { Panel, ScreenHeader, Tag } from './shared/ui'
import { useScreenWakeLock } from './shared/hooks/useScreenWakeLock'
import { playTimerAudioCue, timerAudioCueForTransition } from './session/timerAudio'
import { useUpdateBlocker } from './pwa/useUpdateBlocker'
import { SystemScreen } from './features/system/SystemScreen'
import { MigrationScreen } from './features/migration/MigrationScreen'
import { AccountSecurityScreen } from './features/account/AccountSecurityScreen'
import { CoachFeedbackScreen } from './feedback/CoachFeedbackScreen'
import { MessagesScreen } from './messaging/MessagesScreen'
import { useMessageNotifications } from './messaging/useMessageNotifications'

type ViewId = 'system' | 'home' | 'session' | 'dashboard' | 'athletes' | 'feedback' | 'messages' | 'builder' | 'library' | 'test' | 'migration' | 'account'

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
  { id: 'feedback', label: 'Feedback', shortLabel: 'Feedback', icon: ClipboardCheck, group: 'Coaching', roles: ['coach'] },
  { id: 'builder', label: 'Program builder', shortLabel: 'Builder', icon: SlidersHorizontal, group: 'Coaching', roles: ['coach'] },
  { id: 'library', label: 'Libreria esercizi', shortLabel: 'Esercizi', icon: BookOpen, group: 'Coaching', roles: ['coach'] },
  { id: 'test', label: 'Test / retest', shortLabel: 'Test', icon: TestTube2, group: 'Analisi', roles: ['athlete', 'coach'] },
  { id: 'messages', label: 'Messaggi', shortLabel: 'Messaggi', icon: Mail, group: 'Comunicazione', roles: ['athlete'] },
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
  outcome: CompletionOutcome | null
  sessionRpe: string
  sessionNote: string
  painPresent: boolean | null
  painVas: string
  painExerciseId: string
  painPersistsPostSession: boolean | null
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
        parsed.outcome === 'partial' ||
        parsed.outcome === 'not_completed'
          ? parsed.outcome
          : null,
      sessionRpe:
        typeof parsed.sessionRpe === 'string'
          ? parsed.sessionRpe
          : '',
      sessionNote:
        typeof parsed.sessionNote === 'string'
          ? parsed.sessionNote
          : '',
      painPresent: typeof parsed.painPresent === 'boolean' ? parsed.painPresent : null,
      painVas: typeof parsed.painVas === 'string' ? parsed.painVas : '',
      painExerciseId: typeof parsed.painExerciseId === 'string' ? parsed.painExerciseId : '',
      painPersistsPostSession: typeof parsed.painPersistsPostSession === 'boolean' ? parsed.painPersistsPostSession : null,
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
  const [outcome, setOutcome] = useState<CompletionOutcome | null>(null)
  const [sessionRpe, setSessionRpe] = useState('')
  const [sessionNote, setSessionNote] = useState('')
  const [painPresent, setPainPresent] = useState<boolean | null>(null)
  const [painVas, setPainVas] = useState('')
  const [painExerciseId, setPainExerciseId] = useState('')
  const [painPersistsPostSession, setPainPersistsPostSession] = useState<boolean | null>(null)
  const [editingFeedback, setEditingFeedback] = useState(false)
  const [exerciseInputs, setExerciseInputs] = useState<Record<string, ExerciseInputDraft>>({})
  const [exerciseSaveStates, setExerciseSaveStates] = useState<Record<string, ExerciseSaveState>>({})
  const [saveState, setSaveState] = useState<'idle' | 'starting' | 'finishing' | 'saved' | 'queued' | 'error'>('idle')
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [draftReady, setDraftReady] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioArmedRef = useRef(false)
  const previousTimerStateRef = useRef<ExerciseTimerState | null>(null)
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
        setExerciseInputs({})
        setExerciseSaveStates({})
        setSessionRpe(
          data.session.sessionRpe?.toString() ?? '',
        )
        setSessionNote(data.session.notes ?? '')
        setOutcome(
          data.session.completionOutcome,
        )
        setPainPresent(data.session.painPresent)
        setPainVas(data.session.painVas?.toString() ?? '')
        setPainExerciseId(data.session.painExerciseId ?? '')
        setPainPersistsPostSession(data.session.painPersistsPostSession)
        setEditingFeedback(false)
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
        setSessionRpe(draft.sessionRpe)
        setSessionNote(draft.sessionNote)
        setPainPresent(draft.painPresent)
        setPainVas(draft.painVas)
        setPainExerciseId(draft.painExerciseId)
        setPainPersistsPostSession(draft.painPersistsPostSession)
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
          data.session.completionOutcome,
        )
        setExerciseInputs({})
        setExerciseSaveStates({})
        setSessionRpe(
          data.session.sessionRpe?.toString() ?? '',
        )
        setSessionNote(data.session.notes ?? '')
        setPainPresent(data.session.painPresent)
        setPainVas(data.session.painVas?.toString() ?? '')
        setPainExerciseId(data.session.painExerciseId ?? '')
        setPainPersistsPostSession(data.session.painPersistsPostSession)
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
        sessionRpe,
        sessionNote,
        painPresent,
        painVas,
        painExerciseId,
        painPersistsPostSession,
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
    outcome,
    painExerciseId,
    painPersistsPostSession,
    painPresent,
    painVas,
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
    const previous = previousTimerStateRef.current
    previousTimerStateRef.current = timerState

    if (
      !timerState ||
      !soundEnabled ||
      !audioArmedRef.current ||
      !audioContextRef.current
    ) return

    const cue = timerAudioCueForTransition(previous, timerState)
    if (!cue) return

    playTimerAudioCue(audioContextRef.current, cue)

    if ('vibrate' in navigator && cue !== 'countdown') {
      navigator.vibrate(cue === 'complete' ? [90, 70, 140] : 90)
    }
  }, [soundEnabled, timerState])

  useEffect(() => () => {
    void audioContextRef.current?.close()
  }, [])

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

  const armAudioFeedback = () => {
    if (!soundEnabled) return

    audioArmedRef.current = true
    const context = audioContextRef.current ?? new AudioContext()
    audioContextRef.current = context

    if (context.state === 'suspended') void context.resume()
  }

  const toggleSound = () => {
    if (soundEnabled) {
      setSoundEnabled(false)
      return
    }

    setSoundEnabled(true)
    audioArmedRef.current = true
    const context = audioContextRef.current ?? new AudioContext()
    audioContextRef.current = context
    void context.resume().then(() => playTimerAudioCue(context, 'countdown'))
  }

  const toggleTimer = (exercise: SessionRunnerData['exercises'][number]) => {
    armAudioFeedback()
    setTimerState(current => {
      if (current?.exerciseId === exercise.id) {
        if (current.phase === 'complete') {
          const restarted = restartExerciseTimerState(
            exercise,
            current,
          )
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

  const changeFeedback = (patch: Partial<SessionFeedbackInput> & { sessionRpeText?: string; painVasText?: string }) => {
    if (patch.completionOutcome !== undefined) setOutcome(patch.completionOutcome)
    if (patch.sessionRpeText !== undefined) setSessionRpe(patch.sessionRpeText)
    if (patch.notes !== undefined) setSessionNote(patch.notes)
    if (patch.painPresent !== undefined) setPainPresent(patch.painPresent)
    if (patch.painVasText !== undefined) setPainVas(patch.painVasText)
    if (patch.painExerciseId !== undefined) setPainExerciseId(patch.painExerciseId ?? '')
    if (patch.painPersistsPostSession !== undefined) setPainPersistsPostSession(patch.painPersistsPostSession)
    setSaveState('idle')
    setError('')
  }

  const restoreFeedback = () => {
    setOutcome(runner.session.completionOutcome)
    setSessionRpe(runner.session.sessionRpe?.toString() ?? '')
    setSessionNote(runner.session.notes)
    setPainPresent(runner.session.painPresent)
    setPainVas(runner.session.painVas?.toString() ?? '')
    setPainExerciseId(runner.session.painExerciseId ?? '')
    setPainPersistsPostSession(runner.session.painPersistsPostSession)
  }

  const submitSessionFeedback = async (overrides: Partial<SessionFeedbackInput> = {}) => {
    let values
    try {
      values = validateSessionFeedback({
        programType: runner.session.programType,
        completionOutcome: outcome,
        sessionRpe: sessionRpe.trim() ? Number(sessionRpe) : null,
        notes: sessionNote,
        painPresent,
        painVas: painVas.trim() ? Number(painVas) : null,
        painExerciseId: painExerciseId || null,
        painPersistsPostSession,
        ...overrides,
      }, runner.exercises.map(exercise => exercise.id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Controlla il feedback inserito.')
      return
    }

    setSaveState('finishing')
    setError('')
    try {
      let logId = runner.session.logId
      let status = runner.session.status
      if (!logId) {
        const log = await beginSession(profile, runner.session.id)
        logId = log.id
        status = log.status
      }

      let hasQueuedWrites = false
      const updatedExercises = [...runner.exercises]
      if (status !== 'completed' && values.completion_outcome === 'completed') {
        for (let index = 0; index < updatedExercises.length; index += 1) {
          const exercise = updatedExercises[index]
          if (exercise.progress?.syncState === 'queued') { hasQueuedWrites = true; continue }
          if (exercise.progress?.completed) continue
          const result = await saveExerciseProgress(profile, logId, exercise, { rpe: null, notes: '' })
          updatedExercises[index] = { ...exercise, progress: result.progress }
          if (result.disposition === 'queued') hasQueuedWrites = true
        }
      }
      setRunner(current => current ? { ...current, session: { ...current.session, logId, status }, exercises: updatedExercises } : current)
      if (hasQueuedWrites) {
        setSaveState('queued')
        setError('La sessione è protetta nella coda offline. Verrà chiusa dopo la sincronizzazione.')
        return
      }

      const result = await saveSessionFeedback(profile, logId, values, { status, completedAt: runner.session.completedAt, feedbackSubmittedAt: runner.session.feedbackSubmittedAt })
      setRunner(current => current ? { ...current, session: { ...current.session, logId, status: 'completed', completionOutcome: values.completion_outcome, completedAt: result.completedAt, sessionRpe: values.session_rpe, notes: values.notes ?? '', painPresent: values.pain_present, painVas: values.pain_vas, painExerciseId: values.pain_exercise_id, painPersistsPostSession: values.pain_persists_post_session, feedbackSubmittedAt: result.feedbackSubmittedAt, feedbackUpdatedAt: result.feedbackUpdatedAt }, exercises: updatedExercises } : current)
      setOutcome(values.completion_outcome)
      setSessionRpe(values.session_rpe?.toString() ?? '')
      setSessionNote(values.notes ?? '')
      setPainPresent(values.pain_present)
      setPainVas(values.pain_vas?.toString() ?? '')
      setPainExerciseId(values.pain_exercise_id ?? '')
      setPainPersistsPostSession(values.pain_persists_post_session)
      setEditingFeedback(false)
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
      <ScreenHeader eyebrow="SESSIONE / PANORAMICA" title={runner.session.title} text={[runner.session.objective, runner.session.durationMinutes ? String(runner.session.durationMinutes) + ' min' : ''].filter(Boolean).join(' · ')} action={<div className="header-actions"><Tag tone={runner.source === 'legacy-v1' ? 'success' : 'neutral'}>{runner.source === 'legacy-v1' ? 'ONLINE' : 'DEMO'}</Tag>{wakeLockStatus === 'active' && <Tag tone="success">SCHERMO ATTIVO</Tag>}</div>} />
      <div className="session-status session-status--compact">
        <div className="session-status__progress"><span>ESERCIZI DELLA SESSIONE</span><b>{String(runner.exercises.length).padStart(2, '0')} · {summary.completed} registrati</b><div className="progress-line"><i style={{ width: String(summary.percentage) + '%' }} /></div></div>
        {canEdit && <button className={`session-sound-toggle ${soundEnabled ? 'is-on' : ''}`} onClick={toggleSound} aria-pressed={soundEnabled}>{soundEnabled ? <Volume2 size={22} /> : <VolumeX size={22} />}<span>{soundEnabled ? 'AUDIO ATTIVO' : 'AUDIO DISATTIVATO'}</span></button>}
      </div>

      <div className="session-exercise-list">
        {runner.exercises.map(exercise => {
          const variableSeries = getVariableSeries(exercise)
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
            {canEdit && timerConfig && activeTimer && <section className={`exercise-timer is-${activeTimer.phase}${activeTimer.running ? ' is-running' : ''}`} aria-label={`Timer ${exercise.name}`}>
              <div className="exercise-timer__display"><small aria-live="assertive">{exerciseTimerPhaseLabel(activeTimer)}</small><strong>{timerLabel}</strong><span>{exerciseTimerProgressLabel(activeTimer)}</span></div>
              <button className="exercise-timer__control" onClick={() => toggleTimer(exercise)} aria-label={`${activeTimer.running ? 'Metti in pausa' : 'Avvia'} il timer di ${exercise.name}`}>{activeTimer.running ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}<span>{activeTimer.running ? 'Pausa' : activeTimer.phase === 'complete' ? activeTimer.config.mode === 'recovery' && activeTimer.set < Math.max(1, activeTimer.config.sets - 1) ? 'Prossimo' : 'Ricomincia' : timerActive ? 'Riprendi' : 'Avvia'}</span></button>
              <button className="exercise-timer__reset" onClick={() => resetTimer(exercise)} aria-label={`Reimposta il timer di ${exercise.name}`}><TimerReset size={20} /><span>Reimposta</span></button>
            </section>}
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

      {runner.session.status === 'completed' && !editingFeedback ? <div className="completion-banner completion-banner--editable"><ShieldCheck size={19} /><div><b>{runner.session.completionOutcome === 'not_completed' ? 'Sessione non completata' : 'Sessione completata'}</b><span>Il feedback è stato salvato.</span></div><button className="button button--secondary" onClick={() => { restoreFeedback(); setEditingFeedback(true); setSaveState('idle') }}>Modifica feedback</button></div> : runner.session.logId || editingFeedback ? <SessionFeedbackPanel programType={runner.session.programType} exercises={runner.exercises} outcome={outcome} sessionRpe={sessionRpe} notes={sessionNote} painPresent={painPresent} painVas={painVas} painExerciseId={painExerciseId} painPersistsPostSession={painPersistsPostSession} saving={saveState === 'finishing'} editing={editingFeedback} onChange={changeFeedback} onSubmit={patch => void submitSessionFeedback(patch)} onCancel={() => { restoreFeedback(); setEditingFeedback(false); setError('') }} /> : <div className="session-dock"><div><small>SESSIONE PRONTA</small><b>{runner.session.title}</b></div><button className="button button--signal" disabled={saveState === 'starting'} onClick={startCurrentSession}><span>{saveState === 'starting' ? 'Avvio…' : 'Avvia sessione'}</span><Play size={17} /></button></div>}

      {error && <div className={'completion-banner ' + (saveState === 'queued' ? 'completion-banner--queued' : 'completion-banner--error')}><TriangleAlert size={19} /><div><b>{saveState === 'queued' ? 'Sessione in attesa di sincronizzazione' : 'Operazione non completata'}</b><span>{error}</span></div></div>}
      {saveState === 'saved' && <div className="completion-banner"><Check size={19} /><div><b>Esito salvato</b><span>La sessione e gli esercizi eseguiti sono stati registrati.</span></div></div>}
    </div>
  )
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
  dashboard: { label: 'Coach dashboard', component: ({ profile, goTo, openAthlete }) => <DashboardScreen profile={profile} openAthletes={() => goTo('athletes')} openAthlete={openAthlete} /> },
  athletes: { label: 'Atleti e inviti', component: ({ profile, goTo, selectedAthleteId, setSelectedAthleteId, goToAthlete }) => <AthleteManagementScreen profile={profile} selectedAthleteId={selectedAthleteId} setSelectedAthleteId={setSelectedAthleteId} openDashboard={() => goTo('dashboard')} openAthleteArea={goToAthlete} /> },
  builder: { label: 'Program builder', component: ({ profile, selectedAthleteId }) => <BuilderScreen profile={profile} selectedAthleteId={selectedAthleteId} /> },
  library: { label: 'Libreria esercizi', component: ({ profile }) => <LibraryScreen profile={profile} /> },
  test: { label: 'Test / retest', component: ({ profile, selectedAthleteId }) => <TestScreen profile={profile} selectedAthleteId={selectedAthleteId} /> },
  feedback: { label: 'Feedback', component: ({ profile }) => <CoachFeedbackScreen profile={profile} /> },
  messages: { label: 'Messaggi', component: ({ profile }) => <MessagesScreen profile={profile} /> },
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
  const { unreadCount, toast: messageToast } = useMessageNotifications(activeProfile)
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
          {groups.map(group => <div className="nav-group" key={group}><small>{group}</small>{roleNavItems.filter(item => item.group === group).map(item => { const Icon = item.icon; const messageItem = item.id === 'feedback' || item.id === 'messages'; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={17} /><span>{item.label}</span><i>{messageItem && unreadCount ? unreadCount : item.id === 'migration' ? '!' : ''}</i></button> })}</div>)}
        </nav>
        <div className="sidebar__foot"><div><span className={`status-dot ${pendingCount ? 'status-dot--sync' : 'status-dot--ok'}`} /><b>{profile.workspaceName}</b></div><small>{dataRuntime.isConfigured ? 'Supabase collegato' : 'Demo locale'} · {pendingCount ? `${pendingCount} modifiche in coda` : 'coda vuota'}</small></div>
      </aside>
      <div className="app-main">
        <div className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Apri navigazione"><Menu size={20} /></button>
          <div className="topbar__crumb"><span>CC</span><i>/</i><b>{viewMeta[view].label}</b></div>
          <div className="topbar__tools">{modes.length > 1 ? <div className="mode-switch" aria-label="Modalità"><button className={mode === 'coach' ? 'active' : ''} onClick={() => changeMode('coach')}>Coach</button><button className={mode === 'athlete' ? 'active' : ''} onClick={() => changeMode('athlete')}>Atleta</button></div> : <span className="role-chip">{mode === 'coach' ? 'Coach' : 'Atleta'}</span>}<button className="sync-chip" onClick={() => void synchronizePending()} disabled={syncing || pendingCount === 0} title="Sincronizza la coda offline"><span className={`status-dot ${pendingCount ? 'status-dot--sync' : 'status-dot--ok'}`} />{syncing ? 'Sincronizzo…' : pendingCount ? `${pendingCount} in coda` : 'Cloud allineato'}</button><button className="icon-button message-indicator" aria-label={`Messaggi${unreadCount ? `, ${unreadCount} non letti` : ''}`} onClick={() => navigate(mode === 'coach' ? 'feedback' : 'messages')}><Mail size={17} />{unreadCount > 0 && <span>{unreadCount}</span>}</button><button className="icon-button" aria-label="Account e sicurezza" onClick={() => navigate('account')}><Settings2 size={17} /></button><button className="profile-button" onClick={() => void onSignOut()} title="Esci"><span>{initials}</span><LogOut size={14} /></button></div>
        </div>
        <main><Screen goTo={navigate} goToAthlete={goToAthlete} openAthlete={openAthlete} openSession={openSession} profile={activeProfile} selectedAthleteId={selectedAthleteId} setSelectedAthleteId={setSelectedAthleteId} selectedSessionId={selectedSessionId} /></main>
        <nav className="bottom-nav" aria-label="Navigazione mobile">
          {roleNavItems.filter(item => mode === 'coach' ? ['dashboard', 'athletes', 'feedback', 'test'].includes(item.id) : ['home', 'session', 'test', 'messages'].includes(item.id)).slice(0, 4).map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.shortLabel}</span>{(item.id === 'feedback' || item.id === 'messages') && unreadCount > 0 && <i>{unreadCount}</i>}</button> })}
        </nav>
      </div>
      {menuOpen && <button className="scrim" aria-label="Chiudi navigazione" onClick={() => setMenuOpen(false)} />}
      {messageToast && <div className="message-toast" role="status">{messageToast}</div>}
    </div>
  )
}
