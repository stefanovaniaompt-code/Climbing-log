import { ArrowRight } from 'lucide-react'
import type { CompletionOutcome, SessionFeedbackInput } from './sessionFeedback'
import type { ProgramType } from '../programs/programType'
import type { RunnerExercise } from './sessionRunner'

type Props = {
  programType: ProgramType
  exercises: RunnerExercise[]
  outcome: CompletionOutcome | null
  sessionRpe: string
  notes: string
  painPresent: boolean | null
  painVas: string
  painExerciseId: string
  painPersistsPostSession: boolean | null
  saving: boolean
  editing: boolean
  onChange: (patch: Partial<SessionFeedbackInput> & { sessionRpeText?: string; painVasText?: string }) => void
  onSubmit: (patch?: Partial<SessionFeedbackInput>) => void
  onCancel?: () => void
}

function BinaryChoice({ value, onChange, yes = 'Sì', no = 'No' }: { value: boolean | null; onChange: (value: boolean) => void; yes?: string; no?: string }) {
  return <div className="session-outcome-choice"><button type="button" className={value === true ? 'active' : ''} onClick={() => onChange(true)}>{yes}</button><button type="button" className={value === false ? 'active' : ''} onClick={() => onChange(false)}>{no}</button></div>
}

function ScaleChoice({ value, min, max, onChange, label }: { value: string; min: number; max: number; onChange: (value: string) => void; label: string }) {
  return <div className="session-feedback-scale" role="group" aria-label={label}>{Array.from({ length: max - min + 1 }, (_, index) => String(index + min)).map(option => <button type="button" key={option} className={value === option ? 'active' : ''} aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>)}</div>
}

export function SessionFeedbackPanel(props: Props) {
  const submitLabel = props.saving ? 'Salvataggio…' : props.editing ? 'Salva modifiche' : 'Salva feedback e termina'
  if (props.programType === 'patient') {
    return <section className="panel session-outcome-panel session-feedback-form"><div className="panel__head"><span>✓</span><h2>Feedback fine sessione</h2></div>
      <fieldset><legend>Hai avuto dolore durante l’allenamento?</legend><BinaryChoice value={props.painPresent} onChange={value => { props.onChange({ painPresent: value }); if (!value) props.onSubmit({ painPresent: false }) }} /></fieldset>
      {props.painPresent === true && <>
        <label><span>Quanto dolore hai avuto? (VAS 1–10)</span><ScaleChoice value={props.painVas} min={1} max={10} label="Dolore da 1 a 10" onChange={value => props.onChange({ painVasText: value })} /></label>
        <label><span>Durante quale esercizio?</span><select value={props.painExerciseId} onChange={event => props.onChange({ painExerciseId: event.target.value })}><option value="">Seleziona esercizio</option>{props.exercises.map(exercise => <option value={exercise.id} key={exercise.id}>{exercise.name}</option>)}</select></label>
        <fieldset><legend>Il dolore rimane dopo l’allenamento?</legend><BinaryChoice value={props.painPersistsPostSession} onChange={value => props.onChange({ painPersistsPostSession: value })} /></fieldset>
        <fieldset><legend>Sei comunque riuscito a terminare l’allenamento?</legend><div className="session-outcome-choice"><button type="button" className={props.outcome === 'completed' ? 'active' : ''} onClick={() => props.onChange({ completionOutcome: 'completed' })}>Sì</button><button type="button" className={props.outcome === 'not_completed' ? 'active' : ''} onClick={() => props.onChange({ completionOutcome: 'not_completed' })}>No</button></div></fieldset>
        <button className="button button--signal button--wide session-submit" disabled={props.saving} onClick={() => props.onSubmit()}><span>{submitLabel}</span><ArrowRight size={17} /></button>
      </>}
      {props.editing && <button type="button" className="button button--secondary" onClick={props.onCancel}>Annulla</button>}
    </section>
  }

  return <section className="panel session-outcome-panel session-feedback-form"><div className="panel__head"><span>✓</span><h2>Feedback fine sessione</h2></div>
    <fieldset><legend>Hai completato l’allenamento?</legend><div className="session-outcome-choice"><button type="button" className={props.outcome === 'completed' ? 'active' : ''} onClick={() => props.onChange({ completionOutcome: 'completed' })}>Sì</button><button type="button" className={props.outcome === 'not_completed' ? 'active' : ''} onClick={() => props.onChange({ completionOutcome: 'not_completed' })}>No</button></div></fieldset>
    <label><span>Quanto è stata impegnativa la sessione? (RPE 0–10)</span><ScaleChoice value={props.sessionRpe} min={0} max={10} label="Impegno da 0 a 10" onChange={value => props.onChange({ sessionRpeText: value })} /></label>
    <fieldset><legend>Hai avuto dolore?</legend><BinaryChoice value={props.painPresent} onChange={value => props.onChange({ painPresent: value })} /></fieldset>
    <label><span>Note (facoltative)</span><textarea value={props.notes} onChange={event => props.onChange({ notes: event.target.value })} /></label>
    <button className="button button--signal button--wide session-submit" disabled={props.saving} onClick={() => props.onSubmit()}><span>{submitLabel}</span><ArrowRight size={17} /></button>
    {props.editing && <button type="button" className="button button--secondary" onClick={props.onCancel}>Annulla</button>}
  </section>
}
