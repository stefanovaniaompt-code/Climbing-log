import { useEffect, useMemo, useState } from 'react'
import type { AppProfile } from '../onboarding/types'
import { intentionalLoadUnit, isDirectKilogramUnit, previewLegacyIntentionalProgression, resolveIntentionalSetRows, type IntentionalLoadPlan } from '../prescriptions/intentionalBlockLoad'
import { loadAthleteTestReferences } from './testTargetRepository'
import type { ExercisePatch } from './programBuilderRepository'
import type { TestOutcomeReference } from './derivedTargets'

type Props = {
  profile: AppProfile
  athleteId: string
  instructions: string | null
  value: ExercisePatch
  onChange: (update: (current: ExercisePatch) => ExercisePatch) => void
  onSave: () => void
  saveStatus: 'saved' | 'saving' | 'error'
  hasUnsavedChanges: boolean
  busy: boolean
  showSaveAction: boolean
}

function rowsForMode(current: ExercisePatch, mode: IntentionalLoadPlan['mode']) {
  const length = Math.max(1, current.sets)
  return Array.from({ length }, (_, index) => {
    const previous = current.steps[index]
    return {
      ...previous,
      label: previous?.label ?? `Set ${index + 1}`,
      reps: previous?.reps ?? current.reps,
      seconds: previous?.seconds ?? current.seconds,
      loadKg: mode === 'manual_kg' ? previous?.loadKg ?? null : null,
      percentage: mode === 'percentage' ? previous?.percentage ?? null : undefined,
    }
  })
}

export function IntentionalBlockLiftingEditor({ profile, athleteId, instructions, value, onChange, onSave, saveStatus, hasUnsavedChanges, busy, showSaveAction }: Props) {
  const [references, setReferences] = useState<TestOutcomeReference[]>([])
  const [referenceError, setReferenceError] = useState('')
  const [referencesLoading, setReferencesLoading] = useState(false)
  const plan = value.intentionalLoad ?? null
  const legacyPreview = !plan ? previewLegacyIntentionalProgression(instructions) : null
  const compatibleReferences = useMemo(() => references.filter(item => item.qualityStatus === 'VALID' && item.value > 0 && isDirectKilogramUnit(item.unit)), [references])
  const rows = resolveIntentionalSetRows({ sets: value.sets, steps: value.steps, intentionalLoad: plan })
  const testSource = plan?.mode === 'percentage' && plan.source?.type === 'athlete_test' ? plan.source : null
  const sourceKind = plan?.mode === 'percentage' ? plan.source?.type ?? 'manual_max' : null

  useEffect(() => {
    if (sourceKind !== 'athlete_test') return
    let active = true
    setReferencesLoading(true)
    setReferenceError('')
    loadAthleteTestReferences(profile, athleteId).then(items => {
      if (active) setReferences(items)
    }).catch(reason => {
      if (active) setReferenceError(reason instanceof Error ? reason.message : 'Test atleta non disponibili.')
    }).finally(() => {
      if (active) setReferencesLoading(false)
    })
    return () => { active = false }
  }, [profile, athleteId, sourceKind])

  const selectMode = (mode: IntentionalLoadPlan['mode']) => {
    if (plan?.mode === mode) return
    if (plan && !window.confirm('Cambiare modalità sostituirà i carichi delle serie già impostati. Continuare?')) return
    onChange(current => ({
      ...current,
      steps: rowsForMode(current, mode),
      loadKg: 0,
      intentionalLoad: mode === 'manual_kg'
        ? { version: 1, mode: 'manual_kg' }
        : { version: 1, mode: 'percentage', source: { type: 'manual_max', maxKg: null } },
    }))
  }

  const selectSourceKind = (kind: 'manual_max' | 'athlete_test') => {
    if (sourceKind === kind) return
    onChange(current => ({
      ...current,
      intentionalLoad: kind === 'manual_max'
        ? { version: 1, mode: 'percentage', source: { type: 'manual_max', maxKg: null } }
        : { version: 1, mode: 'percentage', source: { type: 'athlete_test', resultId: '', metricLabel: '', measuredAt: '', value: 0, unit: 'kg' } },
    }))
  }

  const selectTest = (resultId: string) => {
    const result = compatibleReferences.find(item => item.resultId === resultId)
    if (!result || !isDirectKilogramUnit(result.unit)) return
    const unit = result.unit
    onChange(current => ({
      ...current,
      intentionalLoad: { version: 1, mode: 'percentage', source: {
        type: 'athlete_test', resultId: result.resultId, metricLabel: result.metricLabel,
        measuredAt: result.measuredAt, value: result.value, unit,
      } },
    }))
  }

  const changeSetCount = (next: number) => onChange(current => {
    const count = Math.max(1, Math.trunc(next) || 1)
    const steps = current.steps.slice(0, count).map(step => ({ ...step }))
    while (steps.length < count) steps.push({ label: `Set ${steps.length + 1}`, reps: 0, seconds: current.seconds, loadKg: null, percentage: current.intentionalLoad?.mode === 'percentage' ? null : undefined })
    return { ...current, sets: count, steps }
  })

  const changeRow = (index: number, field: 'reps' | 'percentage' | 'loadKg', raw: string) => onChange(current => ({
    ...current,
    steps: current.steps.map((step, row) => row === index ? {
      ...step,
      [field]: raw === '' ? field === 'reps' ? 0 : null : Number(raw),
    } : step),
  }))

  const importLegacy = () => {
    if (!legacyPreview || !window.confirm(`Importare ${legacyPreview.rows.length} serie dalle indicazioni? Il testo originale resterà invariato.`)) return
    onChange(current => ({
      ...current,
      sets: legacyPreview.rows.length,
      reps: 0,
      loadKg: 0,
      steps: legacyPreview.rows.map((row, index) => ({ label: `Set ${index + 1}`, reps: row.reps, seconds: current.seconds, loadKg: null, percentage: row.percentage })),
      intentionalLoad: { version: 1, mode: 'percentage', source: { type: 'manual_max', maxKg: legacyPreview.maxKg } },
    }))
  }

  return <section className="intentional-load" aria-label="Carico per serie">
    <header><b>CARICO PER SERIE</b></header>
    {!plan && <div className="intentional-load__legacy">
      <p>Prescrizione storica invariata. Scegli una modalità per configurare le serie; nessuna percentuale viene aggiunta automaticamente.</p>
      {legacyPreview && <button type="button" className="text-button" onClick={importLegacy}>Importa {legacyPreview.rows.length} serie dalle indicazioni</button>}
    </div>}
    <div className="intentional-load__controls">
      <div><span>TIPO DI CARICO</span><div className="intentional-load__choices">
        <button type="button" className={plan?.mode === 'percentage' ? 'active' : ''} onClick={() => selectMode('percentage')}>PERCENTUALE</button>
        <button type="button" className={plan?.mode === 'manual_kg' ? 'active' : ''} onClick={() => selectMode('manual_kg')}>KG MANUALI</button>
      </div></div>
      {plan?.mode === 'percentage' && <div><span>RIFERIMENTO</span><div className="intentional-load__choices">
        <button type="button" className={sourceKind === 'manual_max' ? 'active' : ''} onClick={() => selectSourceKind('manual_max')}>Massimale inserito</button>
        <button type="button" className={sourceKind === 'athlete_test' ? 'active' : ''} onClick={() => selectSourceKind('athlete_test')}>Test atleta</button>
      </div></div>}
      {plan?.mode === 'percentage' && sourceKind === 'manual_max' && <label><span>MASSIMALE</span><div className="input-shell"><input aria-label="Massimale manuale kg" type="number" min="0" step="0.5" value={plan.source?.type === 'manual_max' ? plan.source.maxKg ?? '' : ''} onChange={event => onChange(current => ({ ...current, intentionalLoad: { version: 1, mode: 'percentage', source: { type: 'manual_max', maxKg: event.target.value === '' ? null : Number(event.target.value) } } }))} /><em>kg</em></div></label>}
      {plan?.mode === 'percentage' && sourceKind === 'athlete_test' && <label><span>TEST ATLETA</span><select aria-label="Test atleta di riferimento" value={testSource?.resultId ?? ''} onChange={event => selectTest(event.target.value)}><option value="">Seleziona test valido…</option>{compatibleReferences.map(item => <option key={item.resultId} value={item.resultId}>{item.metricLabel} · {item.value} {item.unit} · {item.testedAt}</option>)}</select></label>}
      {plan && <div><span>SERIE</span><div className="intentional-load__stepper"><button type="button" aria-label="Diminuisci serie" onClick={() => changeSetCount(value.sets - 1)}>−</button><strong>{value.sets}</strong><button type="button" aria-label="Aumenta serie" onClick={() => changeSetCount(value.sets + 1)}>+</button></div></div>}
    </div>
    {referenceError && <p role="alert">{referenceError}</p>}
    {plan?.mode === 'percentage' && sourceKind === 'athlete_test' && !referencesLoading && !referenceError && compatibleReferences.length === 0 && <p>Nessun test VALID in kg compatibile; puoi usare un massimale inserito.</p>}
    {plan && <div className="intentional-load__table">
      <div className="intentional-load__row intentional-load__row--head"><span>SERIE</span><span>RIPETIZIONI</span><span>{plan.mode === 'percentage' ? 'PERCENTUALE' : 'CARICO KG'}</span>{plan.mode === 'percentage' && <span>CARICO PREVISTO</span>}</div>
      {rows.map(row => <div className="intentional-load__row" key={row.setNumber}>
        <strong>S{row.setNumber}</strong>
        <label className="input-shell"><input aria-label={`Ripetizioni serie ${row.setNumber}`} type="number" min="1" step="1" value={value.steps[row.setNumber - 1]?.reps || ''} onChange={event => changeRow(row.setNumber - 1, 'reps', event.target.value)} /><em>rep</em></label>
        {plan.mode === 'percentage'
          ? <label className="input-shell"><input aria-label={`Percentuale serie ${row.setNumber}`} type="number" min="0" max="500" step="0.5" value={value.steps[row.setNumber - 1]?.percentage ?? ''} onChange={event => changeRow(row.setNumber - 1, 'percentage', event.target.value)} /><em>%</em></label>
          : <label className="input-shell"><input aria-label={`Carico kg serie ${row.setNumber}`} type="number" min="0" step="0.5" value={value.steps[row.setNumber - 1]?.loadKg ?? ''} onChange={event => changeRow(row.setNumber - 1, 'loadKg', event.target.value)} /><em>kg</em></label>}
        {plan.mode === 'percentage' && <output>{row.calculatedKg !== null ? `${row.calculatedKg} ${intentionalLoadUnit(plan)}` : '—'}</output>}
      </div>)}
    </div>}
    <p className="intentional-load__hint">{plan?.mode === 'manual_kg' ? 'Ogni carico è inserito manualmente. Nessun valore viene calcolato da un test.' : 'Le percentuali usano il riferimento scelto. Nessun valore viene applicato automaticamente.'}</p>
    {showSaveAction && <footer><span role="status">{saveStatus === 'saving' ? 'Modifiche da salvare' : saveStatus === 'error' ? 'Salvataggio non riuscito' : 'Salvato'}</span><button type="button" className="button button--primary" disabled={busy || !hasUnsavedChanges} onClick={onSave}>{hasUnsavedChanges ? 'SALVA MODIFICHE' : 'SALVATO'}</button></footer>}
  </section>
}
