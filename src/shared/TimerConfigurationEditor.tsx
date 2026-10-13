import type { ReactNode } from 'react'
import { formatTimerPreview, type TimerEditorValues } from '../prescriptions/timerConfiguration'

export function TimerConfigurationEditor({ value, previewValue, onChange, renderSetControl }: {
  value: TimerEditorValues
  previewValue?: TimerEditorValues
  onChange: (next: TimerEditorValues) => void
  renderSetControl?: (sets: number, onChange: (sets: number) => void) => ReactNode
}) {
  const update = (patch: Partial<TimerEditorValues>) => onChange({ ...value, ...patch })
  const numberField = (label: string, amount: number | null, change: (amount: number) => void, options: { min?: number; step?: number; nullable?: boolean } = {}) => (
    <label>
      <span>{label}</span>
      <div className="input-shell">
        <input
          aria-label={label}
          type="number"
          min={options.min ?? 0}
          step={options.step ?? 1}
          value={amount ?? ''}
          onChange={event => options.nullable && event.target.value === '' ? update({ restSeconds: null }) : change(Number(event.target.value))}
        />
        <em>sec</em>
      </div>
    </label>
  )

  return <section className="timer-configuration" aria-label="CONFIGURAZIONE TIMER">
    <header><b>CONFIGURAZIONE TIMER</b><span>Serie, ripetizioni, durata e recupero restano parte della prescrizione.</span></header>
    <div className="timer-configuration__grid">
      <label><span>Modalità timer</span><select aria-label="Modalità timer" value={value.mode} onChange={event => update({ mode: event.target.value as TimerEditorValues['mode'] })}>
        <option value="guided">Guidato</option><option value="recovery_only">Solo recupero</option><option value="none">Nessun timer</option>
      </select></label>
      <label><span>Modalità esecuzione</span><select aria-label="Modalità esecuzione" value={value.executionMode} onChange={event => update({ executionMode: event.target.value as TimerEditorValues['executionMode'] })}>
        <option value="bilateral">Bilaterale</option><option value="alternate_hands">DX/SX alternato</option><option value="right_only">Solo DX</option><option value="left_only">Solo SX</option>
      </select></label>
      {renderSetControl
        ? renderSetControl(value.sets, sets => update({ sets: Math.max(1, Math.trunc(sets) || 1) }))
        : <label><span>Serie</span><input aria-label="Serie" type="number" min="1" step="1" value={value.sets} onChange={event => update({ sets: Math.max(1, Number(event.target.value) || 1) })} />
        </label>}
      <label><span>Ripetizioni</span><input aria-label="Ripetizioni" type="number" min="0" step="1" value={value.reps} onChange={event => update({ reps: Math.max(0, Number(event.target.value) || 0) })} /></label>
      {numberField('Durata', value.seconds, seconds => update({ seconds }))}
      {numberField('Preparazione iniziale', value.preparationSeconds, preparationSeconds => update({ preparationSeconds }))}
      {numberField('Pausa breve cambio mano', value.handChangeSeconds, handChangeSeconds => update({ handChangeSeconds }))}
      {numberField('Pausa tra ripetizioni', value.intervalRestSeconds, intervalRestSeconds => update({ intervalRestSeconds }))}
      {numberField('Recupero', value.restSeconds, restSeconds => update({ restSeconds }), { nullable: true, step: 15 })}
    </div>
    <p className="timer-configuration__preview" aria-live="polite"><b>Anteprima</b><span>{formatTimerPreview(previewValue ?? value)}</span></p>
  </section>
}
