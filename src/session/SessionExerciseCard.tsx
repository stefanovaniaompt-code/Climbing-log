import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, ChevronDown, Pause, Play, RotateCcw, Save, SkipForward } from 'lucide-react'
import { legacyDoseDescription } from '../prescriptions/prescriptionConsistency'
import { resolveTimerRestSeconds } from '../prescriptions/timerConfiguration'
import { advanceExerciseTimer, createExerciseTimerState, exerciseTimerPhaseLabel, exerciseTimerProgressLabel, getExerciseTimerConfig, getPrescriptionDose, getPrescriptionLoad, getSetCount, getVariableSeries, timerPhaseDuration, type ExerciseTimerState, type SessionRunnerData } from './sessionRunner'
import type { ExerciseInputDraft } from './sessionLocalDraft'
import type { ExerciseSaveState } from './useExerciseProgress'

type SessionExercise = SessionRunnerData['exercises'][number]

type Props = {
  exercise: SessionExercise
  coachNotes: string | null
  canEdit: boolean
  isNext: boolean
  timerState: ExerciseTimerState | null
  exerciseInput: ExerciseInputDraft
  exerciseSaveState: ExerciseSaveState
  onToggleTimer: (exercise: SessionExercise) => void
  onConfirmSet: (exerciseId: string) => void
  onResetTimer: (exercise: SessionExercise) => void
  onAdjustTimer: (exerciseId: string, seconds: number) => void
  onSkipTimerPhase: (exerciseId: string) => void
  onUpdateExerciseInput: (exerciseId: string, patch: Partial<ExerciseInputDraft>) => void
  onRecordExercise: (exercise: SessionExercise) => void
  soundEnabled: boolean
  onToggleSound: () => void
}

function getExerciseTimerProgress(current: ExerciseTimerState) {
  if (current.phase === 'complete') return 100
  if (current.config.mode === 'recovery_only') {
    const completedSets = current.phase === 'set_rest' ? current.set : current.set - 1
    return Math.max(0, Math.min(100, Math.round(completedSets / current.config.sets * 100)))
  }
  const total = current.sequence.reduce((sum, step) => sum + step.durationSeconds, current.restExtensionSeconds ?? 0)
  if (total <= 0) return 0
  const completed = current.sequence.slice(0, current.sequenceIndex).reduce((sum, step) => sum + step.durationSeconds, 0)
  const currentDuration = timerPhaseDuration(current)
  const currentElapsed = Math.max(0, Math.min(currentDuration, currentDuration - current.remaining))
  return Math.max(0, Math.min(100, Math.round(((completed + currentElapsed) / total) * 100)))
}

export function SessionExerciseCard({ exercise, coachNotes, canEdit, isNext, timerState, exerciseInput, exerciseSaveState, onToggleTimer, onConfirmSet, onResetTimer, onAdjustTimer, onSkipTimerPhase, onUpdateExerciseInput, onRecordExercise, soundEnabled, onToggleSound }: Props) {
  const [timerFocus, setTimerFocus] = useState(false)
  const [timerView, setTimerView] = useState<'exercise' | 'timer'>('timer')
  const timerDialogRef = useRef<HTMLDivElement>(null)
  const timerLauncherRef = useRef<HTMLButtonElement>(null)
  const variableSeries = getVariableSeries(exercise)
  const timerConfig = getExerciseTimerConfig(exercise)
  const timerActive = timerState?.exerciseId === exercise.id
  const activeTimer = timerActive ? timerState : createExerciseTimerState(exercise)
  const prescribedRest = resolveTimerRestSeconds(exercise.prescription, exercise.restSeconds)
  const timerSeconds = activeTimer?.remaining ?? timerConfig?.setRestSeconds ?? 0
  const restDescription = prescribedRest !== null ? `${prescribedRest} sec`
    : timerConfig?.setRestSeconds ? `${timerConfig.setRestSeconds} sec (timer)` : '—'
  const timerLabel = activeTimer?.phase === 'awaiting_set' ? 'MANUALE' : activeTimer?.phase === 'complete' ? 'FINE' : String(Math.floor(timerSeconds / 60)).padStart(2, '0') + ':' + String(timerSeconds % 60).padStart(2, '0')
  const timerDuration = activeTimer ? timerPhaseDuration(activeTimer) : 0
  const timerProgress = activeTimer?.phase === 'complete' ? 100 : activeTimer && timerDuration > 0
    ? Math.max(0, Math.min(100, ((timerDuration - activeTimer.remaining) / timerDuration) * 100))
    : 0
  const nextTimerState = activeTimer?.phase === 'complete' ? null : activeTimer ? advanceExerciseTimer(activeTimer) : null
  const nextTimerLabel = nextTimerState ? exerciseTimerPhaseLabel(nextTimerState) : 'PROTOCOLLO TERMINATO'
  const exerciseTimerProgress = activeTimer ? getExerciseTimerProgress(activeTimer) : 0
  const currentSeriesReps = activeTimer?.config.series?.[activeTimer.set - 1]?.reps ?? activeTimer?.config.repetitions ?? 0
  const handIndicator = activeTimer?.phase === 'work'
    ? activeTimer.config.executionMode === 'bilateral' ? 'BILATERALE' : activeTimer.hand === 'right' ? 'DX' : 'SX'
    : activeTimer?.phase === 'hand_rest'
      ? `CAMBIO MANO · PROSSIMA ${nextTimerState?.hand === 'left' ? 'SX' : 'DX'}`
      : activeTimer?.config.executionMode === 'bilateral' ? 'BILATERALE' : activeTimer?.config.executionMode === 'right_only' ? 'SOLO DX' : activeTimer?.config.executionMode === 'left_only' ? 'SOLO SX' : 'DX / SX'

  useEffect(() => {
    if (!timerFocus) return
    const dialog = timerDialogRef.current
    const first = dialog?.querySelector<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])')
    first?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setTimerFocus(false)
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'))
        .filter(item => !item.closest('[inert], [aria-hidden="true"]'))
      if (!focusable.length) return
      const firstItem = focusable[0]
      const lastItem = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }
    dialog?.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog?.removeEventListener('keydown', handleKeyDown)
      timerLauncherRef.current?.focus()
    }
  }, [timerFocus])
  const dose = getPrescriptionDose(exercise) ?? 'Dose indicata dal coach'
  const doseDescription = legacyDoseDescription(exercise.prescription)
  const doseNote = doseDescription ? `Nota: ${doseDescription}` : null
  const load = getPrescriptionLoad(exercise) ?? 'Corpo libero'
  return <article
    id={`exercise-${exercise.id}`}
    className={
      'session-exercise-card athlete-card athlete-exercise-card ' +
      (exercise.progress?.completed ? ' is-recorded athlete-exercise-card-complete' : '') +
      (isNext ? ' is-next' : '')
    }
    key={exercise.id}
  >
    <div className="athlete-exercise-card__body">
      <span className={`athlete-exercise-status${exercise.progress?.completed ? ' athlete-exercise-status-complete' : ''}`}>{exercise.progress?.completed ? <Check size={18} strokeWidth={3} /> : exercise.order}</span>
      <div className="athlete-exercise-card__content">
        <div className="athlete-exercise-card__title-row">
          <h2>{exercise.name}</h2>
          {canEdit && !exercise.progress?.completed && timerConfig && activeTimer && <button ref={timerLauncherRef} className="athlete-exercise-timer-button" onClick={() => { setTimerView('timer'); setTimerFocus(true) }}>TIMER</button>}
          {canEdit && !exercise.progress?.completed && !timerConfig && <button className="athlete-exercise-complete-button" disabled={exerciseSaveState === 'saving'} onClick={() => void onRecordExercise(exercise)}><Check size={13} strokeWidth={3} />{exerciseSaveState === 'saving' ? 'SALVO…' : 'COMPLETA'}</button>}
        </div>

        {variableSeries.length > 0 ? <div className="athlete-prescription">
          <div className="athlete-prescription-table">
            <div className="athlete-prescription-head"><span>SERIE</span><span>PRESCRIZIONE</span></div>
            {variableSeries.map((series, index) => <div className="athlete-prescription-row" key={series + index}><span className="athlete-prescription-index">{String(index + 1).padStart(2, '0')}</span><span className="athlete-prescription-value">{series}</span></div>)}
          </div>
          {doseNote && <p className="athlete-prescription-note">{doseNote}</p>}
          <div className="athlete-prescription-meta"><div><span className="athlete-prescription-meta-label">SERIE</span><strong>{getSetCount(exercise)}</strong></div><div><span className="athlete-prescription-meta-label">CARICO</span><strong>{load}</strong></div><div><span className="athlete-prescription-meta-label">RECUPERO</span><strong>{restDescription}</strong></div></div>
        </div> : <div className="athlete-prescription"><p className="athlete-prescription-dose">{dose}</p><div className="athlete-prescription-meta"><div><span className="athlete-prescription-meta-label">SERIE</span><strong>{getSetCount(exercise)}</strong></div><div><span className="athlete-prescription-meta-label">CARICO</span><strong>{load}</strong></div><div><span className="athlete-prescription-meta-label">RECUPERO</span><strong>{restDescription}</strong></div></div></div>}

        {exercise.progress?.completed && <p className="athlete-exercise-complete-label">{exercise.progress.syncState === 'queued' ? 'IN CODA' : 'COMPLETATO'}</p>}
        {(exercise.instructions || coachNotes) && <p className="exercise-guidance">{exercise.instructions || coachNotes}</p>}
    {canEdit && timerConfig && activeTimer && <>
      {timerFocus && createPortal(<div ref={timerDialogRef} tabIndex={-1} className={`athlete-timer-focus is-${activeTimer.phase}${activeTimer.running ? ' is-running' : ''}${activeTimer.phase === 'work' && activeTimer.remaining <= 3 ? ' is-ending' : ''}`} role="dialog" aria-modal="true" aria-label={`Timer ${exercise.name}`}>
        <i className="athlete-timer-focus__geometry athlete-timer-focus__geometry--a" /><i className="athlete-timer-focus__geometry athlete-timer-focus__geometry--b" />
        <header><button onClick={() => setTimerFocus(false)} aria-label="Torna alla sessione"><ArrowLeft size={20} /></button><div className="athlete-timer-focus__switch" role="tablist" aria-label="Pannello timer"><button role="tab" aria-selected={timerView === 'exercise'} className={timerView === 'exercise' ? 'is-active' : ''} onClick={() => setTimerView('exercise')}>ESERCIZIO</button><button role="tab" aria-selected={timerView === 'timer'} className={timerView === 'timer' ? 'is-active' : ''} onClick={() => setTimerView('timer')}>TIMER</button></div><button onClick={() => onResetTimer(exercise)} aria-label="Reimposta timer"><RotateCcw size={18} /></button></header>
        <div className={`athlete-timer-focus__panels is-${timerView}`}>
        <div aria-hidden={timerView !== 'timer'} inert={timerView !== 'timer' ? true : undefined} className="athlete-timer-focus__body athlete-timer-focus__timer-panel">
          <div className="athlete-timer-focus__intro"><small>SERIE {activeTimer.set} / {activeTimer.config.sets} · {activeTimer.config.mode === 'guided' ? 'GUIDATO' : 'SOLO RECUPERO'}</small><h2>{exercise.name}</h2><p>{dose}{load !== 'Corpo libero' ? ` · ${load}` : ''}</p><strong className="athlete-timer-focus__hand">{handIndicator}</strong></div>
          <div className="athlete-timer-focus__exercise-progress"><div><span>AVANZAMENTO ESERCIZIO</span><strong>{exerciseTimerProgress}%</strong></div><i><b style={{ width: `${exerciseTimerProgress}%` }} /></i></div>
          <div className="athlete-timer-focus__ring" style={{ '--timer-progress': `${timerProgress * 3.6}deg` } as CSSProperties}><div className="athlete-timer-focus__phase"><small aria-live="polite">{exerciseTimerPhaseLabel(activeTimer)}</small><strong aria-live="off">{timerLabel}</strong><span>{activeTimer.phase === 'work' && currentSeriesReps > 1 ? `SERIE ${activeTimer.set}/${activeTimer.config.sets} · RIPETIZIONE ${activeTimer.repetition}/${currentSeriesReps}` : exerciseTimerProgressLabel(activeTimer)}</span></div></div>
          <div className="athlete-timer-focus__next"><small>PROSSIMO</small><div><strong>{nextTimerLabel}</strong><SkipForward size={17} /></div></div>
          {activeTimer.phase === 'awaiting_set' ? <button className="athlete-timer-focus__confirm-set" onClick={() => onConfirmSet(exercise.id)}>SERIE COMPLETATA</button> : activeTimer.phase !== 'complete' ? <><div className="athlete-timer-focus__controls"><button aria-label="Sottrai 10 secondi" onClick={() => onAdjustTimer(exercise.id, -10)}>−10″</button><button aria-label={activeTimer.running ? 'Pausa timer' : 'Riprendi timer'} className="athlete-timer-focus__main" onClick={() => onToggleTimer(exercise)}>{activeTimer.running ? <Pause size={32} fill="currentColor" /> : <Play size={30} fill="currentColor" />}</button><button aria-label="Aggiungi 10 secondi" disabled={activeTimer.phase === 'set_rest' && activeTimer.config.maxSetRestSeconds !== undefined && (activeTimer.restExtensionSeconds ?? 0) >= activeTimer.config.maxSetRestSeconds - activeTimer.config.setRestSeconds} onClick={() => onAdjustTimer(exercise.id, 10)}>+10″</button></div><button className="athlete-timer-focus__skip" onClick={() => onSkipTimerPhase(exercise.id)}>SALTA FASE</button></> : <button className="athlete-timer-focus__complete" onClick={() => { void onRecordExercise(exercise); setTimerFocus(false) }}>REGISTRA ESERCIZIO <Check size={18} /></button>}
          <div className="athlete-timer-focus__footer"><p className="athlete-timer-focus__status">{activeTimer.phase === 'complete' ? 'PROTOCOLLO TERMINATO' : activeTimer.phase === 'awaiting_set' ? 'ATTESA CONFERMA MANUALE' : activeTimer.running ? 'TIMER ATTIVO' : 'TIMER IN PAUSA'}</p><button className="athlete-timer-focus__sound" onClick={onToggleSound} aria-label={soundEnabled ? 'Disattiva audio timer' : 'Attiva audio timer'}>{soundEnabled ? 'AUDIO ON' : 'AUDIO OFF'}</button></div>
        </div>
        <div aria-hidden={timerView !== 'exercise'} inert={timerView !== 'exercise' ? true : undefined} className="athlete-timer-focus__exercise-panel">
          <div><small>ESERCIZIO</small><h2>{exercise.name}</h2></div>
          {variableSeries.length > 0 ? <div className="athlete-prescription"><div className="athlete-prescription-table"><div className="athlete-prescription-head"><span>SERIE</span><span>PRESCRIZIONE</span></div>{variableSeries.map((series, index) => <div className="athlete-prescription-row" key={series + index}><span className="athlete-prescription-index">{String(index + 1).padStart(2, '0')}</span><span className="athlete-prescription-value">{series}</span></div>)}</div>{doseNote && <p className="athlete-prescription-note">{doseNote}</p>}<div className="athlete-prescription-meta"><div><span className="athlete-prescription-meta-label">SERIE</span><strong>{getSetCount(exercise)}</strong></div><div><span className="athlete-prescription-meta-label">CARICO</span><strong>{load}</strong></div><div><span className="athlete-prescription-meta-label">RECUPERO</span><strong>{restDescription}</strong></div></div></div> : <div className="athlete-prescription"><p className="athlete-prescription-dose">{dose}</p><div className="athlete-prescription-meta"><div><span className="athlete-prescription-meta-label">SERIE</span><strong>{getSetCount(exercise)}</strong></div><div><span className="athlete-prescription-meta-label">CARICO</span><strong>{load}</strong></div><div><span className="athlete-prescription-meta-label">RECUPERO</span><strong>{restDescription}</strong></div></div></div>}
          {(exercise.instructions || coachNotes) && <p className="athlete-timer-focus__guidance">{exercise.instructions || coachNotes}</p>}
          <button className="athlete-timer-focus__mini" onClick={() => setTimerView('timer')}><span><small>{exerciseTimerPhaseLabel(activeTimer)}</small><strong>{timerLabel}</strong></span><span><small>AVANZAMENTO</small><strong>{exerciseTimerProgress}%</strong></span><i><b style={{ width: `${exerciseTimerProgress}%` }} /></i></button>
        </div>
        </div>
      </div>, document.body)}
    </>}
    {canEdit && !exercise.progress?.completed && (
      <details className="exercise-entry athlete-exercise__entry">
        <summary><span>RPE E NOTE</span><ChevronDown size={18} /></summary>
        <div className="athlete-exercise__entry-body">
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
                onUpdateExerciseInput(
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
                onUpdateExerciseInput(
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
              void onRecordExercise(exercise)
            }
          >
            <Save size={16} />
            {exerciseSaveState === 'saving'
              ? 'Salvataggio...'
              : 'Registra esercizio'}
          </button>
        </div>
        </div>
      </details>
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
      </div>
    </div>
  </article>
}
