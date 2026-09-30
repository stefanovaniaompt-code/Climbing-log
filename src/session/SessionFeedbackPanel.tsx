import { ArrowRight, Check } from 'lucide-react'
import type { ReactNode } from 'react'
import type { CompletionOutcome, SessionFeedbackInput } from './sessionFeedback'
import type { ProgramType } from '../programs/programType'
import type { RunnerExercise } from './sessionRunner'

type Props = {
  programType: ProgramType
  sessionTitle: string
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

function FeedbackSection({ label, children }: { label: string; children: ReactNode }) {
  return <section className="athlete-feedback-section"><p>{label}</p>{children}</section>
}

function BinaryChoice({ value, onChange, yes = 'Sì', no = 'No' }: { value: boolean | null; onChange: (value: boolean) => void; yes?: string; no?: string }) {
  return <div className="session-outcome-choice athlete-feedback-choices"><button type="button" className={`athlete-feedback-choice${value === true ? ' active' : ''}`} onClick={() => onChange(true)}>{yes}</button><button type="button" className={`athlete-feedback-choice${value === false ? ' active' : ''}`} onClick={() => onChange(false)}>{no}</button></div>
}

function ScaleChoice({ value, min, max, onChange, label }: { value: string; min: number; max: number; onChange: (value: string) => void; label: string }) {
  return <div className="session-feedback-scale athlete-feedback-scale" role="group" aria-label={label}>{Array.from({ length: max - min + 1 }, (_, index) => String(index + min)).map(option => <button type="button" key={option} className={value === option ? 'active' : ''} aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>)}</div>
}

function FeedbackHeader({ title, editing }: { title: string; editing: boolean }) {
  return <header className="athlete-feedback-header"><span><Check size={19} strokeWidth={3} /></span><div><small>{editing ? 'MODIFICA FEEDBACK' : 'SESSIONE COMPLETATA'}</small><h2>{title}</h2></div></header>
}

function SubmitActions(props: Props, label: string) {
  return <div className="athlete-feedback-actions"><button className="button athlete-feedback-save" disabled={props.saving} onClick={() => props.onSubmit()}><span>{label}</span><ArrowRight size={18} /></button>{props.editing && <button type="button" className="button athlete-feedback-cancel" onClick={props.onCancel}>Annulla</button>}</div>
}

export function SessionFeedbackPanel(props: Props) {
  const submitLabel = props.saving ? 'SALVATAGGIO…' : props.editing ? 'SALVA MODIFICHE' : 'SALVA FEEDBACK'

  if (props.programType === 'patient') {
    return <section className="session-feedback-form athlete-feedback-page">
      <FeedbackHeader title={props.sessionTitle} editing={props.editing} />
      <div className="athlete-feedback-content">
        <FeedbackSection label="DOLORE DURANTE L’ALLENAMENTO"><BinaryChoice value={props.painPresent} yes="Dolore presente" no="Nessun dolore" onChange={value => { props.onChange({ painPresent: value }); if (!value) props.onSubmit({ painPresent: false }) }} /></FeedbackSection>
        {props.painPresent === true && <div className="athlete-feedback-pain-reveal">
          <FeedbackSection label="INTENSITÀ DEL DOLORE · VAS 1–10"><ScaleChoice value={props.painVas} min={1} max={10} label="Dolore da 1 a 10" onChange={value => props.onChange({ painVasText: value })} /></FeedbackSection>
          <FeedbackSection label="ESERCIZIO ASSOCIATO"><select value={props.painExerciseId} onChange={event => props.onChange({ painExerciseId: event.target.value })}><option value="">Seleziona esercizio</option>{props.exercises.map(exercise => <option value={exercise.id} key={exercise.id}>{exercise.name}</option>)}</select></FeedbackSection>
          <FeedbackSection label="IL DOLORE RIMANE DOPO L’ALLENAMENTO?"><BinaryChoice value={props.painPersistsPostSession} onChange={value => props.onChange({ painPersistsPostSession: value })} /></FeedbackSection>
          <FeedbackSection label="HAI TERMINATO L’ALLENAMENTO?"><div className="session-outcome-choice athlete-feedback-choices"><button type="button" className={`athlete-feedback-choice${props.outcome === 'completed' ? ' active' : ''}`} onClick={() => props.onChange({ completionOutcome: 'completed' })}>Sì</button><button type="button" className={`athlete-feedback-choice${props.outcome === 'not_completed' ? ' active' : ''}`} onClick={() => props.onChange({ completionOutcome: 'not_completed' })}>No</button></div></FeedbackSection>
          {SubmitActions(props, submitLabel)}
        </div>}
        {props.editing && props.painPresent !== true && <button type="button" className="button athlete-feedback-cancel" onClick={props.onCancel}>Annulla</button>}
      </div>
    </section>
  }

  return <section className="session-feedback-form athlete-feedback-page">
    <FeedbackHeader title={props.sessionTitle} editing={props.editing} />
    <div className="athlete-feedback-content">
      <FeedbackSection label="ESITO SESSIONE"><div className="session-outcome-choice athlete-feedback-choices"><button type="button" className={`athlete-feedback-choice${props.outcome === 'completed' ? ' active' : ''}`} onClick={() => props.onChange({ completionOutcome: 'completed' })}>Completata</button><button type="button" className={`athlete-feedback-choice${props.outcome === 'not_completed' ? ' active' : ''}`} onClick={() => props.onChange({ completionOutcome: 'not_completed' })}>Non completata</button></div></FeedbackSection>
      <FeedbackSection label="RPE SESSIONE · 0–10"><ScaleChoice value={props.sessionRpe} min={0} max={10} label="Impegno da 0 a 10" onChange={value => props.onChange({ sessionRpeText: value })} /></FeedbackSection>
      <FeedbackSection label="DOLORE"><BinaryChoice value={props.painPresent} yes="Dolore presente" no="Nessun dolore" onChange={value => props.onChange({ painPresent: value })} /></FeedbackSection>
      <FeedbackSection label="NOTE SESSIONE"><textarea rows={4} placeholder="Aggiungi una nota…" value={props.notes} onChange={event => props.onChange({ notes: event.target.value })} /></FeedbackSection>
      {SubmitActions(props, submitLabel)}
    </div>
  </section>
}
