import { useState, type CSSProperties } from 'react'
import { Check, Pause, Play, Save, TimerReset, X } from 'lucide-react'
import { Tag } from '../shared/ui'
import { createExerciseTimerState, exerciseTimerPhaseLabel, exerciseTimerProgressLabel, formatPrescription, getExerciseTimerConfig, getRestSeconds, getSetCount, getVariableSeries, timerPhaseDuration, type ExerciseTimerState, type SessionRunnerData } from './sessionRunner'
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
    <div className="exercise-guidance"><span>Indicazioni</span><p>{exercise.instructions || coachNotes || 'Segui la prescrizione e interrompi in caso di dolore.'}</p></div>
    {canEdit && timerConfig && activeTimer && <>
      <section className={`athlete-timer-launch is-${activeTimer.phase}${activeTimer.running ? ' is-running' : ''}`} aria-label={`Timer ${exercise.name}`}>
        <button className="athlete-timer-launch__summary" onClick={() => setTimerFocus(true)}><span><small>{exerciseTimerPhaseLabel(activeTimer)}</small><b>{timerLabel}</b><em>{exerciseTimerProgressLabel(activeTimer)}</em></span><strong>Apri timer</strong></button>
        <button className="athlete-timer-launch__control" onClick={() => { setTimerFocus(true); onToggleTimer(exercise) }} aria-label={`${activeTimer.running ? 'Metti in pausa' : 'Avvia'} il timer di ${exercise.name}`}>{activeTimer.running ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}</button>
      </section>
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
}
