import { Check, Pause, Play, Save, TimerReset } from 'lucide-react'
import { Tag } from '../shared/ui'
import { createExerciseTimerState, exerciseTimerPhaseLabel, exerciseTimerProgressLabel, formatPrescription, getExerciseTimerConfig, getRestSeconds, getSetCount, getVariableSeries, type ExerciseTimerState, type SessionRunnerData } from './sessionRunner'
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
  const variableSeries = getVariableSeries(exercise)
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
    <div className="exercise-guidance"><span>Indicazioni</span><p>{exercise.instructions || coachNotes || 'Segui la prescrizione e interrompi in caso di dolore.'}</p></div>
    {canEdit && timerConfig && activeTimer && <section className={`exercise-timer is-${activeTimer.phase}${activeTimer.running ? ' is-running' : ''}`} aria-label={`Timer ${exercise.name}`}>
      <div className="exercise-timer__display"><small aria-live="assertive">{exerciseTimerPhaseLabel(activeTimer)}</small><strong>{timerLabel}</strong><span>{exerciseTimerProgressLabel(activeTimer)}</span></div>
      <button className="exercise-timer__control" onClick={() => onToggleTimer(exercise)} aria-label={`${activeTimer.running ? 'Metti in pausa' : 'Avvia'} il timer di ${exercise.name}`}>{activeTimer.running ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}<span>{activeTimer.running ? 'Pausa' : activeTimer.phase === 'complete' ? activeTimer.config.mode === 'recovery' && activeTimer.set < Math.max(1, activeTimer.config.sets - 1) ? 'Prossimo' : 'Ricomincia' : timerActive ? 'Riprendi' : 'Avvia'}</span></button>
      <button className="exercise-timer__reset" onClick={() => onResetTimer(exercise)} aria-label={`Reimposta il timer di ${exercise.name}`}><TimerReset size={20} /><span>Reimposta</span></button>
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
