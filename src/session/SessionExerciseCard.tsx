import { useState, type CSSProperties } from 'react'
import { Check, ChevronDown, Pause, Play, Save, TimerReset, X } from 'lucide-react'
import { createExerciseTimerState, exerciseTimerPhaseLabel, exerciseTimerProgressLabel, getExerciseTimerConfig, getRestSeconds, getSetCount, getVariableSeries, timerPhaseDuration, type ExerciseTimerState, type SessionRunnerData } from './sessionRunner'
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
  onUpdateExerciseInput: (exerciseId: string, patch: Partial<ExerciseInputDraft>) => void
  onRecordExercise: (exercise: SessionExercise) => void
}

export function SessionExerciseCard({ exercise, coachNotes, canEdit, isNext, timerState, exerciseInput, exerciseSaveState, onToggleTimer, onResetTimer, onUpdateExerciseInput, onRecordExercise }: Props) {
  const [timerFocus, setTimerFocus] = useState(false)
  const variableSeries = getVariableSeries(exercise)
  const timerConfig = getExerciseTimerConfig(exercise)
  const timerActive = timerState?.exerciseId === exercise.id
  const activeTimer = timerActive ? timerState : createExerciseTimerState(exercise)
  const timerSeconds = activeTimer?.remaining ?? getRestSeconds(exercise)
  const timerLabel = String(Math.floor(timerSeconds / 60)).padStart(2, '0') + ':' + String(timerSeconds % 60).padStart(2, '0')
  const timerDuration = activeTimer ? Math.max(1, timerPhaseDuration(activeTimer)) : 1
  const timerProgress = activeTimer ? Math.max(0, Math.min(100, ((timerDuration - activeTimer.remaining) / timerDuration) * 100)) : 0
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
          {canEdit && !exercise.progress?.completed && timerConfig && activeTimer && <button className="athlete-exercise-timer-button" onClick={() => setTimerFocus(true)}>TIMER</button>}
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
      {timerFocus && <div className={`athlete-timer-focus is-${activeTimer.phase}${activeTimer.running ? ' is-running' : ''}`} role="dialog" aria-modal="true" aria-label={`Timer ${exercise.name}`}>
        <header><div><small>TIMER ESERCIZIO</small><h2>{exercise.name}</h2></div><button onClick={() => setTimerFocus(false)} aria-label="Chiudi timer"><X size={24} /></button></header>
        <div className="athlete-timer-focus__body">
          <div className="athlete-timer-focus__phase" aria-live="assertive">{exerciseTimerPhaseLabel(activeTimer)}</div>
          <div className="athlete-timer-focus__ring" style={{ '--timer-progress': `${timerProgress * 3.6}deg` } as CSSProperties}><div><strong>{timerLabel}</strong><span>{exerciseTimerProgressLabel(activeTimer)}</span></div></div>
          <p>{activeTimer.running ? 'Timer attivo' : activeTimer.phase === 'complete' ? 'Fase completata' : 'Pronto'}</p>
        </div>
        <footer><button className="athlete-timer-focus__primary" onClick={() => onToggleTimer(exercise)}>{activeTimer.running ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}<span>{activeTimer.running ? 'Pausa' : activeTimer.phase === 'complete' ? 'Prossimo' : timerActive ? 'Riprendi' : 'Avvia'}</span></button><button className="athlete-timer-focus__reset" onClick={() => onResetTimer(exercise)}><TimerReset size={22} /><span>Reimposta</span></button></footer>
      </div>}
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
