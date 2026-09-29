import { useEffect, useState } from 'react'
import { Check, ClipboardCheck, Play, ShieldCheck, TriangleAlert } from 'lucide-react'
import { OUTBOX_CHANGED_EVENT } from '../outbox'
import type { AppProfile } from '../onboarding/types'
import { Panel } from '../shared/ui'
import { AthleteAbstractVisual } from '../athlete/AthleteAbstractVisual'
import { useScreenWakeLock } from '../shared/hooks/useScreenWakeLock'
import { firstOpenExerciseIndex, restoreExerciseTimerSnapshot, summarizeRunner, type SessionRunnerData } from './sessionRunner'
import { autosaveSessionDraft, beginSession, loadSessionRunner, saveExerciseProgress, saveSessionFeedback } from './sessionRunnerRepository'
import { SessionFeedbackPanel } from './SessionFeedbackPanel'
import { validateSessionFeedback, type CompletionOutcome, type SessionFeedbackInput } from './sessionFeedback'
import { clearSessionLocalDraft, readSessionLocalDraft, writeSessionLocalDraft } from './sessionLocalDraft'
import { SessionExerciseCard } from './SessionExerciseCard'
import { useSessionTimer } from './useSessionTimer'
import { useExerciseProgress } from './useExerciseProgress'

export function SessionScreen({ profile, sessionId }: { profile: AppProfile; sessionId: string }) {
  const [runner, setRunner] = useState<SessionRunnerData | null | undefined>(undefined)
  const { timerState, setTimerState, toggleTimer, resetTimer, adjustTimer, skipTimerPhase } = useSessionTimer()
  const [outcome, setOutcome] = useState<CompletionOutcome | null>(null)
  const [sessionRpe, setSessionRpe] = useState('')
  const [sessionNote, setSessionNote] = useState('')
  const [painPresent, setPainPresent] = useState<boolean | null>(null)
  const [painVas, setPainVas] = useState('')
  const [painExerciseId, setPainExerciseId] = useState('')
  const [painPersistsPostSession, setPainPersistsPostSession] = useState<boolean | null>(null)
  const [editingFeedback, setEditingFeedback] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'starting' | 'finishing' | 'saved' | 'queued' | 'error'>('idle')
  const [error, setError] = useState('')
  const { exerciseInputs, setExerciseInputs, exerciseSaveStates, setExerciseSaveStates, updateExerciseInput, recordExercise } = useExerciseProgress({ profile, runner, setRunner, timerState, setTimerState, setError })
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
    <div className="screen screen--session athlete-session">
      <section className="athlete-session__hero">
        <AthleteAbstractVisual compact dramatic fill />
        <div className="athlete-session__hero-body">
          <div className="athlete-session__hero-meta">
            <span>SESSIONE</span>
            {wakeLockStatus === 'active' && <span className="athlete-session__wake">SCHERMO ATTIVO</span>}
          </div>
          <h1>{runner.session.title}</h1>
          {runner.session.durationMinutes && <p className="athlete-session__duration">Durata prevista · {runner.session.durationMinutes} min</p>}
          {runner.session.objective && <div className="athlete-session__objective"><small>OBIETTIVO</small><p>{runner.session.objective}</p></div>}
          <div className="athlete-session__progress">
            <div><span>{summary.completed} di {runner.exercises.length} esercizi</span><strong>{summary.percentage}%</strong></div>
            <div className="athlete-session__progress-line"><i style={{ width: String(summary.percentage) + '%' }} /></div>
          </div>
        </div>
      </section>

      <div className="athlete-session__section-head"><span>ESERCIZI</span><strong>{String(runner.exercises.length).padStart(2, '0')}</strong></div>
      <div className="session-exercise-list athlete-session__exercise-list">
        {runner.exercises.map(exercise => (
          <SessionExerciseCard
            key={exercise.id}
            exercise={exercise}
            coachNotes={runner.session.coachNotes}
            canEdit={canEdit}
            isNext={exercise.id === nextOpenExerciseId}
            timerState={timerState}
            exerciseInput={exerciseInputs[exercise.id] ?? { rpe: '', notes: '' }}
            exerciseSaveState={exerciseSaveStates[exercise.id] ?? 'idle'}
            onToggleTimer={toggleTimer}
            onResetTimer={resetTimer}
            onAdjustTimer={adjustTimer}
            onSkipTimerPhase={skipTimerPhase}
            onUpdateExerciseInput={updateExerciseInput}
            onRecordExercise={recordExercise}
          />
        ))}
      </div>

      {runner.session.status === 'completed' && !editingFeedback ? <div className="completion-banner completion-banner--editable"><ShieldCheck size={19} /><div><b>{runner.session.completionOutcome === 'not_completed' ? 'Sessione non completata' : 'Sessione completata'}</b><span>Il feedback è stato salvato.</span></div><button className="button button--secondary" onClick={() => { restoreFeedback(); setEditingFeedback(true); setSaveState('idle') }}>Modifica feedback</button></div> : runner.session.logId || editingFeedback ? <SessionFeedbackPanel programType={runner.session.programType} exercises={runner.exercises} outcome={outcome} sessionRpe={sessionRpe} notes={sessionNote} painPresent={painPresent} painVas={painVas} painExerciseId={painExerciseId} painPersistsPostSession={painPersistsPostSession} saving={saveState === 'finishing'} editing={editingFeedback} onChange={changeFeedback} onSubmit={patch => void submitSessionFeedback(patch)} onCancel={() => { restoreFeedback(); setEditingFeedback(false); setError('') }} /> : <div className="athlete-session__start"><div><small>PRONTO PER INIZIARE</small><b>{runner.session.title}</b></div><button className="button button--signal" disabled={saveState === 'starting'} onClick={startCurrentSession}><span>{saveState === 'starting' ? 'Avvio…' : 'Avvia sessione'}</span><Play size={19} fill="currentColor" /></button></div>}

      {error && <div className={'completion-banner ' + (saveState === 'queued' ? 'completion-banner--queued' : 'completion-banner--error')}><TriangleAlert size={19} /><div><b>{saveState === 'queued' ? 'Sessione in attesa di sincronizzazione' : 'Operazione non completata'}</b><span>{error}</span></div></div>}
      {saveState === 'saved' && <div className="completion-banner"><Check size={19} /><div><b>Esito salvato</b><span>La sessione e gli esercizi eseguiti sono stati registrati.</span></div></div>}
    </div>
  )
}
