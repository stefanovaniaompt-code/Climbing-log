import { useEffect, useState, type FormEvent } from 'react'
import { Archive, BookOpen, ChevronDown, Plus, Save, Search, ShieldCheck, Trash2 } from 'lucide-react'
import type { AppProfile } from '../onboarding/types'
import { ConfirmDialog, Metric, Panel, ScreenHeader, Tag } from '../shared/ui'
import { emptyExercise, filterExercises, validateExercise, type ExerciseLibraryInput, type ExerciseLibraryItem, type LibraryStatusFilter } from './exerciseLibrary'
import { createLibraryExercise, deleteLibraryExercise, loadExerciseLibrary, setLibraryExerciseArchived, updateLibraryExercise } from './exerciseLibraryRepository'

export function LibraryScreen({ profile }: { profile: AppProfile }) {
  const [items, setItems] = useState<ExerciseLibraryItem[]>([])
  const [source, setSource] = useState<'demo' | 'legacy-v1'>('demo')
  const [selectedId, setSelectedId] = useState('')
  const [input, setInput] = useState<ExerciseLibraryInput>(emptyExercise)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<LibraryStatusFilter>('active')
  const [state, setState] = useState<'loading' | 'idle' | 'saving'>('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ExerciseLibraryItem | null>(null)

  const refresh = async () => {
    const next = await loadExerciseLibrary(profile)
    setItems(next.items); setSource(next.source)
    return next.items
  }

  useEffect(() => { refresh().then(next => setSelectedId(current => current || next.find(item => !item.archived)?.id || next[0]?.id || '')).catch(reason => setError(reason instanceof Error ? reason.message : 'Libreria non caricata.')).finally(() => setState('idle')) }, [profile.userId])
  const selected = items.find(item => item.id === selectedId)
  useEffect(() => {
    if (!selected) { setInput(emptyExercise()); return }
    setInput({ name: selected.name, category: selected.category, modality: selected.modality, description: selected.description, defaultInstructions: selected.defaultInstructions, defaultPrescription: { ...selected.defaultPrescription } })
  }, [selected])

  const categories = [...new Set(items.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'))
  const visibleItems = filterExercises(items, search, category, status)
  const usedCount = items.filter(item => item.usageCount > 0).length

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateExercise(input)
    if (validationError) { setError(validationError); return }
    setState('saving'); setError(''); setMessage('')
    try {
      if (selected) {
        await updateLibraryExercise(profile, selected.id, input)
        setMessage('Esercizio aggiornato. Le sessioni già svolte conservano i valori registrati.')
      } else {
        const id = await createLibraryExercise(profile, input)
        setSelectedId(id); setMessage('Esercizio creato e disponibile nel Program Builder.')
      }
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Esercizio non salvato.') } finally { setState('idle') }
  }

  const toggleArchive = () => {
    if (!selected) return
    setState('saving'); setError(''); setMessage('')
    setLibraryExerciseArchived(profile, selected.id, !selected.archived).then(async () => {
      await refresh()
      setMessage(selected.archived ? 'Esercizio ripristinato nella libreria attiva.' : 'Esercizio archiviato. Rimane nelle sessioni e nello storico.')
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Stato non aggiornato.')).finally(() => setState('idle'))
  }

  const removeExercise = async () => {
    if (!deleteTarget) return
    setState('saving'); setError(''); setMessage('')
    try {
      await deleteLibraryExercise(profile, deleteTarget.id)
      const remaining = await refresh()
      setSelectedId(remaining.find(item => !item.archived)?.id ?? remaining[0]?.id ?? '')
      setDeleteTarget(null)
      setMessage('Esercizio eliminato definitivamente dalla libreria. Le copie nelle sessioni e i risultati già registrati sono rimasti intatti.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Esercizio non eliminato.') } finally { setState('idle') }
  }

  return <div className="screen">
    <ScreenHeader eyebrow="LIBRERIA / ESERCIZI" title="Libreria esercizi" text="Crea e modifica gli esercizi dei programmi." action={<div className="header-actions"><Tag tone={source === 'legacy-v1' ? 'success' : 'neutral'}>{source === 'legacy-v1' ? 'ONLINE' : 'DEMO'}</Tag><button className="button button--signal" onClick={() => { setSelectedId(''); setInput(emptyExercise()); setError(''); setMessage('') }}><Plus size={16} /> Nuovo esercizio</button></div>} />
    <div className="library-summary"><Metric label="Esercizi totali" value={String(items.length).padStart(2, '0')} /><Metric label="In uso" value={String(usedCount).padStart(2, '0')} /><Metric label="Archivio precedente" value={String(items.filter(item => item.archived).length).padStart(2, '0')} /></div>
    <div className="library-layout">
      <Panel className="library-catalog" title="Catalogo" index="01">
        <div className="library-filters"><div className="library-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cerca nome, categoria…" /></div><select value={category} onChange={event => setCategory(event.target.value)}><option value="">Tutte le categorie</option>{categories.map(value => <option key={value}>{value}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value as LibraryStatusFilter)}><option value="active">Attivi</option><option value="archived">Archiviati</option><option value="all">Tutti</option></select></div>
        {state === 'loading' && <div className="skeleton-stack"><span /><span /><span /></div>}
        {!visibleItems.length && state !== 'loading' && <div className="empty-state"><BookOpen size={22} /><b>Nessun esercizio trovato</b><span>Modifica i filtri oppure crea il primo esercizio.</span></div>}
        <div className="exercise-library-list">{visibleItems.map(item => <button className={item.id === selectedId ? 'active' : ''} key={item.id} onClick={() => setSelectedId(item.id)}><span className="exercise-library-list__mark">{item.name.slice(0, 2).toUpperCase()}</span><div><b>{item.name}</b><small>{[item.category, item.modality].filter(Boolean).join(' · ') || 'Senza categoria'}</small></div><span className="exercise-library-list__usage">{item.usageCount}<small>usi</small></span>{item.archived ? <Tag tone="warning">Archivio</Tag> : <ChevronDown size={16} />}</button>)}</div>
      </Panel>
      <Panel className="library-editor" title={selected ? 'Modifica esercizio' : 'Nuovo esercizio'} index="02" action={selected && <Tag tone={selected.archived ? 'warning' : 'success'}>{selected.archived ? 'Archiviato' : 'Attivo'}</Tag>}>
        <form onSubmit={save}>
          <div className="library-form-grid"><label className="library-form-grid__wide"><span>Nome</span><input value={input.name} onChange={event => setInput(value => ({ ...value, name: event.target.value }))} placeholder="Es. Max hang · 20 mm" required /></label><label><span>Categoria</span><input value={input.category} onChange={event => setInput(value => ({ ...value, category: event.target.value }))} placeholder="Dita, Trazione…" /></label><label><span>Modalità</span><input value={input.modality} onChange={event => setInput(value => ({ ...value, modality: event.target.value }))} placeholder="Forza, Isometrico…" /></label><label><span>Serie</span><input type="number" min="1" step="1" value={input.defaultPrescription.sets} onChange={event => setInput(value => ({ ...value, defaultPrescription: { ...value.defaultPrescription, sets: Number(event.target.value) } }))} /></label><label><span>Ripetizioni</span><input type="number" min="0" value={input.defaultPrescription.reps} onChange={event => setInput(value => ({ ...value, defaultPrescription: { ...value.defaultPrescription, reps: Number(event.target.value) } }))} /></label><label><span>Durata</span><div className="input-shell"><input type="number" min="0" value={input.defaultPrescription.seconds} onChange={event => setInput(value => ({ ...value, defaultPrescription: { ...value.defaultPrescription, seconds: Number(event.target.value) } }))} /><em>sec</em></div></label><label><span>Carico</span><div className="input-shell"><input type="number" min="0" step="0.5" value={input.defaultPrescription.loadKg} onChange={event => setInput(value => ({ ...value, defaultPrescription: { ...value.defaultPrescription, loadKg: Number(event.target.value) } }))} /><em>kg</em></div></label><label className="library-form-grid__wide"><span>Descrizione</span><textarea value={input.description} onChange={event => setInput(value => ({ ...value, description: event.target.value }))} placeholder="Scopo e configurazione dell’esercizio" /></label><label className="library-form-grid__wide"><span>Indicazioni predefinite</span><textarea value={input.defaultInstructions} onChange={event => setInput(value => ({ ...value, defaultInstructions: event.target.value }))} placeholder="Tecnica, criteri di stop, sicurezza…" /></label></div>
          {error && <p className="form-error form-error--box" role="alert">{error}</p>}
          <div className="library-actions"><button className="button button--primary" disabled={state === 'saving'}><Save size={16} /> {state === 'saving' ? 'Salvo…' : selected ? 'Salva modifiche' : 'Crea esercizio'}</button>{selected?.archived && <button type="button" className="button button--secondary" disabled={state === 'saving'} onClick={toggleArchive}><Archive size={16} /> Ripristina</button>}{selected && <button type="button" className="button button--danger" disabled={state === 'saving'} onClick={() => setDeleteTarget(selected)}><Trash2 size={16} /> Elimina</button>}</div>
        </form>
      </Panel>
    </div>
    {message && <div className="completion-banner"><ShieldCheck size={19} /><div><b>Libreria aggiornata</b><span>{message}</span></div></div>}
    {deleteTarget && <ConfirmDialog title={`Eliminare ${deleteTarget.name}?`} text={`${deleteTarget.usageCount ? `È usato in ${deleteTarget.usageCount} sessioni. ` : ''}La voce sparirà dalla libreria, ma le sessioni già create e i risultati registrati manterranno nome, parametri e storico.`} confirmLabel="Elimina definitivamente" busy={state === 'saving'} onCancel={() => setDeleteTarget(null)} onConfirm={() => void removeExercise()} />}
  </div>
}

