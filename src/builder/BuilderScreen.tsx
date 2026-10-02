import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, Copy, Layers3, Plus, Save, Settings2, ShieldCheck, TimerReset, TriangleAlert, Users } from 'lucide-react'
import type { AppProfile } from '../onboarding/types'
import { Panel, ScreenHeader, Tag } from '../shared/ui'
import { canPublishProgram, latestWeek, prescriptionSummary, type ProgramBuilderData } from './programBuilder'
import { addExercise, createProgram, createSession, createWeek, duplicateWeek, loadProgramBuilder, publishProgram, updateExercise, updateSessionDetails, updateWeekDetails, type ExercisePatch } from './programBuilderRepository'
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
  const [weekDetails, setWeekDetails] = useState({ blockName: '', phase: '' })
  const [sessionDetails, setSessionDetails] = useState({ title: '', objective: '', durationMinutes: 0, scheduledDay: 1 })
  const [patch, setPatch] = useState<ExercisePatch>({ sets: 3, reps: 5, seconds: 0, loadKg: 0, rpe: 7, restSeconds: 120, instructions: '' })
  const initialAthleteApplied = useRef(false)

  const refresh = async () => {
    const next = await loadProgramBuilder(profile)
    setData(next)
    return next
  }

  useEffect(() => { refresh().catch(reason => setError(reason instanceof Error ? reason.message : 'Programmi non caricati.')).finally(() => setState('idle')) }, [profile.userId])
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
  const exercises = data?.exercises.filter(exercise => exercise.sessionId === sessionId) ?? []
  useEffect(() => { if (!exercises.some(exercise => exercise.id === exerciseId)) setExerciseId(exercises[0]?.id ?? '') }, [sessionId, data, exerciseId])
  const program = data?.programs.find(item => item.id === programId)
  const session = data?.sessions.find(item => item.id === sessionId)
  const exercise = data?.exercises.find(item => item.id === exerciseId)

  useEffect(() => {
    const week = data?.weeks.find(item => item.id === weekId)
    setWeekDetails({ blockName: week?.blockName ?? '', phase: week?.phase ?? '' })
  }, [data, weekId])
  useEffect(() => {
    setSessionDetails({ title: session?.title ?? '', objective: session?.objective ?? '', durationMinutes: session?.durationMinutes ?? 0, scheduledDay: session?.scheduledDay ?? 1 })
  }, [session])

  useEffect(() => {
    if (!exercise) return
    setPatch({ sets: Number(exercise.prescription.sets) || 1, reps: Number(exercise.prescription.reps) || 0, seconds: Number(exercise.prescription.seconds) || 0, loadKg: Number(exercise.prescription.loadKg) || 0, rpe: exercise.targetRpeMax ?? 7, restSeconds: exercise.restSeconds ?? 120, instructions: exercise.instructions ?? '' })
  }, [exercise])

  const run = async (operation: () => Promise<void>, success: string) => {
    setState('saving'); setError(''); setMessage('')
    try { await operation(); await refresh(); setMessage(success) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Operazione non completata.') } finally { setState('idle') }
  }
  const submitProgram = (event: FormEvent) => {
    event.preventDefault()
    if (!athleteId || !newProgram.name.trim()) return
    void run(async () => { const id = await createProgram(profile, athleteId, newProgram.name, newProgram.goal, newProgram.programType); setProgramId(id); setCreatingProgram(false); setNewProgram({ name: '', goal: '', programType: 'athlete' }) }, 'Bozza creata. Ora aggiungi una settimana.')
  }
  const addWeek = () => void run(async () => { const id = await createWeek(profile, programId, weeks.map(week => week.weekNumber)); setWeekId(id) }, 'Settimana aggiunta senza modificare le precedenti.')
  const duplicatePreviousWeek = () => {
    const sourceWeek = latestWeek(weeks)
    if (!sourceWeek) return
    void run(async () => { const id = await duplicateWeek(profile, sourceWeek.id); setWeekId(id) }, `Settimana ${sourceWeek.weekNumber + 1} creata copiando la settimana ${sourceWeek.weekNumber}.`)
  }
  const addSession = () => void run(async () => { const id = await createSession(profile, weekId, sessions.map(item => item.order)); setSessionId(id) }, 'Sessione aggiunta.')
  const submitExercise = (event: FormEvent) => {
    event.preventDefault()
    const libraryExercise = data?.library.find(item => item.id === libraryId)
    if (!sessionId || (!libraryExercise && !newExercise.trim())) return
    void run(async () => { const id = await addExercise(profile, sessionId, exercises.map(item => item.order), newExercise, libraryExercise); setExerciseId(id); setNewExercise(''); setLibraryId('') }, 'Esercizio aggiunto alla sessione.')
  }
  const saveParameters = () => exercise && void run(() => updateExercise(profile, exercise.id, patch), 'Parametri salvati sul programma.')
  const saveWeek = () => weekId && void run(() => updateWeekDetails(profile, weekId, weekDetails.blockName, weekDetails.phase), 'Dettagli della settimana salvati.')
  const saveSession = () => sessionId && void run(() => updateSessionDetails(profile, sessionId, sessionDetails.title, sessionDetails.objective, sessionDetails.durationMinutes, sessionDetails.scheduledDay), 'Dettagli della sessione salvati.')
  const publish = () => {
    if (!data || !program || !canPublishProgram(program.id, data)) { setError('Per pubblicare servono almeno una settimana, una sessione e un esercizio.'); return }
    void run(() => publishProgram(profile, program.id, program.athleteId), 'Programma pubblicato. Il precedente resta archiviato e consultabile.')
  }

  if (state === 'loading' && !data) return <div className="screen"><ScreenHeader eyebrow="PROGRAMMA" title="Caricamento programma" text="Aggiornamento dati in corso." /><div className="skeleton-stack"><span /><span /><span /></div></div>

  if (!showBuilder) return <ProgramsOverview activePrograms={data?.programs.filter(item => item.status === 'active').length ?? 0} onOpen={() => { setCreatingProgram(false); setShowBuilder(true) }} onCreate={() => { setProgramId(''); setCreatingProgram(true); setShowBuilder(true) }} />

  return <div className="screen">
    <button className="coach-programs__back" onClick={() => setShowBuilder(false)}><ArrowLeft size={16} /> Programmi</button>
    <ScreenHeader eyebrow="PROGRAMMA" title={program?.name ?? 'Nuovo programma'} text="Modifica settimane, sessioni ed esercizi." action={<div className="header-actions"><Tag tone={data?.source === 'legacy-v1' ? 'success' : 'neutral'}>{data?.source === 'legacy-v1' ? 'ONLINE' : 'DEMO'}</Tag><button className="button button--primary" disabled={!program || state === 'saving' || program.status === 'active'} onClick={publish}><Save size={16} /> {program?.status === 'active' ? 'Pubblicato' : 'Pubblica'}</button></div>} />
    <div className="builder-toolbar">
      <label><span>Atleta</span><select value={athleteId} onChange={event => setAthleteId(event.target.value)} disabled={state === 'saving'}>{data?.athletes.map(athlete => <option key={athlete.id} value={athlete.id}>{athlete.name}</option>)}</select></label>
      <label><span>Programma</span><select value={programId} onChange={event => { setProgramId(event.target.value); setCreatingProgram(!event.target.value) }} disabled={state === 'saving'}><option value="">Nuova bozza…</option>{athletePrograms.map(item => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label>
      {program && <div className="builder-program-status"><small>STATO</small><Tag tone={program.status === 'active' ? 'success' : program.status === 'draft' ? 'signal' : 'neutral'}>{program.status}</Tag><span>{program.goal || 'Obiettivo da definire'}</span></div>}
    </div>
    {!data?.athletes.length && <Panel title="Nessun atleta attivo" index="00"><div className="empty-state"><Users size={22} /><b>Collega o riattiva un atleta</b><span>Il builder mostra soltanto le relazioni coach-atleta attive.</span></div></Panel>}
    {!!athleteId && !program && <Panel title="Crea una bozza" index="00"><form className="builder-create-form" onSubmit={submitProgram}><label><span>Nome programma</span><input className="standalone-input" value={newProgram.name} onChange={event => setNewProgram(current => ({ ...current, name: event.target.value }))} placeholder="Es. Forza dita · Autunno" required /></label><label><span>Tipo programma</span><select value={newProgram.programType} onChange={event => setNewProgram(current => ({ ...current, programType: event.target.value as 'athlete' | 'patient' }))}><option value="athlete">Programma atleta</option><option value="patient">Programma paziente</option></select></label><label><span>Obiettivo</span><input className="standalone-input" value={newProgram.goal} onChange={event => setNewProgram(current => ({ ...current, goal: event.target.value }))} placeholder="Obiettivo del blocco" /></label><button className="button button--signal" disabled={state === 'saving'}><Plus size={16} /> Crea bozza</button></form></Panel>}
    {program && <div className="builder-layout">
      <Panel className="week-rail" title="Settimane" index="01">
        {weeks.map(week => <button className={week.id === weekId ? 'active' : ''} key={week.id} onClick={() => setWeekId(week.id)}><span>W{String(week.weekNumber).padStart(2, '0')}</span><b>{week.blockName || `Settimana ${week.weekNumber}`}</b><em>{week.phase || week.status}</em></button>)}
        {!!weeks.length && <button className="add-row" disabled={state === 'saving'} onClick={duplicatePreviousWeek}><Copy size={15} /> Duplica precedente</button>}
        <button className="add-row" disabled={state === 'saving'} onClick={addWeek}><Plus size={15} /> Aggiungi</button>
      </Panel>
      <div className="builder-main">
        {!weekId && <Panel title="Inizia dalla struttura" index="02"><div className="empty-state"><Layers3 size={22} /><b>Aggiungi la prima settimana</b><span>Le sessioni appariranno dentro la settimana selezionata.</span></div></Panel>}
        {weekId && <Panel title={session?.title ?? 'Sessioni'} index="02" action={<button className="button button--secondary" disabled={state === 'saving'} onClick={addSession}><Plus size={15} /> Sessione</button>}>
          <div className="builder-details builder-details--week"><label><span>Blocco settimana</span><input value={weekDetails.blockName} onChange={event => setWeekDetails(value => ({ ...value, blockName: event.target.value }))} /></label><label><span>Fase</span><input value={weekDetails.phase} onChange={event => setWeekDetails(value => ({ ...value, phase: event.target.value }))} /></label><button className="text-button" disabled={state === 'saving'} onClick={saveWeek}><Save size={14} /> Salva settimana</button></div>
          <div className="session-tabs">{sessions.map(item => <button className={item.id === sessionId ? 'active' : ''} key={item.id} onClick={() => setSessionId(item.id)}><b>S{String(item.order).padStart(2, '0')}</b><span>{item.title}</span></button>)}</div>
          {!sessionId && <div className="empty-state empty-state--compact"><TimerReset size={20} /><b>Aggiungi la prima sessione</b></div>}
          {sessionId && <div className="builder-details builder-details--session"><label><span>Titolo sessione</span><input value={sessionDetails.title} onChange={event => setSessionDetails(value => ({ ...value, title: event.target.value }))} /></label><label><span>Obiettivo</span><input value={sessionDetails.objective} onChange={event => setSessionDetails(value => ({ ...value, objective: event.target.value }))} /></label><label><span>Durata</span><input type="number" min="0" value={sessionDetails.durationMinutes} onChange={event => setSessionDetails(value => ({ ...value, durationMinutes: Number(event.target.value) }))} /></label><label><span>Giorno 1–7</span><input type="number" min="1" max="7" value={sessionDetails.scheduledDay} onChange={event => setSessionDetails(value => ({ ...value, scheduledDay: Number(event.target.value) }))} /></label><button className="text-button" disabled={state === 'saving'} onClick={saveSession}><Save size={14} /> Salva sessione</button></div>}
          {exercises.map(item => <button className={`exercise-block ${item.id === exerciseId ? 'active' : ''}`} key={item.id} onClick={() => setExerciseId(item.id)}><span className="drag-handle">⠿</span><span className="exercise-number">{String(item.order).padStart(2, '0')}</span><div><b>{item.name}</b><small>{prescriptionSummary(item)}</small></div><Tag tone="purple">Esercizio</Tag><ChevronDown size={17} /></button>)}
          {sessionId && <form className="exercise-adder" onSubmit={submitExercise}><select value={libraryId} onChange={event => setLibraryId(event.target.value)}><option value="">Esercizio rapido…</option>{data?.library.map(item => <option value={item.id} key={item.id}>{item.name}{item.category ? ` · ${item.category}` : ''}</option>)}</select>{!libraryId && <input value={newExercise} onChange={event => setNewExercise(event.target.value)} placeholder="Nome esercizio" />}<button className="drop-zone" disabled={state === 'saving'}><Plus size={17} /> Aggiungi alla sessione</button></form>}
        </Panel>}
      </div>
      <Panel className="inspector" title="Parametri" index="03">
        {!exercise && <div className="empty-state empty-state--compact"><Settings2 size={20} /><b>Seleziona un esercizio</b><span>Qui modificherai volume, carico, RPE e recupero.</span></div>}
        {exercise && <>
          <label><span>Serie</span><div className="stepper"><button onClick={() => setPatch(value => ({ ...value, sets: Math.max(1, value.sets - 1) }))}>−</button><b>{patch.sets}</b><button onClick={() => setPatch(value => ({ ...value, sets: value.sets + 1 }))}>+</button></div></label>
          <label><span>Ripetizioni</span><div className="input-shell"><input type="number" min="0" value={patch.reps} onChange={event => setPatch(value => ({ ...value, reps: Number(event.target.value) }))} /><em>rep</em></div></label>
          <label><span>Durata</span><div className="input-shell"><input type="number" min="0" value={patch.seconds} onChange={event => setPatch(value => ({ ...value, seconds: Number(event.target.value) }))} /><em>sec</em></div></label>
          <label><span>Carico</span><div className="input-shell"><input type="number" min="0" step="0.5" value={patch.loadKg} onChange={event => setPatch(value => ({ ...value, loadKg: Number(event.target.value) }))} /><em>kg</em></div></label>
          <label><span>Recupero</span><div className="input-shell"><input type="number" min="0" step="15" value={patch.restSeconds} onChange={event => setPatch(value => ({ ...value, restSeconds: Number(event.target.value) }))} /><em>sec</em></div></label>
          <label><span>RPE target</span><div className="rpe-scale">{[6, 7, 8, 9, 10].map(value => <button className={value === patch.rpe ? 'active' : ''} key={value} onClick={() => setPatch(current => ({ ...current, rpe: value }))}>{value}</button>)}</div></label>
          <label className="inspector-notes"><span>Indicazioni</span><textarea value={patch.instructions} onChange={event => setPatch(value => ({ ...value, instructions: event.target.value }))} /></label>

          <ExerciseTestTargetPanel
            profile={profile}
            athleteId={athleteId}
            exerciseId={exercise.id}
            setCount={patch.sets}
          />
          <button className="button button--signal button--wide" disabled={state === 'saving'} onClick={saveParameters}><Save size={15} /> {state === 'saving' ? 'Salvo…' : 'Salva parametri'}</button>
        </>}
      </Panel>
    </div>}
    {error && <div className="completion-banner completion-banner--error"><TriangleAlert size={19} /><div><b>Operazione non completata</b><span>{error}</span></div></div>}
    {message && <div className="completion-banner"><ShieldCheck size={19} /><div><b>Program Builder aggiornato</b><span>{message}</span></div></div>}
  </div>
}

function ProgramsOverview({ activePrograms, onOpen, onCreate }: { activePrograms: number; onOpen: () => void; onCreate: () => void }) {
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
        <button onClick={onOpen}>APRI BUILDER <ArrowRight size={15} /></button>
      </article>
      <article className="coach-programs__metric-card">
        <CalendarDays size={23} />
        <p>PROGRAMMI ATTIVI</p>
        <strong>{String(activePrograms).padStart(2, '0')}</strong>
        <span>Percorsi attualmente in corso.</span>
      </article>
    </section>
  </div>
}
