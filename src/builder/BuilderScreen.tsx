import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, CircleEllipsis, ClipboardList, Copy, Eye, GripVertical, Layers3, Minus, Plus, Save, Settings2, ShieldCheck, TimerReset, Trash2, TriangleAlert, Users } from 'lucide-react'
import type { AppProfile } from '../onboarding/types'
import { ConfirmDialog, Panel, ScreenHeader, Tag } from '../shared/ui'
import { canPublishProgram, prescriptionSummary, readPrescriptionEditorValues, type ProgramBuilderData, type PrescriptionStep } from './programBuilder'
import { addExercise, adjustLoads, createCalendarEvent, createProgram, createSession, createWeek, deleteCalendarEvent, deleteExercise, deleteSession, deleteWeek, duplicateWeek, loadProgramBuilder, publishProgram, updateExercise, updateSessionDetails, updateWeekDetails, type ExercisePatch } from './programBuilderRepository'
import { ExerciseTestTargetPanel } from './ExerciseTestTargetPanel'

export function BuilderScreen({ profile, selectedAthleteId }: { profile: AppProfile; selectedAthleteId: string }) {
  const [showBuilder, setShowBuilder] = useState(Boolean(selectedAthleteId))
  const [creatingProgram, setCreatingProgram] = useState(false)
  const [data, setData] = useState<ProgramBuilderData | null>(null)
  const [athleteId, setAthleteId] = useState(selectedAthleteId)
  const [programId, setProgramId] = useState('')
  const [weekId, setWeekId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [exerciseId, setExerciseId] = useState('')
  const [state, setState] = useState<'loading' | 'idle' | 'saving'>('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [newProgram, setNewProgram] = useState<{ name: string; goal: string; programType: 'athlete' | 'patient' }>({ name: '', goal: '', programType: 'athlete' })
  const [newExercise, setNewExercise] = useState('')
  const [libraryId, setLibraryId] = useState('')
  const [weekDetails, setWeekDetails] = useState({ blockName: '', phase: '', loadType: 'load' as 'load' | 'deload', notes: '' })
  const [sessionDetails, setSessionDetails] = useState({ title: '', objective: '', durationMinutes: 0, scheduledDay: 1 })
  const [patch, setPatch] = useState<ExercisePatch>({ sets: 3, reps: 5, seconds: 0, loadKg: 0, rpe: 7, restSeconds: 120, instructions: '', steps: [] })
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved')
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'week' | 'session'; id: string; name: string } | null>(null)
  const [loadPercentage, setLoadPercentage] = useState(5)
  const [calendarDraft, setCalendarDraft] = useState({ eventType: 'travel', startDate: '', endDate: '', note: '' })
  const [sessionTab, setSessionTab] = useState<'exercises' | 'notes' | 'details'>('exercises')
  const [weekSettingsOpen, setWeekSettingsOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [exerciseEditorOpen, setExerciseEditorOpen] = useState(false)
  const [exerciseAdderOpen, setExerciseAdderOpen] = useState(false)
  const initialAthleteApplied = useRef(false)
  const hydratedWeek = useRef('')
  const hydratedSession = useRef('')
  const hydratedExercise = useRef('')
  const hydratedWeekValue = useRef('')
  const hydratedSessionValue = useRef('')
  const hydratedExerciseValue = useRef('')
  const hydratingWeek = useRef(false)
  const hydratingSession = useRef(false)
  const hydratingExercise = useRef(false)
  const draftKey = `cc-builder-draft:${profile.userId}`

  const refresh = async () => {
    const next = await loadProgramBuilder(profile)
    setData(next)
    return next
  }

  useEffect(() => { refresh().catch(reason => setError(reason instanceof Error ? reason.message : 'Programmi non caricati.')).finally(() => setState('idle')) }, [profile.userId])
  useEffect(() => { try { const saved = window.localStorage.getItem(draftKey); if (saved) setNewProgram(JSON.parse(saved)) } catch { /* draft non disponibile */ } }, [draftKey])
  useEffect(() => { try { if (newProgram.name || newProgram.goal) window.localStorage.setItem(draftKey, JSON.stringify(newProgram)); else window.localStorage.removeItem(draftKey) } catch { /* draft non disponibile */ } }, [draftKey, newProgram])
  useEffect(() => {
    if (!data) return
    if (!initialAthleteApplied.current) {
      initialAthleteApplied.current = true
      if (selectedAthleteId && data.athletes.some(athlete => athlete.id === selectedAthleteId)) { setAthleteId(selectedAthleteId); return }
    }
    if (!data.athletes.some(athlete => athlete.id === athleteId)) setAthleteId(data.athletes[0]?.id ?? '')
  }, [data, athleteId, selectedAthleteId])
  const athletePrograms = data?.programs.filter(program => program.athleteId === athleteId) ?? []
  useEffect(() => {
    if (creatingProgram) return
    if (!athletePrograms.some(program => program.id === programId)) setProgramId(athletePrograms[0]?.id ?? '')
  }, [athleteId, athletePrograms, creatingProgram, programId])
  const weeks = data?.weeks.filter(week => week.programId === programId) ?? []
  useEffect(() => { if (!weeks.some(week => week.id === weekId)) setWeekId(weeks[0]?.id ?? '') }, [programId, data, weekId])
  const sessions = data?.sessions.filter(session => session.weekId === weekId) ?? []
  useEffect(() => { if (!sessions.some(session => session.id === sessionId)) setSessionId(sessions[0]?.id ?? '') }, [weekId, data, sessionId])
  useEffect(() => { setExerciseEditorOpen(false); setExerciseAdderOpen(false); setSessionTab('exercises') }, [sessionId])
  const exercises = data?.exercises.filter(exercise => exercise.sessionId === sessionId) ?? []
  useEffect(() => { if (!exercises.some(exercise => exercise.id === exerciseId)) setExerciseId(exercises[0]?.id ?? '') }, [sessionId, data, exerciseId])
  const program = athletePrograms.find(item => item.id === programId)
  const session = sessions.find(item => item.id === sessionId)
  const exercise = exercises.find(item => item.id === exerciseId)
  const selectedWeek = weeks.find(item => item.id === weekId)
  const blocks = useMemo(() => {
    const grouped = new Map<string, typeof weeks>()
    weeks.forEach(week => {
      const name = week.blockName?.trim() || 'Blocco'
      grouped.set(name, [...(grouped.get(name) ?? []), week])
    })
    return Array.from(grouped, ([name, blockWeeks]) => ({ name, weeks: blockWeeks }))
  }, [weeks])
  const programDates = program?.startDate
    ? `${new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(program.startDate))} → ${program.endDate ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(program.endDate)) : '—'} · ${weeks.length} settimane`
    : `${weeks.length} ${weeks.length === 1 ? 'settimana' : 'settimane'}`

  useEffect(() => {
    const week = weeks.find(item => item.id === weekId)
    const next = { blockName: week?.blockName ?? '', phase: week?.phase ?? '', loadType: week?.loadType ?? 'load' as 'load' | 'deload', notes: week?.notes ?? '' }
    hydratingWeek.current = true
    hydratedWeek.current = weekId
    hydratedWeekValue.current = JSON.stringify(next)
    setWeekDetails(next)
  }, [weekId, selectedWeek?.blockName, selectedWeek?.phase, selectedWeek?.loadType, selectedWeek?.notes])
  useEffect(() => {
    const next = { title: session?.title ?? '', objective: session?.objective ?? '', durationMinutes: session?.durationMinutes ?? 0, scheduledDay: session?.scheduledDay ?? 1 }
    hydratingSession.current = true
    hydratedSession.current = sessionId
    hydratedSessionValue.current = JSON.stringify(next)
    setSessionDetails(next)
  }, [sessionId, session?.title, session?.objective, session?.durationMinutes, session?.scheduledDay])

  useEffect(() => {
    if (!exercise) return
    const values = readPrescriptionEditorValues(exercise.prescription)
    const next = { sets: values.sets, reps: values.reps, seconds: values.seconds, loadKg: values.loadKg, rpe: exercise.targetRpeMax ?? 7, restSeconds: exercise.restSeconds ?? 120, instructions: exercise.instructions ?? '', steps: values.steps }
    hydratingExercise.current = true
    hydratedExercise.current = exercise.id
    hydratedExerciseValue.current = JSON.stringify(next)
    setPatch(next)
  }, [exerciseId, exercise?.prescription, exercise?.targetRpeMax, exercise?.restSeconds, exercise?.instructions])

  useEffect(() => {
    const serialized = JSON.stringify(weekDetails)
    if (hydratingWeek.current) { hydratingWeek.current = false; return }
    if (!weekId || hydratedWeek.current !== weekId || serialized === hydratedWeekValue.current) return
    setSaveStatus('saving'); const timer = window.setTimeout(() => { updateWeekDetails(profile, weekId, weekDetails.blockName, weekDetails.phase, weekDetails.loadType, weekDetails.notes).then(() => { hydratedWeekValue.current = serialized }).catch(reason => setError(reason instanceof Error ? reason.message : 'Settimana non salvata.')).finally(() => setSaveStatus('saved')) }, 700)
    return () => window.clearTimeout(timer)
  }, [profile, weekId, weekDetails])
  useEffect(() => {
    const serialized = JSON.stringify(sessionDetails)
    if (hydratingSession.current) { hydratingSession.current = false; return }
    if (!sessionId || hydratedSession.current !== sessionId || serialized === hydratedSessionValue.current || !sessionDetails.title.trim()) return
    setSaveStatus('saving'); const timer = window.setTimeout(() => { updateSessionDetails(profile, sessionId, sessionDetails.title, sessionDetails.objective, sessionDetails.durationMinutes, sessionDetails.scheduledDay).then(() => { hydratedSessionValue.current = serialized }).catch(reason => setError(reason instanceof Error ? reason.message : 'Sessione non salvata.')).finally(() => setSaveStatus('saved')) }, 700)
    return () => window.clearTimeout(timer)
  }, [profile, sessionId, sessionDetails])
  useEffect(() => {
    const serialized = JSON.stringify(patch)
    if (hydratingExercise.current) { hydratingExercise.current = false; return }
    if (!exercise || hydratedExercise.current !== exercise.id || serialized === hydratedExerciseValue.current) return
    setSaveStatus('saving'); const timer = window.setTimeout(() => { updateExercise(profile, exercise.id, exercise.prescription, patch).then(() => { hydratedExerciseValue.current = serialized }).catch(reason => setError(reason instanceof Error ? reason.message : 'Esercizio non salvato.')).finally(() => setSaveStatus('saved')) }, 700)
    return () => window.clearTimeout(timer)
  }, [profile, exercise, patch])

  const run = async <T,>(operation: () => Promise<T>, success: string, onSuccess?: (result: T) => void) => {
    setState('saving'); setError(''); setMessage('')
    try { const result = await operation(); await refresh(); onSuccess?.(result); setMessage(success) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Operazione non completata.') } finally { setState('idle') }
  }
  const submitProgram = (event: FormEvent) => {
    event.preventDefault()
    if (!athleteId || !newProgram.name.trim()) return
    void run(() => createProgram(profile, athleteId, newProgram.name, newProgram.goal, newProgram.programType), 'Bozza creata. Ora aggiungi una settimana.', id => { setProgramId(id); setCreatingProgram(false); setNewProgram({ name: '', goal: '', programType: 'athlete' }); try { window.localStorage.removeItem(draftKey) } catch { /* ignore */ } })
  }
  const addWeek = () => void run(() => createWeek(profile, programId, weeks.map(week => week.weekNumber)), 'Settimana aggiunta senza modificare le precedenti.', setWeekId)
  const duplicatePreviousWeek = () => {
    const sourceWeek = weeks.find(item => item.id === weekId)
    if (!sourceWeek) return
    setState('saving'); setError(''); setMessage('')
    void duplicateWeek(profile, sourceWeek.id).then(async id => { await refresh(); setWeekId(id); setMessage(`Settimana ${sourceWeek.weekNumber + 1} creata con sessioni ed esercizi indipendenti.`) }).catch(reason => setError(reason instanceof Error ? reason.message : 'Duplicazione non completata.')).finally(() => setState('idle'))
  }
  const addSession = () => void run(() => createSession(profile, weekId, sessions.map(item => item.order)), 'Sessione aggiunta.', setSessionId)
  const submitExercise = (event: FormEvent) => {
    event.preventDefault()
    const libraryExercise = data?.library.find(item => item.id === libraryId)
    if (!sessionId || (!libraryExercise && !newExercise.trim())) return
    void run(() => addExercise(profile, sessionId, exercises.map(item => item.order), newExercise, libraryExercise), 'Esercizio aggiunto alla sessione.', id => { setExerciseId(id); setNewExercise(''); setLibraryId('') })
  }
  const confirmDelete = () => deleteTarget && void run(async () => { if (deleteTarget.kind === 'week') { await deleteWeek(profile, deleteTarget.id); setWeekId('') } else { await deleteSession(profile, deleteTarget.id); setSessionId('') }; setDeleteTarget(null) }, `${deleteTarget?.kind === 'week' ? 'Settimana' : 'Sessione'} eliminata.`)
  const applyLoadAdjustment = (scope: 'week' | 'session') => void run(() => adjustLoads(profile, scope, scope === 'week' ? weekId : sessionId, loadPercentage), `Carichi ${loadPercentage >= 0 ? 'aumentati' : 'ridotti'} del ${Math.abs(loadPercentage)}%.`)
  const submitCalendar = (event: FormEvent) => { event.preventDefault(); if (!programId || !calendarDraft.startDate || !calendarDraft.endDate) return; void run(async () => { await createCalendarEvent(profile, programId, calendarDraft.eventType, calendarDraft.startDate, calendarDraft.endDate, calendarDraft.note); setCalendarDraft({ eventType: 'travel', startDate: '', endDate: '', note: '' }) }, 'Evento calendario salvato.') }
  const addStep = () => setPatch(value => ({ ...value, steps: [...value.steps, { label: `Set ${value.steps.length + 1}`, reps: value.reps || 1, seconds: 0, loadKg: value.loadKg || null }] }))
  const changeStep = (index: number, next: Partial<PrescriptionStep>) => setPatch(value => ({ ...value, steps: value.steps.map((step, row) => row === index ? { ...step, ...next } : step) }))
  const publish = () => {
    if (!data || !program || !canPublishProgram(program.id, data)) { setError('Per pubblicare servono almeno una settimana, una sessione e un esercizio.'); return }
    void run(() => publishProgram(profile, program.id, program.athleteId), 'Programma pubblicato. Il precedente resta archiviato e consultabile.')
  }

  if (state === 'loading' && !data) return <div className="screen"><ScreenHeader eyebrow="PROGRAMMA" title="Caricamento programma" text="Aggiornamento dati in corso." /><div className="skeleton-stack"><span /><span /><span /></div></div>

  if (!showBuilder) return <ProgramsOverview data={data} onOpen={(nextProgramId, nextAthleteId) => { setAthleteId(nextAthleteId); setProgramId(nextProgramId); setCreatingProgram(false); setShowBuilder(true) }} onCreate={() => { setProgramId(''); setCreatingProgram(true); setShowBuilder(true) }} />

  return <div className="screen coach-builder">
    <div className="coach-builder__context">
      <button type="button" className="coach-programs__back" onClick={() => setShowBuilder(false)}><ArrowLeft size={16} /> Programmi</button>
      <button type="button" onClick={() => setContextOpen(value => !value)}><span>{data?.athletes.find(item => item.id === athleteId)?.name || 'Seleziona atleta'}</span><ChevronDown size={15} /></button>
    </div>
    {contextOpen && <div className="builder-toolbar">
      <label><span>Atleta</span><select value={athleteId} onChange={event => setAthleteId(event.target.value)} disabled={state === 'saving'}>{data?.athletes.map(athlete => <option key={athlete.id} value={athlete.id}>{athlete.name}</option>)}</select></label>
      <label><span>Programma</span><select value={programId} onChange={event => { setProgramId(event.target.value); setCreatingProgram(!event.target.value) }} disabled={state === 'saving'}><option value="">Nuova bozza…</option>{athletePrograms.map(item => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label>
    </div>}
    {!data?.athletes.length && <Panel title="Nessun atleta attivo" index="00"><div className="empty-state"><Users size={22} /><b>Collega o riattiva un atleta</b><span>Il builder mostra soltanto le relazioni coach-atleta attive.</span></div></Panel>}
    {!!athleteId && !program && <Panel title="Crea una bozza" index="00"><form className="builder-create-form" onSubmit={submitProgram}><label><span>Nome programma</span><input className="standalone-input" value={newProgram.name} onChange={event => setNewProgram(current => ({ ...current, name: event.target.value }))} placeholder="Es. Forza dita · Autunno" required /></label><label><span>Tipo programma</span><select value={newProgram.programType} onChange={event => setNewProgram(current => ({ ...current, programType: event.target.value as 'athlete' | 'patient' }))}><option value="athlete">Programma atleta</option><option value="patient">Programma paziente</option></select></label><label><span>Obiettivo</span><input className="standalone-input" value={newProgram.goal} onChange={event => setNewProgram(current => ({ ...current, goal: event.target.value }))} placeholder="Obiettivo del blocco" /></label><button className="button button--signal" disabled={state === 'saving'}><Plus size={16} /> Crea bozza</button></form></Panel>}
    {program && <>
      <section className="coach-builder__hero">
        <BuilderMountainBackground />
        <div className="coach-builder__hero-content">
          <p>PROGRAMMA</p>
          <div className="coach-builder__hero-title"><h1>{program.name}</h1><Tag tone={program.status === 'active' ? 'success' : program.status === 'draft' ? 'signal' : 'neutral'}>{program.status}</Tag></div>
          <p className="coach-builder__dates">{programDates}</p>
        </div>
        <div className="coach-builder__hero-actions"><button type="button" className="button button--secondary"><Eye size={16} /> Anteprima atleta</button><button type="button" className="button button--primary" disabled={state === 'saving' || program.status === 'active'} onClick={publish}><Save size={16} /> {saveStatus === 'saving' ? 'Salvataggio…' : program.status === 'active' ? 'Pubblicato' : 'Pubblica programma'}</button><button type="button" aria-label="Cambia programma" onClick={() => setContextOpen(value => !value)}><CircleEllipsis size={18} /></button></div>
        <div className="coach-builder__goal"><span>◎</span><b>OBIETTIVO</b><p>{program.goal || 'Obiettivo da definire'}</p></div>
      </section>
      <div className="coach-builder__layout">
      <aside className="coach-builder__structure">
        <header><div><h2>Struttura del programma</h2><p>Blocchi, settimane e sessioni.</p></div><button type="button" disabled={state === 'saving'} onClick={addWeek}><Plus size={14} /> BLOCCO</button></header>
        {!!blocks.length && <div className="coach-builder__blocks">{blocks.map((block, index) => <button type="button" className={block.weeks.some(item => item.id === weekId) ? 'active' : index === blocks.length - 1 && block.weeks.every(item => item.loadType === 'deload') ? 'deload' : ''} key={`${block.name}-${index}`} onClick={() => setWeekId(block.weeks[0].id)}><b>{block.name}</b><span>Sett. {block.weeks[0].weekNumber}–{block.weeks.at(-1)?.weekNumber}</span></button>)}</div>}
        <div className="coach-builder__weeks" aria-label="Settimane del programma">
          {weeks.map(week => <button className={`${week.id === weekId ? 'active' : ''} week-type--${week.loadType}`} key={week.id} onClick={() => setWeekId(week.id)}><b>{String(week.weekNumber).padStart(2, '0')}</b><span>{week.loadType === 'deload' ? 'SCA' : 'CAR'}</span></button>)}
        </div>
        {!weekId && <div className="empty-state"><Layers3 size={22} /><b>Aggiungi la prima settimana</b><span>Le sessioni appariranno dentro la settimana selezionata.</span></div>}
        {weekId && <>
          <section className={`coach-builder__week-head week-type--${weekDetails.loadType}`}><div><h3>Settimana {selectedWeek?.weekNumber} · {weekDetails.blockName || 'Blocco'} · <span>{weekDetails.loadType === 'deload' ? 'SCARICO' : 'CARICO'}</span></h3>{weekDetails.notes && <small>{weekDetails.notes}</small>}</div><button type="button" aria-label="Azioni settimana" onClick={() => setWeekSettingsOpen(value => !value)}><CircleEllipsis size={16} /></button></section>
          {weekSettingsOpen && <div className="coach-builder__week-settings"><div className="builder-details builder-details--week"><label><span>Nome blocco</span><input value={weekDetails.blockName} onChange={event => setWeekDetails(value => ({ ...value, blockName: event.target.value }))} /></label><label><span>Fase</span><input value={weekDetails.phase} onChange={event => setWeekDetails(value => ({ ...value, phase: event.target.value }))} /></label><label><span>Tipo</span><select value={weekDetails.loadType} onChange={event => setWeekDetails(value => ({ ...value, loadType: event.target.value as 'load' | 'deload' }))}><option value="load">Carico</option><option value="deload">Scarico</option></select></label><label><span>Note / obiettivi</span><input value={weekDetails.notes} onChange={event => setWeekDetails(value => ({ ...value, notes: event.target.value }))} /></label></div><div className="builder-load-adjust"><input type="number" min="-100" max="500" value={loadPercentage} onChange={event => setLoadPercentage(Number(event.target.value))} /><span>% → 20 kg diventa {Math.round(20 * (1 + loadPercentage / 100) * 2) / 2} kg</span><button type="button" className="text-button" onClick={() => applyLoadAdjustment('week')}>Applica carichi</button><button type="button" className="text-button" disabled={state === 'saving'} onClick={duplicatePreviousWeek}><Copy size={14} /> Duplica settimana</button><button type="button" className="text-button danger" onClick={() => setDeleteTarget({ kind: 'week', id: weekId, name: weekDetails.blockName || 'settimana' })}><Trash2 size={14} /> Elimina</button></div></div>}
          <div className="coach-builder__session-list">{sessions.map(item => <button className={item.id === sessionId ? 'active' : ''} key={item.id} onClick={() => setSessionId(item.id)}><b>{String(item.order).padStart(2, '0')}</b><span><strong>{item.title}</strong><small>{item.objective || `${data?.exercises.filter(candidate => candidate.sessionId === item.id).length ?? 0} esercizi`}</small></span><ArrowRight size={16} /></button>)}</div>
          {!sessionId && <div className="empty-state empty-state--compact"><TimerReset size={20} /><b>Aggiungi la prima sessione</b></div>}
          <button className="coach-builder__add-session" disabled={state === 'saving'} onClick={addSession}><Plus size={15} /> AGGIUNGI SESSIONE</button>
        </>}
      </aside>
      <main className="coach-builder__editor">
        {!weekId && <div className="empty-state"><Layers3 size={22} /><b>Aggiungi la prima settimana</b><span>Costruisci la struttura del programma dal pannello a sinistra.</span></div>}
        {weekId && <>
          <header className="coach-builder__session-head"><div><small>SESSIONE {session?.order ?? '—'}</small><h2>{session?.title ?? 'Nessuna sessione selezionata'}</h2><p>{session?.objective || 'Seleziona o crea una sessione nella settimana.'}</p></div>{sessionId && <div><span><ClipboardList size={15} /> {exercises.length} esercizi</span><button type="button" aria-label="Azioni sessione" onClick={() => setSessionTab('details')}><CircleEllipsis size={16} /></button></div>}</header>
          {sessionId && <div className="coach-builder__tabs"><button type="button" className={sessionTab === 'exercises' ? 'active' : ''} onClick={() => setSessionTab('exercises')}>ESERCIZI ({exercises.length})</button><button type="button" className={sessionTab === 'notes' ? 'active' : ''} onClick={() => setSessionTab('notes')}>NOTE COACH</button><button type="button" className={sessionTab === 'details' ? 'active' : ''} onClick={() => setSessionTab('details')}>DETTAGLI SESSIONE</button></div>}
          {sessionId && sessionTab === 'details' && <div className="builder-details builder-details--session"><label><span>Titolo sessione</span><input value={sessionDetails.title} onChange={event => setSessionDetails(value => ({ ...value, title: event.target.value }))} /></label><label><span>Obiettivo</span><input value={sessionDetails.objective} onChange={event => setSessionDetails(value => ({ ...value, objective: event.target.value }))} /></label><label><span>Durata</span><input type="number" min="0" value={sessionDetails.durationMinutes} onChange={event => setSessionDetails(value => ({ ...value, durationMinutes: Number(event.target.value) }))} /></label><label><span>Giorno 1–7</span><input type="number" min="1" max="7" value={sessionDetails.scheduledDay} onChange={event => setSessionDetails(value => ({ ...value, scheduledDay: Number(event.target.value) }))} /></label><button type="button" className="text-button danger" onClick={() => setDeleteTarget({ kind: 'session', id: sessionId, name: sessionDetails.title })}><Trash2 size={14} /> Elimina sessione</button></div>}
          {sessionId && sessionTab === 'notes' && <div className="coach-builder__notes"><label><span>Nota / obiettivo sessione</span><textarea value={sessionDetails.objective} onChange={event => setSessionDetails(value => ({ ...value, objective: event.target.value }))} /></label></div>}
          {sessionTab === 'exercises' && exercises.map(item => <button type="button" className={`exercise-block ${item.id === exerciseId && exerciseEditorOpen ? 'active' : ''}`} key={item.id} onClick={() => { setExerciseId(item.id); setExerciseEditorOpen(value => item.id === exerciseId ? !value : true) }}><GripVertical className="drag-handle" size={16} /><span className="exercise-number">{String(item.order).padStart(2, '0')}</span><div><b>{item.name}</b><small>{prescriptionSummary(item)}</small></div><Tag tone="purple">Esercizio</Tag><ChevronDown size={17} /></button>)}
          {sessionId && sessionTab === 'exercises' && !exerciseAdderOpen && <div className="coach-builder__add-exercise-actions"><button type="button" onClick={() => { setLibraryId(''); setExerciseAdderOpen(true) }}><Plus size={15} /> AGGIUNGI ESERCIZIO</button><button type="button" onClick={() => setExerciseAdderOpen(true)}><Layers3 size={15} /> AGGIUNGI DALLA LIBRERIA</button></div>}
          {sessionId && sessionTab === 'exercises' && exerciseAdderOpen && <form className="exercise-adder" onSubmit={submitExercise}><select value={libraryId} onChange={event => setLibraryId(event.target.value)}><option value="">Esercizio rapido…</option>{data?.library.map(item => <option value={item.id} key={item.id}>{item.name}{item.category ? ` · ${item.category}` : ''}</option>)}</select>{!libraryId && <input value={newExercise} onChange={event => setNewExercise(event.target.value)} placeholder="Nome esercizio" />}<button className="drop-zone" disabled={state === 'saving'}><Plus size={17} /> Aggiungi alla sessione</button><button type="button" className="text-button" onClick={() => setExerciseAdderOpen(false)}>Annulla</button></form>}
        {sessionId && sessionTab === 'exercises' && exerciseEditorOpen && <Panel className="inspector coach-builder__inspector" title="Parametri esercizio" index="03">
        {!exercise && <div className="empty-state empty-state--compact"><Settings2 size={20} /><b>Seleziona un esercizio</b><span>Qui modificherai volume, carico, RPE e recupero.</span></div>}
        {exercise && <>
          <label><span>Serie</span><div className="stepper"><button onClick={() => setPatch(value => ({ ...value, sets: Math.max(1, value.sets - 1) }))}>−</button><b>{patch.sets}</b><button onClick={() => setPatch(value => ({ ...value, sets: value.sets + 1 }))}>+</button></div></label>
          <label><span>Ripetizioni</span><div className="input-shell"><input type="number" min="0" value={patch.reps} onChange={event => setPatch(value => ({ ...value, reps: Number(event.target.value) }))} /><em>rep</em></div></label>
          <label><span>Durata</span><div className="input-shell"><input type="number" min="0" value={patch.seconds} onChange={event => setPatch(value => ({ ...value, seconds: Number(event.target.value) }))} /><em>sec</em></div></label>
          <label><span>Carico</span><div className="input-shell"><input type="number" min="0" step="0.5" value={patch.loadKg} onChange={event => setPatch(value => ({ ...value, loadKg: Number(event.target.value) }))} /><em>kg</em></div></label>
          <label><span>Recupero</span><div className="input-shell"><input type="number" min="0" step="15" value={patch.restSeconds} onChange={event => setPatch(value => ({ ...value, restSeconds: Number(event.target.value) }))} /><em>sec</em></div></label>
          <label><span>RPE target</span><div className="rpe-scale">{[6, 7, 8, 9, 10].map(value => <button className={value === patch.rpe ? 'active' : ''} key={value} onClick={() => setPatch(current => ({ ...current, rpe: value }))}>{value}</button>)}</div></label>
          <label className="inspector-notes"><span>Indicazioni</span><textarea value={patch.instructions} onChange={event => setPatch(value => ({ ...value, instructions: event.target.value }))} /></label>
          <div className="structured-prescription"><div className="structured-prescription__head"><span>Progressione a righe</span><button className="text-button" onClick={addStep}><Plus size={13} /> Riga</button></div>{patch.steps.map((step, index) => <div className="structured-prescription__row" key={index}><input aria-label="Etichetta" value={step.label} onChange={event => changeStep(index, { label: event.target.value })} /><input aria-label="Carico kg" type="number" step="0.5" value={step.loadKg ?? ''} onChange={event => changeStep(index, { loadKg: event.target.value === '' ? null : Number(event.target.value) })} /><input aria-label="Ripetizioni" type="number" min="0" value={step.reps} onChange={event => changeStep(index, { reps: Number(event.target.value), seconds: 0 })} /><input aria-label="Secondi" type="number" min="0" value={step.seconds} onChange={event => changeStep(index, { seconds: Number(event.target.value), reps: 0 })} /><button aria-label="Elimina riga" onClick={() => setPatch(value => ({ ...value, steps: value.steps.filter((_, row) => row !== index) }))}><Minus size={13} /></button></div>)}</div>

          <ExerciseTestTargetPanel
            profile={profile}
            athleteId={athleteId}
            exerciseId={exercise.id}
            setCount={patch.sets}
          />
          <button className="button button--secondary button--wide" disabled={state === 'saving'} onClick={() => void run(() => deleteExercise(profile, exercise.id), 'Esercizio eliminato.')}><Trash2 size={15} /> Elimina esercizio</button>
        </>}
      </Panel>}
        </>}
      </main>
    </div></>}
    {program && <Panel title="Calendario programma" index="04"><form className="builder-calendar" onSubmit={submitCalendar}><select value={calendarDraft.eventType} onChange={event => setCalendarDraft(value => ({ ...value, eventType: event.target.value }))}><option value="travel">Viaggio</option><option value="off">Off</option><option value="unavailable">Indisponibilità</option><option value="note">Nota</option></select><input aria-label="Data inizio" type="date" value={calendarDraft.startDate} onChange={event => setCalendarDraft(value => ({ ...value, startDate: event.target.value }))} required /><input aria-label="Data fine" type="date" min={calendarDraft.startDate} value={calendarDraft.endDate} onChange={event => setCalendarDraft(value => ({ ...value, endDate: event.target.value }))} required /><input aria-label="Nota evento" value={calendarDraft.note} onChange={event => setCalendarDraft(value => ({ ...value, note: event.target.value }))} placeholder="Dettaglio" /><button className="button button--signal"><Plus size={14} /> Evento</button></form><div className="builder-calendar__events">{data?.calendarEvents.filter(item => item.programId === programId).map(item => <div key={item.id}><b>{item.eventType}</b><span>{item.startDate} → {item.endDate}</span><em>{item.note}</em><button aria-label="Elimina evento" onClick={() => void run(() => deleteCalendarEvent(profile, item.id), 'Evento eliminato.')}><Trash2 size={13} /></button></div>)}</div></Panel>}
    {error && <div className="completion-banner completion-banner--error"><TriangleAlert size={19} /><div><b>Operazione non completata</b><span>{error}</span></div></div>}
    {message && <div className="completion-banner"><ShieldCheck size={19} /><div><b>Program Builder aggiornato</b><span>{message}</span></div></div>}
    {deleteTarget && <ConfirmDialog title={`Eliminare ${deleteTarget.name}?`} text={deleteTarget.kind === 'week' ? 'Saranno eliminate anche tutte le sessioni e gli esercizi della settimana.' : 'Saranno eliminati anche tutti gli esercizi della sessione.'} confirmLabel="Elimina definitivamente" busy={state === 'saving'} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />}
  </div>
}

function BuilderMountainBackground() {
  return <svg viewBox="0 0 1500 270" preserveAspectRatio="xMidYMid slice" className="coach-builder__mountains" aria-hidden="true">
    <defs><linearGradient id="builderMountainFade" x1="0" x2="1"><stop offset="0%" stopColor="#EEE5F2" stopOpacity="0.15" /><stop offset="46%" stopColor="#C6AED4" stopOpacity="0.50" /><stop offset="100%" stopColor="#55206F" stopOpacity="0.54" /></linearGradient></defs>
    <rect width="1500" height="270" fill="url(#builderMountainFade)" />
    <path d="M730 270 L850 151 L915 190 L1020 52 L1085 149 L1160 93 L1250 181 L1350 79 L1500 202 L1500 270 Z" fill="#55206F" opacity="0.23" />
    <path d="M900 270 L1005 165 L1060 200 L1140 92 L1215 185 L1292 125 L1370 196 L1450 116 L1500 159 L1500 270 Z" fill="#2C103A" opacity="0.17" />
    <path d="M1020 52 L1085 149 L1160 93 L1250 181" fill="none" stroke="#55206F" strokeWidth="2" opacity="0.23" />
  </svg>
}

function ProgramsOverview({ data, onOpen, onCreate }: { data: ProgramBuilderData | null; onOpen: (programId: string, athleteId: string) => void; onCreate: () => void }) {
  const activePrograms = data?.programs.filter(item => item.status === 'active').length ?? 0
  return <div className="coach-programs">
    <header className="coach-programs__intro">
      <p className="coach-kicker">// PROCESS</p>
      <div>
        <section><h1>PROGRAMMI <span aria-hidden="true" /></h1><p>Pianificazione dei percorsi di allenamento e gestione delle sessioni.</p></section>
        <button onClick={onCreate}><Plus size={16} /> NUOVO PROGRAMMA</button>
      </div>
    </header>
    <section className="coach-programs__cards">
      <article className="coach-programs__builder-card">
        <Layers3 size={23} />
        <p>PROGRAM BUILDER</p>
        <h2>COSTRUISCI PROGRAMMA</h2>
        <span>Crea settimane, sessioni ed esercizi all'interno del percorso dell'atleta.</span>
        <button onClick={() => { const first = data?.programs[0]; if (first) onOpen(first.id, first.athleteId); else onCreate() }}>APRI BUILDER <ArrowRight size={15} /></button>
      </article>
      <article className="coach-programs__metric-card">
        <CalendarDays size={23} />
        <p>PROGRAMMI ATTIVI</p>
        <strong>{String(activePrograms).padStart(2, '0')}</strong>
        <span>Percorsi attualmente in corso.</span>
      </article>
    </section>
    <section className="coach-programs__history">
      <header><div><p>STORICO PROGRAMMI</p><h2>Tutte le programmazioni</h2></div><span>{data?.programs.length ?? 0}</span></header>
      {!data?.programs.length && <div className="empty-state"><Layers3 size={22} /><b>Nessun programma</b><span>Crea la prima programmazione per iniziare.</span></div>}
      <div className="coach-programs__history-list">{data?.programs.map(item => {
        const athlete = data.athletes.find(candidate => candidate.id === item.athleteId)
        const weekCount = data.weeks.filter(week => week.programId === item.id).length
        return <button type="button" key={item.id} onClick={() => onOpen(item.id, item.athleteId)}><span><b>{item.name}</b><small>{athlete?.name ?? 'Atleta'} · {weekCount} {weekCount === 1 ? 'settimana' : 'settimane'}</small></span><Tag tone={item.status === 'active' ? 'success' : item.status === 'draft' ? 'signal' : 'neutral'}>{item.status}</Tag><ArrowRight size={16} /></button>
      })}</div>
    </section>
  </div>
}
