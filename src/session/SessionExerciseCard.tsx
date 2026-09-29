import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, ChevronDown, Pause, Play, RotateCcw, Save, SkipForward } from 'lucide-react'
import { advanceExerciseTimer, createExerciseTimerState, exerciseTimerPhaseLabel, exerciseTimerProgressLabel, getExerciseTimerConfig, getRestSeconds, getSetCount, getVariableSeries, timerPhaseDuration, type ExerciseTimerState, type SessionRunnerData } from './sessionRunner'
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
  onResetTimer: (exercise: SessionExercise) => void
  onAdjustTimer: (exerciseId: string, seconds: number) => void
  onSkipTimerPhase: (exerciseId: string) => void
  onUpdateExerciseInput: (exerciseId: string, patch: Partial<ExerciseInputDraft>) => void
  onRecordExercise: (exercise: SessionExercise) => void
}

function getExerciseTimerProgress(exercise: SessionExercise, current: ExerciseTimerState) {
  if (current.phase === 'complete') return 100
  const initial = createExerciseTimerState(exercise)
  if (!initial) return 0
  const steps: ExerciseTimerState[] = []
  let cursor = initial
  for (let index = 0; index < 500 && cursor.phase !== 'complete'; index += 1) {
    steps.push(cursor)
    cursor = advanceExerciseTimer(cursor)
  }
  const sameStep = (left: ExerciseTimerState, right: ExerciseTimerState) => left.phase === right.phase && left.set === right.set && left.repetition === right.repetition && left.hand === right.hand
  const total = steps.reduce((sum, step) => sum + timerPhaseDuration(step), 0)
  const currentIndex = steps.findIndex(step => sameStep(step, current))
  if (total <= 0 || currentIndex < 0) return 0
  const completed = steps.slice(0, currentIndex).reduce((sum, step) => sum + timerPhaseDuration(step), 0)
  const currentElapsed = Math.max(0, timerPhaseDuration(current) - current.remaining)
  return Math.max(0, Math.min(100, Math.round(((completed + currentElapsed) / total) * 100)))
}

export function SessionExerciseCard({ exercise, coachNotes, canEdit, isNext, timerState, exerciseInput, exerciseSaveState, onToggleTimer, onResetTimer, onAdjustTimer, onSkipTimerPhase, onUpdateExerciseInput, onRecordExercise }: Props) {
  const [timerFocus, setTimerFocus] = useState(false)
  const [timerView, setTimerView] = useState<'exercise' | 'timer'>('timer')
  const variableSeries = getVariableSeries(exercise)
  const timerConfig = getExerciseTimerConfig(exercise)
  const timerActive = timerState?.exerciseId === exercise.id
  const activeTimer = timerActive ? timerState : createExerciseTimerState(exercise)
  const timerSeconds = activeTimer?.remaining ?? getRestSeconds(exercise)
  const timerLabel = String(Math.floor(timerSeconds / 60)).padStart(2, '0') + ':' + String(timerSeconds % 60).padStart(2, '0')
  const timerDuration = activeTimer ? Math.max(1, timerPhaseDuration(activeTimer)) : 1
  const timerProgress = activeTimer ? Math.max(0, Math.min(100, ((timerDuration - activeTimer.remaining) / timerDuration) * 100)) : 0
  const nextTimerState = activeTimer?.phase === 'complete' ? null : activeTimer ? advanceExerciseTimer(activeTimer) : null
  const nextTimerLabel = nextTimerState ? exerciseTimerPhaseLabel(nextTimerState) : 'Esercizio completato'
  const exerciseTimerProgress = activeTimer ? getExerciseTimerProgress(exercise, activeTimer) : 0
  const dose = String(exercise.prescription.dose ?? 'Dose indicata dal coach')
  const load = exercise.prescription.load_value == null ? 'Corpo libero' : String(exercise.prescription.load_value) + (exercise.prescription.unit ? ' ' + String(exercise.prescription.unit) : '')
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
          {canEdit && !exercise.progress?.completed && timerConfig && activeTimer && <button className="athlete-exercise-timer-button" onClick={() => { setTimerView('timer'); setTimerFocus(true) }}>TIMER</button>}
          {canEdit && !exercise.progress?.completed && !timerConfig && <button className="athlete-exercise-complete-button" disabled={exerciseSaveState === 'saving'} onClick={() => void onRecordExercise(exercise)}><Check size={13} strokeWidth={3} />{exerciseSaveState === 'saving' ? 'SALVO…' : 'COMPLETA'}</button>}
        </div>

        {variableSeries.length > 0 ? <div className="athlete-prescription">
          <div className="athlete-prescription-table">
            <div className="athlete-prescription-head"><span>SERIE</span><span>PRESCRIZIONE</span></div>
            {variableSeries.map((series, index) => <div className="athlete-prescription-row" key={series + index}><span className="athlete-prescription-index">{String(index + 1).padStart(2, '0')}</span><span className="athlete-prescription-value">{series}</span></div>)}
          </div>
          <div className="athlete-prescription-meta"><div><span className="athlete-prescription-meta-label">SERIE</span><strong>{getSetCount(exercise)}</strong></div><div><span className="athlete-prescription-meta-label">CARICO</span><strong>{load}</strong></div><div><span className="athlete-prescription-meta-label">RECUPERO</span><strong>{getRestSeconds(exercise)} sec</strong></div></div>
        </div> : <div className="athlete-prescription"><p className="athlete-prescription-dose">{dose}</p><div className="athlete-prescription-meta"><div><span className="athlete-prescription-meta-label">SERIE</span><strong>{getSetCount(exercise)}</strong></div><div><span className="athlete-prescription-meta-label">CARICO</span><strong>{load}</strong></div><div><span className="athlete-prescription-meta-label">RECUPERO</span><strong>{getRestSeconds(exercise)} sec</strong></div></div></div>}

        {exercise.progress?.completed && <p className="athlete-exercise-complete-label">{exercise.progress.syncState === 'queued' ? 'IN CODA' : 'COMPLETATO'}</p>}
        {(exercise.instructions || coachNotes) && <p className="exercise-guidance">{exercise.instructions || coachNotes}</p>}
    {canEdit && timerConfig && activeTimer && <>
      {timerFocus && createPortal(<div className={`athlete-timer-focus is-${activeTimer.phase}${activeTimer.running ? ' is-running' : ''}${activeTimer.phase === 'work' && activeTimer.remaining <= 3 ? ' is-ending' : ''}`} role="dialog" aria-modal="true" aria-label={`Timer ${exercise.name}`}>
        <i className="athlete-timer-focus__geometry athlete-timer-focus__geometry--a" /><i className="athlete-timer-focus__geometry athlete-timer-focus__geometry--b" />
        <header><button onClick={() => setTimerFocus(false)} aria-label="Torna alla sessione"><ArrowLeft size={20} /></button><div className="athlete-timer-focus__switch" role="tablist"><button className={timerView === 'exercise' ? 'is-active' : ''} onClick={() => setTimerView('exercise')}>ESERCIZIO</button><button className={timerView === 'timer' ? 'is-active' : ''} onClick={() => setTimerView('timer')}>TIMER</button></div><button onClick={() => onResetTimer(exercise)} aria-label="Reimposta timer"><RotateCcw size={18} /></button></header>
        <div className={`athlete-timer-focus__panels is-${timerView}`}>
        <div className="athlete-timer-focus__body athlete-timer-focus__timer-panel">
          <div className="athlete-timer-focus__intro"><small>SET {activeTimer.set} / {activeTimer.config.sets}</small><h2>{exercise.name}</h2><p>{dose}{load !== 'Corpo libero' ? ` · ${load}` : ''}</p></div>
          <div className="athlete-timer-focus__exercise-progress"><div><span>AVANZAMENTO ESERCIZIO</span><strong>{exerciseTimerProgress}%</strong></div><i><b style={{ width: `${exerciseTimerProgress}%` }} /></i></div>
          <div className="athlete-timer-focus__ring" style={{ '--timer-progress': `${timerProgress * 3.6}deg` } as CSSProperties}><div className="athlete-timer-focus__phase" aria-live="assertive"><small>{exerciseTimerPhaseLabel(activeTimer)}</small><strong>{timerLabel}</strong><span>{exerciseTimerProgressLabel(activeTimer)}</span></div></div>
          <div className="athlete-timer-focus__next"><small>PROSSIMO</small><div><strong>{nextTimerLabel}</strong><SkipForward size={17} /></div></div>
          {activeTimer.phase !== 'complete' ? <><div className="athlete-timer-focus__controls"><button onClick={() => onAdjustTimer(exercise.id, -10)}>−10″</button><button className="athlete-timer-focus__main" onClick={() => onToggleTimer(exercise)}>{activeTimer.running ? <Pause size={32} fill="currentColor" /> : <Play size={30} fill="currentColor" />}</button><button onClick={() => onAdjustTimer(exercise.id, 10)}>+10″</button></div><button className="athlete-timer-focus__skip" onClick={() => onSkipTimerPhase(exercise.id)}>TERMINA FASE</button></> : <button className="athlete-timer-focus__complete" onClick={() => { void onRecordExercise(exercise); setTimerFocus(false) }}>COMPLETA ESERCIZIO <ArrowLeft size={18} /></button>}
          <p className="athlete-timer-focus__status">{activeTimer.phase === 'complete' ? 'ESERCIZIO COMPLETATO' : activeTimer.running ? 'TIMER ATTIVO' : 'TIMER IN PAUSA'}</p>
        </div>
        <div className="athlete-timer-focus__exercise-panel">
          <div><small>ESERCIZIO</small><h2>{exercise.name}</h2></div>
          {variableSeries.length > 0 ? <div className="athlete-prescription"><div className="athlete-prescription-table"><div className="athlete-prescription-head"><span>SERIE</span><span>PRESCRIZIONE</span></div>{variableSeries.map((series, index) => <div className="athlete-prescription-row" key={series + index}><span className="athlete-prescription-index">{String(index + 1).padStart(2, '0')}</span><span className="athlete-prescription-value">{series}</span></div>)}</div><div className="athlete-prescription-meta"><div><span className="athlete-prescription-meta-label">SERIE</span><strong>{getSetCount(exercise)}</strong></div><div><span className="athlete-prescription-meta-label">CARICO</span><strong>{load}</strong></div><div><span className="athlete-prescription-meta-label">RECUPERO</span><strong>{getRestSeconds(exercise)} sec</strong></div></div></div> : <div className="athlete-prescription"><p className="athlete-prescription-dose">{dose}</p><div className="athlete-prescription-meta"><div><span className="athlete-prescription-meta-label">SERIE</span><strong>{getSetCount(exercise)}</strong></div><div><span className="athlete-prescription-meta-label">CARICO</span><strong>{load}</strong></div><div><span className="athlete-prescription-meta-label">RECUPERO</span><strong>{getRestSeconds(exercise)} sec</strong></div></div></div>}
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
