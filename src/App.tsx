import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardCheck,
  Grip,
  Home,
  KeyRound,
  Layers3,
  LogOut,
  Mail,
  Menu,
  Mountain,
  Pause,
  Play,
  Plus,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TestTube2,
  TimerReset,
  TrendingUp,
  Trash2,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { dataRuntime } from './dataRuntime'
import { countPendingOperations, flushExerciseOutbox, OUTBOX_CHANGED_EVENT } from './outbox'
import { availableModes, defaultMode, type AppProfile, type AppRole } from './onboarding/types'
import { summarizeWeek } from './dashboard/athleteHome'
import { loadAthleteHome } from './dashboard/athleteHomeRepository'
import { createExerciseTimerState, exerciseTimerPhaseLabel, formatPrescription, getExerciseTimerConfig, getRestSeconds, getSetCount, getVariableSeries, summarizeRunner, tickExerciseTimer, type ExerciseTimerState, type SessionRunnerData } from './session/sessionRunner'
import { beginSession, finishSession, loadSessionRunner, saveExerciseProgress, syncQueuedExercise } from './session/sessionRunnerRepository'
import { loadCoachDashboard } from './coach/coachDashboardRepository'
import { requestCoachLink } from './coach/coachLinkRepository'
import type { CoachDashboardData } from './coach/coachDashboard'
import { createManagedAthlete, decideCoachLinkRequest, inviteAthlete, loadAthleteManagement, removeAthleteRelationship, resolveInvitationEmail, revokeInvitation, setAthleteStatus, type AthleteManagementData } from './coach/athleteManagementRepository'
import { canPublishProgram, prescriptionSummary, type ProgramBuilderData } from './builder/programBuilder'
import { addExercise, createProgram, createSession, createWeek, loadProgramBuilder, publishProgram, updateExercise, updateSessionDetails, updateWeekDetails, type ExercisePatch } from './builder/programBuilderRepository'
import { useAuth } from './auth/AuthProvider'
import { friendlyAuthError, validatePassword } from './auth/password'
import { emptyExercise, filterExercises, validateExercise, type ExerciseLibraryInput, type ExerciseLibraryItem, type LibraryStatusFilter } from './library/exerciseLibrary'
import { createLibraryExercise, deleteLibraryExercise, loadExerciseLibrary, setLibraryExerciseArchived, updateLibraryExercise } from './library/exerciseLibraryRepository'
import { buildComparisons, calculateAsymmetry, metricHistory, validateTest, type TestData, type TestInput, type TestMetricInput, type TestSessionRecord } from './tests/testAnalytics'
import { createTest, deleteTest, loadTests } from './tests/testRepository'
import { Bars, ConfirmDialog, Metric, Panel, ScreenHeader, Tag } from './shared/ui'
import { useScreenWakeLock } from './shared/hooks/useScreenWakeLock'
import { SystemScreen } from './features/system/SystemScreen'
import { MigrationScreen } from './features/migration/MigrationScreen'

type ViewId = 'system' | 'home' | 'session' | 'dashboard' | 'athletes' | 'builder' | 'library' | 'test' | 'migration' | 'account'

type NavItem = {
  id: ViewId
  label: string
  shortLabel: string
  icon: LucideIcon
  group: string
  roles: AppRole[]
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Home atleta', shortLabel: 'Home', icon: Home, group: 'Allenamento', roles: ['athlete'] },
  { id: 'session', label: 'Sessione', shortLabel: 'Sessione', icon: TimerReset, group: 'Allenamento', roles: ['athlete'] },
  { id: 'dashboard', label: 'Coach dashboard', shortLabel: 'Coach', icon: Users, group: 'Coaching', roles: ['coach'] },
  { id: 'athletes', label: 'Atleti e inviti', shortLabel: 'Atleti', icon: Mail, group: 'Coaching', roles: ['coach'] },
  { id: 'builder', label: 'Program builder', shortLabel: 'Builder', icon: SlidersHorizontal, group: 'Coaching', roles: ['coach'] },
  { id: 'library', label: 'Libreria esercizi', shortLabel: 'Esercizi', icon: BookOpen, group: 'Coaching', roles: ['coach'] },
  { id: 'test', label: 'Test / retest', shortLabel: 'Test', icon: TestTube2, group: 'Analisi', roles: ['athlete', 'coach'] },
  { id: 'account', label: 'Account e sicurezza', shortLabel: 'Account', icon: KeyRound, group: 'Account', roles: ['athlete', 'coach'] },
]

function HomeScreen({ openSession, profile }: { openSession: (sessionId: string) => void; profile: AppProfile }) {
  const weekStorageKey = `cc-v2:week:${profile.userId}`
  const [selectedWeekId, setSelectedWeekId] = useState<string>(() => {
    try { return window.localStorage.getItem(weekStorageKey) ?? '' } catch { return '' }
  })
  const [home, setHome] = useState<Awaited<ReturnType<typeof loadAthleteHome>> | undefined>()
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setHome(undefined)
    setError('')
    loadAthleteHome(profile, selectedWeekId || null)
      .then(value => {
        if (!active) return
        setHome(value)
        if (value && selectedWeekId && value.week.id !== selectedWeekId) setSelectedWeekId(value.week.id)
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Programma non disponibile.') })
    return () => { active = false }
  }, [profile, reloadKey, selectedWeekId])

  useEffect(() => {
    try {
      if (selectedWeekId) window.localStorage.setItem(weekStorageKey, selectedWeekId)
      else window.localStorage.removeItem(weekStorageKey)
    } catch { /* Storage può essere disabilitato dal browser. */ }
  }, [selectedWeekId, weekStorageKey])

  const today = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: '2-digit', month: 'short' }).format(new Date()).toUpperCase()

  if (error) return (
    <div className="screen">
      <ScreenHeader eyebrow={`ATLETA / ${today}`} title={`Ciao, ${profile.displayName.split(' ')[0]}.`} text="Non riesco a leggere il programma in questo momento; nessun dato è stato modificato." />
      <Panel className="home-state home-state--error" title="Programma non disponibile" index="!">
        <TriangleAlert size={24} /><p>{error}</p><button className="button button--secondary" onClick={() => setReloadKey(value => value + 1)}>Riprova</button>
      </Panel>
    </div>
  )

  if (home === undefined) return (
    <div className="screen">
      <ScreenHeader eyebrow={`ATLETA / ${today}`} title={`Ciao, ${profile.displayName.split(' ')[0]}.`} text="Sto preparando la tua settimana di allenamento." />
      <Panel className="home-state" title="Caricamento programma" index="…"><div className="skeleton-stack" aria-label="Caricamento"><span /><span /><span /></div></Panel>
    </div>
  )

  if (!home) return (
    <div className="screen">
      <ScreenHeader eyebrow={`ATLETA / ${today}`} title={`Ciao, ${profile.displayName.split(' ')[0]}.`} text="Il tuo storico è al sicuro; al momento non risulta un programma attivo." />
      <Panel className="home-state" title="Nessun programma attivo" index="00"><ClipboardCheck size={25} /><p>Quando il coach pubblicherà il prossimo programma, comparirà qui senza perdere allenamenti o test precedenti.</p></Panel>
    </div>
  )

  const summary = summarizeWeek(home.sessions)
  const nextSession = summary.nextSession
  const todayIsoDay = ((new Date().getDay() + 6) % 7) + 1
  const progress = summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0
  const stageValues = home.sessions.map(session => session.status === 'completed' ? 100 : session.status === 'in_progress' ? 72 : 34)
  const nextIndex = nextSession ? home.sessions.findIndex(session => session.id === nextSession.id) : -1
  const weekIndex = home.weeks.findIndex(week => week.id === home.week.id)
  const previousWeek = weekIndex > 0 ? home.weeks[weekIndex - 1] : null
  const followingWeek = weekIndex >= 0 && weekIndex < home.weeks.length - 1 ? home.weeks[weekIndex + 1] : null

  const blockOptions = home.weeks.reduce((blocks, week) => {
    const label = (week.blockName || week.phase || 'Programma').trim()

    if (!blocks.some(block => block.label === label)) {
      blocks.push({
        label,
        firstWeekId: week.id,
      })
    }

    return blocks
  }, [] as Array<{ label: string; firstWeekId: string }>)

  const currentBlockLabel = (home.week.blockName || home.week.phase || 'Programma').trim()

  return (
    <div className="screen">
      <ScreenHeader eyebrow={`ATLETA / ${today}`} title={`Ciao, ${profile.displayName.split(' ')[0]}.`} text="Il prossimo compito arriva direttamente dal tuo programma." action={<Tag tone={home.source === 'legacy-v1' ? 'success' : 'neutral'}>{home.source === 'legacy-v1' ? 'DATI LIVE' : 'DEMO'}</Tag>} />
      <div className="readiness-strip">
        <div><span>SETTIMANA</span><strong>{String(home.week.weekNumber).padStart(2, '0')}</strong><em>/{home.program.name}</em></div>
        <p>{home.program.goal || home.week.blockName || home.week.phase || 'Programma attivo'} · {summary.completed} sessioni completate su {summary.total}.</p>
        <Tag tone={progress === 100 ? 'success' : 'purple'}>{progress}% completato</Tag>
      </div>
      <div className="grid grid--2-1">
        <Panel className="session-hero" title={nextSession ? 'Prossima sessione' : 'Settimana completata'} index="01" action={nextSession?.durationMinutes ? <Tag tone="signal">{nextSession.durationMinutes} min</Tag> : undefined}>
          <div className="session-hero__title"><Grip size={30} /><div><small>{home.week.phase || home.week.blockName || 'ALLENAMENTO'} · W{String(home.week.weekNumber).padStart(2, '0')}{nextSession ? `/D${String(nextSession.scheduledDay).padStart(2, '0')}` : ''}</small><h2>{nextSession?.title ?? 'Tutte le sessioni registrate'}</h2></div></div>
          <div className="session-facts"><span><b>{nextSession?.exerciseCount ?? summary.exerciseCount}</b> esercizi</span><span><b>{nextSession?.order ?? summary.total}</b> posizione</span><span><b>{nextSession?.sessionRpe ?? '—'}</b> RPE</span></div>
          {nextSession && <button className="button button--signal button--wide" onClick={() => openSession(nextSession.id)}><Play size={17} fill="currentColor" /><span>{nextSession.status === 'in_progress' ? 'Riprendi sessione' : 'Avvia sessione'}</span><ArrowRight size={17} /></button>}
        </Panel>
        <Panel
          title="Settimana"
          index="02"
          action={
            <div className="header-actions">
              <button className="icon-button" disabled={!previousWeek} onClick={() => previousWeek && setSelectedWeekId(previousWeek.id)} aria-label="Settimana precedente" title="Settimana precedente"><ArrowLeft size={17} /></button>
              <Tag tone="purple">W{String(home.week.weekNumber).padStart(2, '0')} / {home.weeks.length}</Tag>
              <button className="icon-button" disabled={!followingWeek} onClick={() => followingWeek && setSelectedWeekId(followingWeek.id)} aria-label="Settimana successiva" title="Settimana successiva"><ArrowRight size={17} /></button>
            </div>
          }
        >
          <label className="athlete-block-select">
            <span>Blocco</span>

            <select
              value={currentBlockLabel}
              disabled={blockOptions.length <= 1}
              onChange={event => {
                const selectedBlock = blockOptions.find(block => block.label === event.target.value)
                if (selectedBlock) setSelectedWeekId(selectedBlock.firstWeekId)
              }}
            >
              {blockOptions.map(block => (
                <option key={block.label} value={block.label}>
                  {block.label}
                </option>
              ))}
            </select>
          </label>

          <div className="week-days">
            {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((day, index) => {
              const scheduled = home.sessions.filter(session => session.scheduledDay === index + 1)
              const isDone = scheduled.length > 0 && scheduled.every(session => session.status === 'completed')
              return <div key={`${day}${index}`} className={index + 1 === todayIsoDay ? 'today' : isDone ? 'done' : ''}><span>{day}</span><b>{index + 1}</b></div>
            })}
          </div>
          <div className="progress-line"><span style={{ width: `${progress}%` }} /></div>
          <p className="muted-copy">{summary.completed} di {summary.total} sessioni completate · {summary.exerciseCount} esercizi prescritti.</p>
          <p className="muted-copy">{home.week.startDate ? `Inizio settimana: ${new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${home.week.startDate}T12:00:00`))}` : `Settimana ${home.week.weekNumber}`}</p>
        </Panel>
      </div>
      <div className="metric-grid metric-grid--4">
        <Metric label="Sessioni" value={String(summary.completed).padStart(2, '0')} unit={`/${String(summary.total).padStart(2, '0')}`} />
        <Metric label="Esercizi" value={String(summary.exerciseCount).padStart(2, '0')} />
        <Metric label="Durata prevista" value={String(summary.plannedMinutes)} unit=" min" />
        <Metric label="RPE medio" value={summary.averageRpe?.toFixed(1) ?? '—'} unit="/10" />
      </div>
      <Panel title="Sequenza settimana" index="03" action={<Tag tone="purple">{home.week.status}</Tag>}>
        <div className="trend-panel"><div><b>{home.week.blockName || home.week.phase || home.program.name}</b><p>Ogni barra è una sessione: completata, in corso o pianificata.</p></div><Bars values={stageValues.length > 0 ? stageValues : [8]} accentAt={nextIndex} /></div>
        <div className="component-row">
          {home.sessions.map(session => (
            <button
              key={session.id}
              className={`button ${session.status === 'in_progress' ? 'button--signal' : 'button--secondary'}`}
              onClick={() => openSession(session.id)}
            >
              <span>D{String(session.scheduledDay).padStart(2, '0')} · {session.title}</span>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function SessionScreen({ profile, sessionId }: { profile: AppProfile; sessionId: string }) {
  const [runner, setRunner] = useState<SessionRunnerData | null | undefined>(undefined)
  const [timerState, setTimerState] = useState<ExerciseTimerState | null>(null)
  const [outcome, setOutcome] = useState<'completed' | 'partial' | ''>('')
  const [missedIds, setMissedIds] = useState<string[]>([])
  const [sessionRpe, setSessionRpe] = useState('')
  const [sessionNote, setSessionNote] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'starting' | 'finishing' | 'saved' | 'queued' | 'error'>('idle')
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const wakeLockStatus = useScreenWakeLock(Boolean(runner && runner.session.status !== 'completed'))

  useEffect(() => {
    let active = true
    loadSessionRunner(profile, sessionId || null).then(data => {
      if (!active) return
      setRunner(data)
      setSessionRpe(data?.session.sessionRpe?.toString() ?? '')
      setSessionNote(data?.session.notes ?? '')
      setOutcome(data?.session.completionOutcome ?? '')
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Sessione non disponibile.')
    })
    return () => { active = false }
  }, [profile, sessionId, reloadKey])

  useEffect(() => {
    const refreshFromOutbox = () => setReloadKey(value => value + 1)
    window.addEventListener(OUTBOX_CHANGED_EVENT, refreshFromOutbox)
    return () => window.removeEventListener(OUTBOX_CHANGED_EVENT, refreshFromOutbox)
  }, [])

  useEffect(() => {
    if (!timerState?.running || timerState.phase === 'complete') return
    const interval = window.setInterval(() => setTimerState(value => value ? tickExerciseTimer(value) : null), 1000)
    return () => window.clearInterval(interval)
  }, [timerState?.running, timerState?.phase])

  if (error && !runner) return <div className="screen"><Panel className="home-state home-state--error" title="Sessione non disponibile" index="!"><TriangleAlert size={24} /><p>{error}</p></Panel></div>
  if (runner === undefined) return <div className="screen"><Panel className="home-state" title="Caricamento sessione" index="…"><div className="skeleton-stack" aria-label="Caricamento"><span /><span /><span /></div></Panel></div>
  if (!runner || runner.exercises.length === 0) return <div className="screen"><Panel className="home-state" title="Nessuna sessione pronta" index="00"><ClipboardCheck size={24} /><p>Non risultano esercizi prescritti nella sessione corrente.</p></Panel></div>

  const summary = summarizeRunner(runner.exercises)
  const canEdit = runner.session.status !== 'completed'

  const startCurrentSession = async () => {
    setSaveState('starting')
    setError('')
    try {
      const log = await beginSession(profile, runner.session.id)
      setRunner(value => value ? { ...value, session: { ...value.session, logId: log.id, status: log.status, startedAt: log.started_at } } : value)
      setSaveState('idle')
    } catch (reason) {
      setSaveState('error')
      setError(reason instanceof Error ? reason.message : 'Avvio non riuscito.')
    }
  }

  const toggleTimer = (exercise: SessionRunnerData['exercises'][number]) => {
    setTimerState(current => {
      if (current?.exerciseId === exercise.id) {
        if (current.phase === 'complete') {
          const restarted = createExerciseTimerState(exercise)
          return restarted ? { ...restarted, running: true } : null
        }
        return { ...current, running: !current.running }
      }
      const created = createExerciseTimerState(exercise)
      return created ? { ...created, running: true } : null
    })
  }

  const resetTimer = (exercise: SessionRunnerData['exercises'][number]) => {
    setTimerState(createExerciseTimerState(exercise))
  }

  const toggleMissed = (exerciseId: string) => {
    setMissedIds(ids => ids.includes(exerciseId) ? ids.filter(id => id !== exerciseId) : [...ids, exerciseId])
    setSaveState('idle')
    setError('')
  }

  const completeCurrentSession = async () => {
    if (!outcome) { setError('Scegli se la sessione è stata completata oppure no.'); return }
    if (outcome === 'partial' && missedIds.length === 0) { setError('Indica almeno un esercizio non eseguito.'); return }
    const parsedSessionRpe = sessionRpe.trim() ? Number(sessionRpe) : null
    if (parsedSessionRpe !== null && (!Number.isFinite(parsedSessionRpe) || parsedSessionRpe < 0 || parsedSessionRpe > 10)) { setError('L’RPE sessione deve essere compreso tra 0 e 10.'); return }

    setSaveState('finishing')
    setError('')
    try {
      let logId = runner.session.logId
      if (!logId) {
        const log = await beginSession(profile, runner.session.id)
        logId = log.id
      }

      let hasQueuedWrites = false
      const updatedExercises = [...runner.exercises]
      for (let index = 0; index < updatedExercises.length; index += 1) {
        const exercise = updatedExercises[index]
        const shouldRecord = outcome === 'completed' || !missedIds.includes(exercise.id)
        if (!shouldRecord || exercise.progress?.completed) {
          if (exercise.progress?.syncState === 'queued') hasQueuedWrites = true
          continue
        }
        const result = await saveExerciseProgress(profile, logId, exercise, { rpe: null, notes: '' })
        updatedExercises[index] = { ...exercise, progress: result.progress }
        if (result.disposition === 'queued') hasQueuedWrites = true
      }

      const nextRunner = { ...runner, session: { ...runner.session, logId, status: 'in_progress' }, exercises: updatedExercises }
      setRunner(nextRunner)
      if (hasQueuedWrites) {
        setSaveState('queued')
        setError('La sessione è protetta nella coda offline. Verrà chiusa dopo la sincronizzazione.')
        return
      }

      const missedNames = updatedExercises.filter(exercise => missedIds.includes(exercise.id)).map(exercise => exercise.name)
      const finalNotes = [sessionNote.trim(), outcome === 'partial' ? 'Non eseguiti: ' + missedNames.join(', ') : ''].filter(Boolean).join('\n')
      const result = await finishSession(profile, logId, { allCompleted: outcome === 'completed', rpe: parsedSessionRpe, notes: finalNotes })
      setRunner(value => value ? { ...value, session: { ...value.session, status: 'completed', completionOutcome: outcome, completedAt: result.completedAt, notes: finalNotes } } : value)
      setSaveState('saved')
      setTimerState(null)
    } catch (reason) {
      setSaveState('error')
      setError(reason instanceof Error ? reason.message : 'Chiusura non riuscita.')
    }
  }

  return (
    <div className="screen screen--session">
      <ScreenHeader eyebrow="SESSIONE / PANORAMICA" title={runner.session.title} text={[runner.session.objective, runner.session.durationMinutes ? String(runner.session.durationMinutes) + ' min' : ''].filter(Boolean).join(' · ')} action={<div className="header-actions"><Tag tone={runner.source === 'legacy-v1' ? 'success' : 'neutral'}>{runner.source === 'legacy-v1' ? 'DATI LIVE' : 'DEMO'}</Tag>{wakeLockStatus === 'active' && <Tag tone="success">SCHERMO ATTIVO</Tag>}</div>} />
      <div className="session-status session-status--compact">
        <div className="session-status__progress"><span>ESERCIZI DELLA SESSIONE</span><b>{String(runner.exercises.length).padStart(2, '0')} · {summary.completed} registrati</b><div className="progress-line"><i style={{ width: String(summary.percentage) + '%' }} /></div></div>
      </div>

      <div className="session-exercise-list">
        {runner.exercises.map(exercise => {
          const variableSeries = getVariableSeries(exercise)
          const isMissed = missedIds.includes(exercise.id)
          const timerConfig = getExerciseTimerConfig(exercise)
          const timerActive = timerState?.exerciseId === exercise.id
          const activeTimer = timerActive ? timerState : createExerciseTimerState(exercise)
          const timerSeconds = activeTimer?.remaining ?? getRestSeconds(exercise)
          const timerLabel = String(Math.floor(timerSeconds / 60)).padStart(2, '0') + ':' + String(timerSeconds % 60).padStart(2, '0')
          const dose = String(exercise.prescription.dose ?? 'Dose indicata dal coach')
          const load = exercise.prescription.load_value == null ? 'Corpo libero' : String(exercise.prescription.load_value) + (exercise.prescription.unit ? ' ' + String(exercise.prescription.unit) : '')
          return <article className={'session-exercise-card ' + (isMissed ? 'is-missed' : '') + (exercise.progress?.completed ? ' is-recorded' : '')} key={exercise.id}>
            <div className="session-exercise-card__head"><span>{String(exercise.order).padStart(2, '0')}</span><div><h2>{exercise.name}</h2><p>{formatPrescription(exercise)}</p></div>{exercise.progress?.completed ? <Tag tone="success">Registrato</Tag> : <Tag tone="purple">{getSetCount(exercise)} serie</Tag>}</div>
            {variableSeries.length > 0 ? <div className="variable-series"><div className="variable-series__label"><b>Carichi differenti</b><span>Una riga per ogni serie</span></div><ol>{variableSeries.map((series, index) => <li key={series + index}><span>{String(index + 1).padStart(2, '0')}</span><b>{series}</b></li>)}</ol></div> : <div className="uniform-prescription"><div><small>STRUTTURA</small><b>{getSetCount(exercise)} serie</b></div><div><small>DOSE</small><b>{dose}</b></div><div><small>CARICO</small><b>{load}</b></div><div><small>RECUPERO</small><b>{getRestSeconds(exercise)} sec</b></div></div>}
            <div className="exercise-guidance"><span>Indicazioni</span><p>{exercise.instructions || runner.session.coachNotes || 'Segui la prescrizione e interrompi in caso di dolore.'}</p></div>
            {canEdit && timerConfig && activeTimer && <div className={'exercise-timer ' + (timerActive ? 'is-active' : '')}><div><small>{exerciseTimerPhaseLabel(activeTimer)}</small><strong>{timerLabel}</strong><span>Serie {activeTimer.set}/{timerConfig.sets}{timerConfig.repetitions > 1 ? ` · Rip. ${activeTimer.repetition}/${timerConfig.repetitions}` : ''}</span></div><button className="exercise-timer__control" onClick={() => toggleTimer(exercise)} aria-label={timerActive && timerState?.running ? `Metti in pausa il timer di ${exercise.name}` : `Avvia il timer di ${exercise.name}`}>{timerActive && timerState?.running ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}<span>{timerActive && timerState?.running ? 'Pausa' : timerActive && timerState?.phase !== 'complete' ? 'Riprendi' : timerActive ? 'Ricomincia' : 'Avvia'}</span></button><button className="exercise-timer__reset" onClick={() => resetTimer(exercise)} aria-label={`Reimposta il timer di ${exercise.name}`}><TimerReset size={17} /></button></div>}
          </article>
        })}
      </div>

      {runner.session.status === 'completed' ? <div className="completion-banner"><ShieldCheck size={19} /><div><b>{runner.session.completionOutcome === 'partial' ? 'Sessione registrata come non completata' : 'Sessione completata'}</b><span>{runner.session.completionOutcome === 'partial' ? runner.session.notes : 'Lo storico è stato salvato.'}</span></div></div> : runner.session.logId ? <Panel className="session-outcome-panel" title="Esito sessione" index="✓">
        <div className="session-outcome-choice" role="group" aria-label="Esito della sessione"><button className={outcome === 'completed' ? 'active' : ''} onClick={() => { setOutcome('completed'); setMissedIds([]); setError('') }}><Check size={18} /><span><b>Completata</b><small>Ho eseguito tutti gli esercizi.</small></span></button><button className={outcome === 'partial' ? 'active partial' : ''} onClick={() => { setOutcome('partial'); setError('') }}><TriangleAlert size={18} /><span><b>Non completata</b><small>Indicherò cosa non ho eseguito.</small></span></button></div>
        {outcome === 'partial' && <fieldset className="missed-exercises"><legend>Cosa non hai eseguito?</legend>{runner.exercises.map(exercise => <label className={exercise.progress?.completed ? 'is-disabled' : ''} key={exercise.id}><input type="checkbox" checked={missedIds.includes(exercise.id)} disabled={Boolean(exercise.progress?.completed)} onChange={() => toggleMissed(exercise.id)} /><span><b>{exercise.name}</b><small>{exercise.progress?.completed ? 'Già registrato' : formatPrescription(exercise)}</small></span></label>)}</fieldset>}
        <div className="session-feedback"><label><span>RPE sessione</span><input type="number" min="0" max="10" step="0.5" value={sessionRpe} onChange={event => setSessionRpe(event.target.value)} /></label><label><span>Note</span><textarea value={sessionNote} onChange={event => setSessionNote(event.target.value)} placeholder="Sensazioni, dolore, osservazioni…" /></label></div>
        <button className="button button--signal button--wide session-submit" disabled={!outcome || saveState === 'finishing'} onClick={() => void completeCurrentSession()}><span>{saveState === 'finishing' ? 'Salvataggio…' : 'Registra esito sessione'}</span><ArrowRight size={17} /></button>
      </Panel> : <div className="session-dock"><div><small>SESSIONE PRONTA</small><b>{runner.session.title}</b></div><button className="button button--signal" disabled={saveState === 'starting'} onClick={startCurrentSession}><span>{saveState === 'starting' ? 'Avvio…' : 'Avvia sessione'}</span><Play size={17} /></button></div>}

      {error && <div className={'completion-banner ' + (saveState === 'queued' ? 'completion-banner--queued' : 'completion-banner--error')}><TriangleAlert size={19} /><div><b>{saveState === 'queued' ? 'Sessione in attesa di sincronizzazione' : 'Operazione non completata'}</b><span>{error}</span></div></div>}
      {saveState === 'saved' && <div className="completion-banner"><Check size={19} /><div><b>Esito salvato</b><span>La sessione e gli esercizi eseguiti sono stati registrati.</span></div></div>}
    </div>
  )
}

function DashboardScreen({ profile, goTo, openAthlete }: { profile: AppProfile; goTo: (view: ViewId) => void; openAthlete: (athleteId: string) => void }) {
  const [data, setData] = useState<CoachDashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setError('')
    loadCoachDashboard(profile).then(value => { if (active) setData(value) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Dashboard non disponibile.') })
    return () => { active = false }
  }, [profile])

  if (error) return <div className="screen"><ScreenHeader eyebrow="COACH / PORTAFOGLIO" title="Dati coach non disponibili." text={error} action={<button className="button button--secondary" onClick={() => window.location.reload()}>Riprova</button>} /></div>
  if (!data) return <div className="screen"><ScreenHeader eyebrow="COACH / PORTAFOGLIO" title="Sto leggendo il lavoro degli atleti." text="Programmi, sessioni e test vengono ricomposti dal backend." /><Panel title="Caricamento" index="01"><div className="skeleton-stack"><span /><span /><span /></div></Panel></div>

  const totalRelationships = data.relationshipDistribution.active + data.relationshipDistribution.inactive + data.relationshipDistribution.pending
  const activeShare = totalRelationships ? Math.round(data.relationshipDistribution.active / totalRelationships * 100) : 0
  return (
    <div className="screen">
      <ScreenHeader eyebrow="COACH / PORTAFOGLIO" title={`${data.activeAthletes} ${data.activeAthletes === 1 ? 'atleta attivo' : 'atleti attivi'}, ${data.needsReview} da rivedere.`} text="La dashboard mette prima eccezioni e aderenza, leggendo programmi, sessioni e test aggiornati." action={<div className="header-actions"><Tag tone={data.source === 'legacy-v1' ? 'success' : 'neutral'}>{data.source === 'legacy-v1' ? 'DATI LIVE' : 'DEMO'}</Tag><button className="button button--primary" onClick={() => goTo('athletes')}><Users size={16} /> Gestisci atleti</button></div>} />
      <div className="coach-summary">
        <Metric label="Atleti attivi" value={String(data.activeAthletes).padStart(2, '0')} />
        <Metric label="Aderenza media" value={data.averageAdherence === null ? '—' : String(data.averageAdherence)} unit={data.averageAdherence === null ? undefined : '%'} />
        <Metric label="Da rivedere" value={String(data.needsReview).padStart(2, '0')} signal={data.needsReview > 0} />
      </div>
      <div className="grid grid--2-1">
        <Panel title="Atleti" index="01" action={<button className="icon-button" onClick={() => goTo('athletes')} aria-label="Gestisci atleti"><Search size={17} /></button>}>
          <div className="athlete-list">
            {data.athletes.length === 0 && <div className="empty-state"><Users size={22} /><b>Nessun atleta collegato</b><span>Crea il primo invito dalla gestione atleti.</span></div>}
            {data.athletes.map(athlete => (
              <button className="athlete" key={athlete.id} onClick={() => openAthlete(athlete.id)}>
                <span className="avatar">{athlete.initials}</span>
                <span className="athlete__copy"><b>{athlete.name}</b><small>{athlete.programLabel}</small></span>
                <span className="athlete__score"><b>{athlete.adherence ?? '—'}</b><small>{athlete.adherence === null ? 'N/D' : '%'}</small></span>
                <Tag tone={athlete.relationshipStatus !== 'active' || athlete.needsAttention ? 'warning' : 'success'}>{athlete.relationshipStatus !== 'active' ? athlete.relationshipStatus : athlete.needsAttention ? 'Controlla' : 'In linea'}</Tag>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Attenzione" index="02">
          {data.alerts.length === 0 && <div className="empty-state empty-state--compact"><Check size={20} /><b>Nessuna eccezione aperta</b><span>Il portafoglio è allineato.</span></div>}
          {data.alerts.map(alert => <div className={`alert-card ${alert.tone === 'neutral' ? 'alert-card--neutral' : ''}`} key={alert.id}>{alert.tone === 'warning' ? <TriangleAlert size={20} /> : <ClipboardCheck size={20} />}<div><b>{alert.title}</b><p>{alert.detail}</p><button onClick={() => openAthlete(alert.athleteId)}>Apri atleta</button></div></div>)}
        </Panel>
      </div>
      <div className="grid grid--2">
        <Panel title="Aderenza / ultime settimane" index="03">{data.adherenceTrend.length ? <Bars values={data.adherenceTrend} accentAt={data.adherenceTrend.length - 1} /> : <div className="empty-state empty-state--compact"><TrendingUp size={20} /><b>Trend in costruzione</b><span>Comparirà dopo le prime settimane pianificate.</span></div>}<div className="chart-legend"><span><i className="purple" /> Completato</span><span><i className="mustard" /> Settimana corrente</span></div></Panel>
        <Panel title="Relazioni atleti" index="04"><div className="distribution"><div className="donut" style={{ background: `conic-gradient(var(--purple-700) 0 ${activeShare}%, var(--mustard-500) ${activeShare}% 100%)` }}><span>{activeShare}<small>%</small></span></div><ul><li><i className="purple" /> Attivi <b>{data.relationshipDistribution.active}</b></li><li><i className="mustard" /> Inattivi <b>{data.relationshipDistribution.inactive}</b></li><li><i className="pale" /> In attesa <b>{data.relationshipDistribution.pending}</b></li></ul></div></Panel>
      </div>
    </div>
  )
}

function AthleteManagementScreen({ profile, selectedAthleteId, setSelectedAthleteId, goTo, goToAthlete }: { profile: AppProfile; selectedAthleteId: string; setSelectedAthleteId: (athleteId: string) => void; goTo: (view: ViewId) => void; goToAthlete: (view: 'builder' | 'test', athleteId: string) => void }) {
  const [data, setData] = useState<AthleteManagementData | null>(null)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'saving'>('loading')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null)

  const refresh = async () => {
    setState('loading')
    setError('')
    try { setData(await loadAthleteManagement(profile)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Elenco atleti non disponibile.') } finally { setState('idle') }
  }
  useEffect(() => { void refresh() }, [profile])

  const submitInvite = async (event: FormEvent) => {
    event.preventDefault()
    setState('saving'); setError(''); setMessage('')
    try {
      if (!selectedAthleteId) throw new Error('Seleziona prima un atleta.')
      const savedEmail = data?.athletes.find(athlete => athlete.id === selectedAthleteId)?.email ?? ''
      const result = await inviteAthlete(profile, selectedAthleteId, resolveInvitationEmail(email, savedEmail))
      setMessage(result.delivered ? 'Invito registrato e link di accesso inviato.' : `Invito registrato. Invio email non confermato${result.deliveryError ? `: ${result.deliveryError}` : '.'}`)
      setEmail('')
      setData(await loadAthleteManagement(profile))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Invito non creato.') } finally { setState('idle') }
  }

  const submitAthlete = async (event: FormEvent) => {
    event.preventDefault(); setState('saving'); setError(''); setMessage('')
    try {
      const athleteId = await createManagedAthlete(profile, firstName, lastName, email)
      setFirstName(''); setLastName(''); setEmail(''); setMessage('Atleta creato. Puoi già aprire il profilo e preparare programma e test.'); setData(await loadAthleteManagement(profile)); setSelectedAthleteId(athleteId)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Atleta non creato.') } finally { setState('idle') }
  }

  const decideRequest = async (requestId: string, accept: boolean) => {
    setState('saving'); setError(''); setMessage('')
    try { await decideCoachLinkRequest(profile, requestId, accept); setMessage(accept ? 'Richiesta accettata: atleta collegato.' : 'Richiesta rifiutata.'); setData(await loadAthleteManagement(profile)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Richiesta non aggiornata.') } finally { setState('idle') }
  }

  const changeStatus = async (athleteId: string, status: 'active' | 'inactive') => {
    setState('saving'); setError(''); setMessage('')
    try { await setAthleteStatus(profile, athleteId, status); setMessage(status === 'active' ? 'Atleta riattivato.' : 'Atleta sospeso. Storico e allenamenti restano intatti.'); setData(await loadAthleteManagement(profile)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Stato non aggiornato.') } finally { setState('idle') }
  }

  const revoke = async (invitationId: string) => {
    setState('saving'); setError(''); setMessage('')
    try { await revokeInvitation(profile, invitationId); setMessage('Invito revocato senza cancellare alcun dato.'); setData(await loadAthleteManagement(profile)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Invito non revocato.') } finally { setState('idle') }
  }

  const removeAthlete = async () => {
    if (!removeTarget) return
    setState('saving'); setError(''); setMessage('')
    try {
      await removeAthleteRelationship(profile, removeTarget.id)
      setSelectedAthleteId('')
      setRemoveTarget(null)
      setMessage('Collegamento rimosso. Profilo, allenamenti completati, log esercizi e test dell’atleta sono rimasti intatti.')
      setData(await loadAthleteManagement(profile))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Atleta non rimosso.') } finally { setState('idle') }
  }

  const selectedAthlete = data?.athletes.find(athlete => athlete.id === selectedAthleteId)

  if (selectedAthlete) return <div className="screen athlete-detail-screen">
    <button className="back-button" onClick={() => { setSelectedAthleteId(''); goTo('dashboard') }}><ArrowLeft size={17} /> Torna alla dashboard coach</button>
    <ScreenHeader eyebrow="COACH / DETTAGLIO ATLETA" title={selectedAthlete.name} text="Da qui apri il programma, consulta o registra i test e gestisci il collegamento con il coach." action={<Tag tone={selectedAthlete.status === 'active' ? 'success' : 'warning'}>{selectedAthlete.status}</Tag>} />
    <div className="athlete-detail-grid">
      <button className="athlete-action-card" onClick={() => goToAthlete('builder', selectedAthlete.id)}><SlidersHorizontal size={22} /><span><b>Programma di esercizi</b><small>Apri schede, settimane, sessioni e parametri.</small></span><ArrowRight size={18} /></button>
      <button className="athlete-action-card" onClick={() => goToAthlete('test', selectedAthlete.id)}><TestTube2 size={22} /><span><b>Test e progressi</b><small>Consulta lo storico o registra una nuova rilevazione.</small></span><ArrowRight size={18} /></button>
    </div>
    <Panel title="Gestione collegamento" index="03"><div className="relationship-actions"><div><b>Rimuovi atleta dal coach</b><p>Viene eliminato solo il collegamento. L’account dell’atleta e tutto il suo storico restano nel database.</p></div><button className="button button--danger" disabled={state === 'saving'} onClick={() => setRemoveTarget({ id: selectedAthlete.id, name: selectedAthlete.name })}><Trash2 size={16} /> Rimuovi atleta</button></div></Panel>
    <Panel title="Accesso app" index="04">{selectedAthlete.appAccessActive ? <div className="completion-banner"><Check size={19} /><div><b>Accesso app attivo</b><span>L’account è collegato a questa identità atleta.</span></div></div> : <form className="invite-form" onSubmit={submitInvite}><b>Accesso app non attivo</b><label><span>Email atleta</span><input className="standalone-input" type="email" value={email || selectedAthlete.email || ''} onChange={event => setEmail(event.target.value)} required /></label><button className="button button--signal" disabled={state === 'saving'}><Mail size={16} /> Invita alla app</button></form>}</Panel>
    {error && <div className="completion-banner completion-banner--error"><TriangleAlert size={19} /><div><b>Operazione non completata</b><span>{error}</span></div></div>}
    {message && <div className="completion-banner"><ShieldCheck size={19} /><div><b>Operazione confermata</b><span>{message}</span></div></div>}
    {removeTarget && <ConfirmDialog title={`Rimuovere ${removeTarget.name}?`} text="Perderai l’accesso coach ai suoi dati finché non verrà collegato di nuovo. Profilo, allenamenti completati, esercizi registrati e test non saranno cancellati." confirmLabel="Rimuovi atleta" busy={state === 'saving'} onCancel={() => setRemoveTarget(null)} onConfirm={() => void removeAthlete()} />}
  </div>

  return <div className="screen">
    <ScreenHeader eyebrow="COACH / ATLETI" title="Crea l’atleta, poi lavora subito." text="L’account app è facoltativo e può essere collegato in seguito senza cambiare atleta o perdere lo storico." action={data && <Tag tone={data.source === 'legacy-v1' ? 'success' : 'neutral'}>{data.source === 'legacy-v1' ? 'DATI LIVE' : 'DEMO'}</Tag>} />
    <div className="grid grid--2-1">
      <Panel title="Atleti collegati" index="01">
        {state === 'loading' && !data && <div className="skeleton-stack"><span /><span /><span /></div>}
        {data?.athletes.length === 0 && <div className="empty-state"><Users size={22} /><b>Nessun atleta collegato</b><span>Creane uno: l’email non è obbligatoria.</span></div>}
        <div className="management-list">{data?.athletes.map(athlete => <div className="management-row" key={athlete.id}><button className="management-athlete-link" onClick={() => { setEmail(athlete.email ?? ''); setSelectedAthleteId(athlete.id) }}><span className="avatar">{athlete.initials}</span><span><b>{athlete.name}</b><small>{athlete.appAccessActive ? 'Accesso app attivo' : 'Accesso app non attivo'}</small></span></button><Tag tone={athlete.status === 'active' ? 'success' : 'warning'}>{athlete.status}</Tag><button className="button button--secondary" disabled={state === 'saving'} onClick={() => void changeStatus(athlete.id, athlete.status === 'active' ? 'inactive' : 'active')}>{athlete.status === 'active' ? 'Sospendi' : 'Riattiva'}</button></div>)}</div>
      </Panel>
      <Panel title="Aggiungi nuovo atleta" index="02">
        <form className="invite-form" onSubmit={submitAthlete}><label><span>Nome *</span><input className="standalone-input" value={firstName} onChange={event => setFirstName(event.target.value)} required /></label><label><span>Cognome *</span><input className="standalone-input" value={lastName} onChange={event => setLastName(event.target.value)} required /></label><label><span>Email (facoltativa)</span><input className="standalone-input" type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><p>L’atleta viene creato subito. L’invito alla app resta un’azione separata.</p><button className="button button--signal button--wide" disabled={state === 'saving'}><Plus size={16} /> {state === 'saving' ? 'Creazione…' : 'Crea atleta'}</button></form>
      </Panel>
    </div>
    {error && <div className="completion-banner completion-banner--error"><TriangleAlert size={19} /><div><b>Operazione non completata</b><span>{error}</span></div></div>}
    {message && <div className="completion-banner"><ShieldCheck size={19} /><div><b>Operazione confermata</b><span>{message}</span></div></div>}
    <Panel title="Storico inviti" index="03">
      {data?.invitations.length === 0 && <div className="empty-state empty-state--compact"><Mail size={20} /><b>Nessun invito</b><span>Gli inviti inviati compariranno qui.</span></div>}
      <div className="invitation-list">{data?.invitations.map(invite => <div className="invitation-row" key={invite.id}><div><b>{invite.email}</b><small>{new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(invite.invitedAt))}</small></div><Tag tone={invite.status === 'accepted' ? 'success' : invite.status === 'pending' ? 'signal' : 'warning'}>{invite.status}</Tag>{invite.status === 'pending' ? <button className="text-button" disabled={state === 'saving'} onClick={() => void revoke(invite.id)}>Revoca</button> : <span />}</div>)}</div>
    </Panel>
    <Panel title="Richieste di collegamento" index="04">{data?.linkRequests.filter(request => request.status === 'pending').length === 0 && <div className="empty-state empty-state--compact"><Users size={20} /><b>Nessuna richiesta</b></div>}<div className="invitation-list">{data?.linkRequests.filter(request => request.status === 'pending').map(request => <div className="invitation-row" key={request.id}><div><b>{request.athleteName}</b><small>Richiesta atleta</small></div><button className="button button--secondary" disabled={state === 'saving'} onClick={() => void decideRequest(request.id, false)}>Rifiuta</button><button className="button button--signal" disabled={state === 'saving'} onClick={() => void decideRequest(request.id, true)}>Accetta</button></div>)}</div></Panel>
  </div>
}

function BuilderScreen({ profile, selectedAthleteId }: { profile: AppProfile; selectedAthleteId: string }) {
  const [data, setData] = useState<ProgramBuilderData | null>(null)
  const [athleteId, setAthleteId] = useState(selectedAthleteId)
  const [programId, setProgramId] = useState('')
  const [weekId, setWeekId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [exerciseId, setExerciseId] = useState('')
  const [state, setState] = useState<'loading' | 'idle' | 'saving'>('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [newProgram, setNewProgram] = useState({ name: '', goal: '' })
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
  useEffect(() => { if (!athletePrograms.some(program => program.id === programId)) setProgramId(athletePrograms[0]?.id ?? '') }, [athleteId, data, programId])
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
    void run(async () => { const id = await createProgram(profile, athleteId, newProgram.name, newProgram.goal); setProgramId(id); setNewProgram({ name: '', goal: '' }) }, 'Bozza creata. Ora aggiungi una settimana.')
  }
  const addWeek = () => void run(async () => { const id = await createWeek(profile, programId, weeks.map(week => week.weekNumber)); setWeekId(id) }, 'Settimana aggiunta senza modificare le precedenti.')
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

  if (state === 'loading' && !data) return <div className="screen"><ScreenHeader eyebrow="PROGRAM BUILDER" title="Carico la programmazione…" text="Recupero atleti, programmi e libreria esercizi." /><div className="skeleton-stack"><span /><span /><span /></div></div>

  return <div className="screen">
    <ScreenHeader eyebrow="PROGRAM BUILDER / LIVE" title={program?.name ?? 'Nuovo programma'} text="Costruisci la scheda per livelli. Ogni salvataggio è verificato dal database e lo storico non viene eliminato." action={<div className="header-actions"><Tag tone={data?.source === 'legacy-v1' ? 'success' : 'neutral'}>{data?.source === 'legacy-v1' ? 'DATI LIVE' : 'DEMO'}</Tag><button className="button button--primary" disabled={!program || state === 'saving' || program.status === 'active'} onClick={publish}><Save size={16} /> {program?.status === 'active' ? 'Pubblicato' : 'Pubblica'}</button></div>} />
    <div className="builder-toolbar">
      <label><span>Atleta</span><select value={athleteId} onChange={event => setAthleteId(event.target.value)} disabled={state === 'saving'}>{data?.athletes.map(athlete => <option key={athlete.id} value={athlete.id}>{athlete.name}</option>)}</select></label>
      <label><span>Programma</span><select value={programId} onChange={event => setProgramId(event.target.value)} disabled={state === 'saving'}><option value="">Nuova bozza…</option>{athletePrograms.map(item => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label>
      {program && <div className="builder-program-status"><small>STATO</small><Tag tone={program.status === 'active' ? 'success' : program.status === 'draft' ? 'signal' : 'neutral'}>{program.status}</Tag><span>{program.goal || 'Obiettivo da definire'}</span></div>}
    </div>
    {!data?.athletes.length && <Panel title="Nessun atleta attivo" index="00"><div className="empty-state"><Users size={22} /><b>Collega o riattiva un atleta</b><span>Il builder mostra soltanto le relazioni coach-atleta attive.</span></div></Panel>}
    {!!athleteId && !program && <Panel title="Crea una bozza" index="00"><form className="builder-create-form" onSubmit={submitProgram}><label><span>Nome programma</span><input className="standalone-input" value={newProgram.name} onChange={event => setNewProgram(current => ({ ...current, name: event.target.value }))} placeholder="Es. Forza dita · Autunno" required /></label><label><span>Obiettivo</span><input className="standalone-input" value={newProgram.goal} onChange={event => setNewProgram(current => ({ ...current, goal: event.target.value }))} placeholder="Obiettivo del blocco" /></label><button className="button button--signal" disabled={state === 'saving'}><Plus size={16} /> Crea bozza</button></form></Panel>}
    {program && <div className="builder-layout">
      <Panel className="week-rail" title="Settimane" index="01">
        {weeks.map(week => <button className={week.id === weekId ? 'active' : ''} key={week.id} onClick={() => setWeekId(week.id)}><span>W{String(week.weekNumber).padStart(2, '0')}</span><b>{week.blockName || `Settimana ${week.weekNumber}`}</b><em>{week.phase || week.status}</em></button>)}
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
          <button className="button button--signal button--wide" disabled={state === 'saving'} onClick={saveParameters}><Save size={15} /> {state === 'saving' ? 'Salvo…' : 'Salva parametri'}</button>
        </>}
      </Panel>
    </div>}
    {error && <div className="completion-banner completion-banner--error"><TriangleAlert size={19} /><div><b>Operazione non completata</b><span>{error}</span></div></div>}
    {message && <div className="completion-banner"><ShieldCheck size={19} /><div><b>Program Builder aggiornato</b><span>{message}</span></div></div>}
  </div>
}

function LibraryScreen({ profile }: { profile: AppProfile }) {
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
    <ScreenHeader eyebrow="LIBRERIA / ESERCIZI" title="Un esercizio, una definizione chiara." text="Crea prescrizioni riutilizzabili nei programmi. L’eliminazione richiede conferma e non modifica le sessioni o lo storico già registrati." action={<div className="header-actions"><Tag tone={source === 'legacy-v1' ? 'success' : 'neutral'}>{source === 'legacy-v1' ? 'DATI LIVE' : 'DEMO'}</Tag><button className="button button--signal" onClick={() => { setSelectedId(''); setInput(emptyExercise()); setError(''); setMessage('') }}><Plus size={16} /> Nuovo esercizio</button></div>} />
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

const createMetricInput = (side: TestMetricInput['side'] = 'bilateral'): TestMetricInput => ({ metricKey: 'peak_force', metricLabel: 'Forza picco', value: Number.NaN, unit: 'kg', side, grip: '20 mm', normalizeToBodyWeight: true, setup: {}, notes: '' })
const createTestInput = (athleteId = ''): TestInput => ({ athleteId, testedAt: new Date().toISOString().slice(0, 10), bodyWeightKg: null, protocolVersion: 'BLOCK-LIFT-20-V1', context: { posture: 'seated' }, notes: '', metrics: [createMetricInput('right'), createMetricInput('left')] })

function TestScreen({ profile, selectedAthleteId }: { profile: AppProfile; selectedAthleteId: string }) {
  const [data, setData] = useState<TestData | null>(null)
  const [athleteId, setAthleteId] = useState(profile.role === 'athlete' ? profile.athleteId ?? '' : selectedAthleteId)
  const [formOpen, setFormOpen] = useState(false)
  const [input, setInput] = useState<TestInput>(() => createTestInput(profile.role === 'athlete' ? profile.athleteId ?? '' : ''))
  const [state, setState] = useState<'loading' | 'idle' | 'saving'>('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TestSessionRecord | null>(null)

  const refresh = async () => {
    const next = await loadTests(profile)
    setData(next)
    return next
  }
  useEffect(() => { refresh().then(next => setAthleteId(current => selectedAthleteId && next.athletes.some(athlete => athlete.id === selectedAthleteId) ? selectedAthleteId : current || next.athletes[0]?.id || '')).catch(reason => setError(reason instanceof Error ? reason.message : 'Test non caricati.')).finally(() => setState('idle')) }, [profile.userId, selectedAthleteId])
  useEffect(() => { setInput(value => ({ ...value, athleteId })) }, [athleteId])

  const comparisons = data ? buildComparisons(data, athleteId) : []
  const asymmetries = calculateAsymmetry(comparisons)
  const athleteSessions = data?.sessions.filter(session => session.athleteId === athleteId).sort((a, b) => b.testedAt.localeCompare(a.testedAt)) ?? []
  const athleteName = data?.athletes.find(athlete => athlete.id === athleteId)?.name ?? 'Atleta'

  const updateMetric = (index: number, patch: Partial<TestMetricInput>) => setInput(value => ({ ...value, metrics: value.metrics.map((metric, metricIndex) => metricIndex === index ? { ...metric, ...patch } : metric) }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateTest(input)
    if (validationError) { setError(validationError); return }
    setState('saving'); setError(''); setMessage('')
    try {
      await createTest(profile, input)
      await refresh()
      setInput(createTestInput(athleteId)); setFormOpen(false)
      setMessage('Test registrato. I confronti sono stati ricalcolati senza modificare i risultati precedenti.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Test non registrato.') } finally { setState('idle') }
  }

  const removeTest = async () => {
    if (!deleteTarget) return
    setState('saving'); setError(''); setMessage('')
    try {
      await deleteTest(profile, deleteTarget.id)
      await refresh()
      setDeleteTarget(null)
      setMessage('Rilevazione eliminata. Analytics, trend e confronti sono stati ricalcolati sui test rimanenti.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Test non eliminato.') } finally { setState('idle') }
  }

  return <div className="screen">
    <ScreenHeader eyebrow="TEST / RETEST / ANALYTICS" title={athleteSessions.length ? `Progressi di ${athleteName}.` : 'Costruisci la prima baseline.'} text="Ogni risultato resta immutato. Delta, normalizzazione e asimmetria compaiono solo quando protocollo e setup sono confrontabili." action={<div className="header-actions"><Tag tone={data?.source === 'legacy-v1' ? 'success' : 'neutral'}>{data?.source === 'legacy-v1' ? 'DATI LIVE' : 'DEMO'}</Tag><button className="button button--signal" disabled={!athleteId} onClick={() => { setFormOpen(value => !value); setError(''); setInput(createTestInput(athleteId)) }}><Plus size={16} /> {formOpen ? 'Chiudi' : 'Registra test'}</button></div>} />
    <div className="test-toolbar"><label><span>Atleta</span><select value={athleteId} onChange={event => setAthleteId(event.target.value)} disabled={profile.role === 'athlete'}>{data?.athletes.map(athlete => <option value={athlete.id} key={athlete.id}>{athlete.name}</option>)}</select></label><div><small>TEST REGISTRATI</small><strong>{String(athleteSessions.length).padStart(2, '0')}</strong></div><div><small>SERIE MISURATE</small><strong>{String(comparisons.length).padStart(2, '0')}</strong></div><div><small>CONFRONTABILI</small><strong>{String(comparisons.filter(item => item.comparable).length).padStart(2, '0')}</strong></div></div>
    {formOpen && <Panel className="test-entry-panel" title="Nuova rilevazione" index="00" action={<Tag tone="signal">Nuovo record</Tag>}>
      <form onSubmit={submit}>
        <div className="test-meta-form"><label><span>Data</span><input type="date" value={input.testedAt} onChange={event => setInput(value => ({ ...value, testedAt: event.target.value }))} required /></label><label><span>Peso corporeo</span><div className="input-shell"><input type="number" min="1" step="0.1" value={input.bodyWeightKg ?? ''} onChange={event => setInput(value => ({ ...value, bodyWeightKg: event.target.value ? Number(event.target.value) : null }))} /><em>kg</em></div></label><label><span>Protocollo</span><input value={input.protocolVersion} onChange={event => setInput(value => ({ ...value, protocolVersion: event.target.value }))} required /></label><label><span>Setup generale</span><input value={String(input.context.posture ?? '')} onChange={event => setInput(value => ({ ...value, context: { ...value.context, posture: event.target.value } }))} placeholder="Es. seated" /></label></div>
        <div className="test-metric-editor"><div className="test-metric-head"><b>Misure</b><button type="button" className="text-button" onClick={() => setInput(value => ({ ...value, metrics: [...value.metrics, createMetricInput()] }))}><Plus size={14} /> Aggiungi misura</button></div>{input.metrics.map((metric, index) => <div className="test-metric-row" key={`${index}-${metric.side}`}><label><span>Metrica</span><input value={metric.metricLabel} onChange={event => updateMetric(index, { metricLabel: event.target.value, metricKey: event.target.value.toLocaleLowerCase('it').trim().replace(/[^a-z0-9]+/g, '_') })} /></label><label><span>Lato</span><select value={metric.side ?? ''} onChange={event => updateMetric(index, { side: (event.target.value || null) as TestMetricInput['side'] })}><option value="bilateral">Bilaterale</option><option value="right">Destra</option><option value="left">Sinistra</option><option value="">Nessuno</option></select></label><label><span>Valore</span><input type="number" step="0.01" value={Number.isFinite(metric.value) ? metric.value : ''} onChange={event => updateMetric(index, { value: event.target.value === '' ? Number.NaN : Number(event.target.value) })} required /></label><label><span>Unità</span><input value={metric.unit} onChange={event => updateMetric(index, { unit: event.target.value })} /></label><label><span>Presa</span><input value={metric.grip} onChange={event => updateMetric(index, { grip: event.target.value })} /></label><label className="test-normalize"><input type="checkbox" checked={metric.normalizeToBodyWeight} onChange={event => updateMetric(index, { normalizeToBodyWeight: event.target.checked })} /><span>Normalizza BW</span></label>{input.metrics.length > 1 && <button type="button" className="text-button test-remove" onClick={() => setInput(value => ({ ...value, metrics: value.metrics.filter((_, metricIndex) => metricIndex !== index) }))}>Rimuovi</button>}</div>)}</div>
        <label className="test-notes"><span>Note</span><textarea value={input.notes} onChange={event => setInput(value => ({ ...value, notes: event.target.value }))} placeholder="Condizioni, dolore, osservazioni…" /></label>
        {error && <p className="form-error form-error--box" role="alert">{error}</p>}
        <button className="button button--primary" disabled={state === 'saving'}><Save size={16} /> {state === 'saving' ? 'Registro…' : 'Registra e calcola'}</button>
      </form>
    </Panel>}
    {state === 'loading' && <div className="skeleton-stack"><span /><span /><span /></div>}
    {!formOpen && error && <div className="completion-banner completion-banner--error"><TriangleAlert size={19} /><div><b>Operazione non completata</b><span>{error}</span></div></div>}
    {message && <div className="completion-banner"><ShieldCheck size={19} /><div><b>Analytics aggiornate</b><span>{message}</span></div></div>}
    {!athleteSessions.length && state !== 'loading' && <Panel title="Nessun test" index="01"><div className="empty-state"><TestTube2 size={22} /><b>Registra la baseline</b><span>Il primo test crea il riferimento; dal secondo iniziano delta e trend.</span></div></Panel>}
    {!!comparisons.length && <div className="test-analytics-grid">
      {comparisons.map((item, index) => { const history = data ? metricHistory(data, athleteId, item.key) : []; const maximum = Math.max(...history.map(point => Math.abs(point.value)), 1); return <Panel className="test-metric-card" title={`${item.label}${item.side ? ` · ${item.side === 'right' ? 'DX' : item.side === 'left' ? 'SX' : 'BI'}` : ''}`} index={String(index + 1).padStart(2, '0')} action={<Tag tone={item.comparable ? 'success' : 'warning'}>{item.comparable ? 'Coerente' : 'Non confrontabile'}</Tag>} key={item.key}><div className="test-current"><strong>{item.latest.toLocaleString('it-IT', { maximumFractionDigits: 2 })}<small> {item.unit}</small></strong>{item.delta !== null && <span className={item.delta >= 0 ? 'positive' : 'negative'}>{item.delta >= 0 ? '+' : ''}{item.delta.toLocaleString('it-IT', { maximumFractionDigits: 2 })} · {item.percent?.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</span>}</div><div className="test-trend" aria-label={`Storico ${item.label}`}>{history.map(point => <i key={point.date} style={{ height: `${Math.max(8, Math.abs(point.value) / maximum * 100)}%` }} title={`${point.date}: ${point.value} ${item.unit}`} />)}</div><div className="test-card-meta"><span>{item.grip || 'Presa n/d'}</span>{item.normalized !== null && <span>{item.normalized.toLocaleString('it-IT', { maximumFractionDigits: 2 })} × BW</span>}<span>{item.reason ?? `${history.length} rilevazioni`}</span></div></Panel> })}
      {asymmetries.map(item => <Panel className="asymmetry" title={`Asimmetria · ${item.label}`} index="Δ" key={item.key}><div className="asymmetry__value">{item.percent.toLocaleString('it-IT', { maximumFractionDigits: 1 })}<span>%</span></div><div className="asymmetry__track"><i style={{ left: `${Math.min(100, item.percent * 5)}%` }} /></div><p>{item.weakerSide === 'Bilanciato' ? 'Valori bilanciati.' : `Lato più debole: ${item.weakerSide}.`} {item.percent <= 7 ? 'Entro la soglia operativa del 7%.' : 'Sopra la soglia operativa del 7%.'}</p><Tag tone={item.percent <= 7 ? 'success' : 'warning'}>{item.percent <= 7 ? 'Bilanciato' : 'Da monitorare'}</Tag></Panel>)}
    </div>}
    {!!athleteSessions.length && <Panel title="Storico test" index="H"><div className="test-history"><div><b>Data</b><b>Protocollo</b><b>Peso</b><b>Misure</b><b>Note</b><b>Azioni</b></div>{athleteSessions.map(session => <div key={session.id}><span>{new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(`${session.testedAt}T12:00:00`))}</span><span>{session.protocolVersion || 'Non indicato'}</span><span>{session.bodyWeightKg ? `${session.bodyWeightKg.toLocaleString('it-IT')} kg` : '—'}</span><span>{data?.results.filter(result => result.testSessionId === session.id).length ?? 0}</span><span>{session.notes || '—'}</span><button className="test-delete-button" disabled={state === 'saving'} onClick={() => setDeleteTarget(session)}><Trash2 size={14} /> Elimina</button></div>)}</div></Panel>}
    {deleteTarget && <ConfirmDialog title={`Eliminare il test del ${new Intl.DateTimeFormat('it-IT', { dateStyle: 'long' }).format(new Date(`${deleteTarget.testedAt}T12:00:00`))}?`} text={`Verranno eliminati definitivamente la rilevazione e le sue ${data?.results.filter(result => result.testSessionId === deleteTarget.id).length ?? 0} misure. Gli altri test, gli atleti e gli allenamenti non saranno modificati.`} confirmLabel="Elimina test" busy={state === 'saving'} onCancel={() => setDeleteTarget(null)} onConfirm={() => void removeTest()} />}
  </div>
}

function AccountSecurityScreen({ profile }: { profile: AppProfile }) {
  const { user, setPassword } = useAuth()
  const [password, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState('')
  const [coachEmail, setCoachEmail] = useState('')
  const [linkMessage, setLinkMessage] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validatePassword(password, confirmation)
    if (validationError) { setError(validationError); return }
    setState('saving'); setError('')
    try {
      await setPassword(password)
      setNewPassword(''); setConfirmation(''); setState('saved')
    } catch (reason) {
      setError(friendlyAuthError(reason instanceof Error ? reason.message : 'Password non aggiornata.'))
      setState('idle')
    }
  }

  const submitCoachLink = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setLinkMessage(''); setState('saving')
    try { const result = await requestCoachLink(profile, coachEmail); setLinkMessage(result === 'active' ? 'Sei già collegato a questo coach.' : 'Richiesta inviata. Il collegamento sarà attivo dopo l’accettazione del coach.'); setCoachEmail('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Richiesta non inviata.') } finally { setState('idle') }
  }

  return <div className="screen account-screen">
    <ScreenHeader eyebrow="ACCOUNT / SICUREZZA" title="Accedi da ogni dispositivo." text="La tua email è il nome utente. Crea una password personale: l’account e tutti i dati già presenti restano gli stessi." action={<Tag tone="success">Account protetto</Tag>} />
    <div className="grid grid--2-1">
      <Panel title="Imposta password" index="01">
        <form className="account-password-form" onSubmit={submit}>
          <label><span>Nome utente</span><div className="account-identity"><Mail size={17} /><b>{user?.email || 'Account demo'}</b></div></label>
          <label><span>Nuova password</span><div className="auth-input"><KeyRound size={17} /><input type="password" autoComplete="new-password" value={password} onChange={event => setNewPassword(event.target.value)} placeholder="Almeno 8 caratteri" required /></div></label>
          <label><span>Ripeti password</span><div className="auth-input"><KeyRound size={17} /><input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="Ripeti la password" required /></div></label>
          {error && <p className="form-error form-error--box" role="alert">{error}</p>}
          <button className="button button--signal button--wide" disabled={state === 'saving'}><ShieldCheck size={17} /> {state === 'saving' ? 'Salvataggio…' : 'Salva password'}</button>
        </form>
        {state === 'saved' && <div className="completion-banner"><Check size={19} /><div><b>Password attiva</b><span>Ora puoi accedere da telefono, tablet o altro computer usando email e password.</span></div></div>}
      </Panel>
      <Panel title="Come funziona" index="02">
        <ol className="account-steps"><li><b>01</b><span>Imposta qui la password una sola volta.</span></li><li><b>02</b><span>Esci dall’app quando vuoi cambiare account.</span></li><li><b>03</b><span>Su ogni dispositivo usa la stessa email e la password scelta.</span></li></ol>
        <div className="safety-note"><ShieldCheck size={20} /><div><b>Nessuna migrazione account</b><p>Non viene creato un nuovo utente: cambiamo soltanto il metodo di accesso allo stesso profilo Supabase.</p></div></div>
      </Panel>
      {profile.capabilities.canAccessAthleteArea && <Panel title="Collegati a un coach" index="03"><form className="account-password-form" onSubmit={submitCoachLink}><label><span>Email del coach</span><div className="auth-input"><Mail size={17} /><input type="email" value={coachEmail} onChange={event => setCoachEmail(event.target.value)} placeholder="coach@email.it" required /></div></label><p>Il coach dovrà accettare la richiesta prima di vedere e gestire i tuoi dati.</p><button className="button button--secondary button--wide" disabled={state === 'saving'}>Invia richiesta</button></form>{linkMessage && <div className="completion-banner"><Check size={19} /><div><b>Richiesta registrata</b><span>{linkMessage}</span></div></div>}</Panel>}
    </div>
  </div>
}

type ScreenProps = {
  goTo: (view: ViewId) => void
  goToAthlete: (view: 'builder' | 'test', athleteId: string) => void
  openAthlete: (athleteId: string) => void
  openSession: (sessionId: string) => void
  profile: AppProfile
  selectedAthleteId: string
  setSelectedAthleteId: (athleteId: string) => void
  selectedSessionId: string
}

const viewMeta: Record<ViewId, { label: string; component: (props: ScreenProps) => ReactNode }> = {
  system: { label: 'Sistema UI', component: () => <SystemScreen /> },
  home: { label: 'Home atleta', component: ({ openSession, profile }) => <HomeScreen openSession={openSession} profile={profile} /> },
  session: { label: 'Sessione', component: ({ profile, selectedSessionId }) => <SessionScreen profile={profile} sessionId={selectedSessionId} /> },
  dashboard: { label: 'Coach dashboard', component: ({ profile, goTo, openAthlete }) => <DashboardScreen profile={profile} goTo={goTo} openAthlete={openAthlete} /> },
  athletes: { label: 'Atleti e inviti', component: ({ profile, goTo, selectedAthleteId, setSelectedAthleteId, goToAthlete }) => <AthleteManagementScreen profile={profile} goTo={goTo} selectedAthleteId={selectedAthleteId} setSelectedAthleteId={setSelectedAthleteId} goToAthlete={goToAthlete} /> },
  builder: { label: 'Program builder', component: ({ profile, selectedAthleteId }) => <BuilderScreen profile={profile} selectedAthleteId={selectedAthleteId} /> },
  library: { label: 'Libreria esercizi', component: ({ profile }) => <LibraryScreen profile={profile} /> },
  test: { label: 'Test / retest', component: ({ profile, selectedAthleteId }) => <TestScreen profile={profile} selectedAthleteId={selectedAthleteId} /> },
  migration: { label: 'Migrazione', component: () => <MigrationScreen /> },
  account: { label: 'Account e sicurezza', component: ({ profile }) => <AccountSecurityScreen profile={profile} /> },
}

export default function App({ profile, onSignOut, initialMode }: { profile: AppProfile; onSignOut: () => Promise<void>; initialMode: AppRole }) {
  const routeNavigate = useNavigate()
  const modes = availableModes(profile.capabilities)
  const [mode, setMode] = useState<AppRole>(() => {
    return modes.includes(initialMode) ? initialMode : defaultMode(profile.capabilities)
  })
  const activeProfile = useMemo(() => ({ ...profile, role: mode }), [mode, profile])
  const roleNavItems = navItems.filter(item => item.roles.includes(mode))
  const initialView: ViewId = mode === 'coach' ? 'dashboard' : 'home'
  const viewStorageKey = `cc-v2:view:${profile.userId}`
  const athleteStorageKey = `cc-v2:athlete:${profile.userId}`
  const sessionStorageKey = `cc-v2:session:${profile.userId}`
  const [view, setView] = useState<ViewId>(() => {
    try {
      const saved = window.localStorage.getItem(viewStorageKey) as ViewId | null
      return saved && navItems.some(item => item.id === saved && item.roles.includes(mode)) ? saved : initialView
    } catch { return initialView }
  })
  const [selectedAthleteId, setSelectedAthleteId] = useState(() => {
    try { return window.localStorage.getItem(athleteStorageKey) ?? '' } catch { return '' }
  })
  const [selectedSessionId, setSelectedSessionId] = useState(() => {
    try { return window.localStorage.getItem(sessionStorageKey) ?? '' } catch { return '' }
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const syncLock = useRef(false)
  const Screen = viewMeta[view].component
  const groups = [...new Set(roleNavItems.map(item => item.group))]
  const initials = profile.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'CC'

  const changeMode = (next: AppRole) => {
    if (!modes.includes(next)) return
    setMode(next); setView(next === 'coach' ? 'dashboard' : 'home'); setMenuOpen(false)
    routeNavigate(`/app/${next}`)
    try { window.localStorage.setItem(`cc-mode:${profile.userId}`, next) } catch { /* Storage può essere disabilitato. */ }
  }

  useEffect(() => {
    if (!modes.includes(initialMode) || initialMode === mode) return
    setMode(initialMode)
    setView(initialMode === 'coach' ? 'dashboard' : 'home')
  }, [initialMode, mode, modes])

  useEffect(() => {
    try { window.localStorage.setItem(viewStorageKey, view) } catch { /* Storage può essere disabilitato dal browser. */ }
  }, [view, viewStorageKey])

  useEffect(() => {
    try {
      if (selectedAthleteId) window.localStorage.setItem(athleteStorageKey, selectedAthleteId)
      else window.localStorage.removeItem(athleteStorageKey)
    } catch { /* Storage può essere disabilitato dal browser. */ }
  }, [athleteStorageKey, selectedAthleteId])

  useEffect(() => {
    try {
      if (selectedSessionId) window.localStorage.setItem(sessionStorageKey, selectedSessionId)
      else window.localStorage.removeItem(sessionStorageKey)
    } catch { /* Storage può essere disabilitato dal browser. */ }
  }, [sessionStorageKey, selectedSessionId])

  useEffect(() => {
    const refreshPendingCount = () => {
      countPendingOperations(profile.userId).then(setPendingCount).catch(() => setPendingCount(0))
    }
    refreshPendingCount()
    window.addEventListener(OUTBOX_CHANGED_EVENT, refreshPendingCount)
    window.addEventListener('online', refreshPendingCount)
    return () => {
      window.removeEventListener(OUTBOX_CHANGED_EVENT, refreshPendingCount)
      window.removeEventListener('online', refreshPendingCount)
    }
  }, [profile.userId])

  const synchronizePending = async () => {
    if (!dataRuntime.isConfigured || profile.userId.startsWith('00000000-') || syncLock.current) return
    syncLock.current = true
    setSyncing(true)
    try {
      const result = await flushExerciseOutbox(profile.userId, payload => syncQueuedExercise(profile, payload))
      setPendingCount(result.remaining)
    } catch {
      setPendingCount(await countPendingOperations(profile.userId).catch(() => 0))
    } finally {
      syncLock.current = false
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (navigator.onLine) void synchronizePending()
    const handleOnline = () => void synchronizePending()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [profile.userId])

  useEffect(() => {
    const context = document.modelContext
    if (!context?.registerTool) return
    const lifecycle = new AbortController()
    const registration = context.registerTool({
      name: 'start_training_session',
      title: 'Avvia sessione di allenamento',
      description: 'Apre il runner della sessione assegnata e lo rende visibile nell’app.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Object.keys(input).length > 0) {
          throw new Error('Questo comando non accetta parametri.')
        }
        setView('session')
        setMenuOpen(false)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return { view: 'session', status: 'ready' }
      },
    }, { signal: lifecycle.signal })
    void Promise.resolve(registration).catch(() => undefined)
    return () => lifecycle.abort()
  }, [])

  const navigate = (next: ViewId) => {
    if (!navItems.some(item => item.id === next && item.roles.includes(mode))) return
    if (next === 'athletes') setSelectedAthleteId('')
    setView(next)
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openSession = (sessionId: string) => {
    setSelectedSessionId(sessionId)
    setView('session')
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openAthlete = (athleteId: string) => {
    setSelectedAthleteId(athleteId)
    setView('athletes')
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goToAthlete = (next: 'builder' | 'test', athleteId: string) => {
    setSelectedAthleteId(athleteId)
    setView(next)
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div className="brand"><div className="brand__mark"><Mountain size={22} /></div><div><b>CLIMBING<br />COACH</b><span>TRAINING SYSTEM</span></div></div>
        <nav aria-label="Navigazione prototipo">
          {groups.map(group => <div className="nav-group" key={group}><small>{group}</small>{roleNavItems.filter(item => item.group === group).map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={17} /><span>{item.label}</span><i>{item.id === 'migration' ? '!' : ''}</i></button> })}</div>)}
        </nav>
        <div className="sidebar__foot"><div><span className={`status-dot ${pendingCount ? 'status-dot--sync' : 'status-dot--ok'}`} /><b>{profile.workspaceName}</b></div><small>{dataRuntime.isConfigured ? 'Supabase collegato' : 'Demo locale'} · {pendingCount ? `${pendingCount} modifiche in coda` : 'coda vuota'}</small></div>
      </aside>
      <div className="app-main">
        <div className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Apri navigazione"><Menu size={20} /></button>
          <div className="topbar__crumb"><span>CC</span><i>/</i><b>{viewMeta[view].label}</b></div>
          <div className="topbar__tools">{modes.length > 1 ? <div className="mode-switch" aria-label="Modalità"><button className={mode === 'coach' ? 'active' : ''} onClick={() => changeMode('coach')}>Coach</button><button className={mode === 'athlete' ? 'active' : ''} onClick={() => changeMode('athlete')}>Atleta</button></div> : <span className="role-chip">{mode === 'coach' ? 'Coach' : 'Atleta'}</span>}<button className="sync-chip" onClick={() => void synchronizePending()} disabled={syncing || pendingCount === 0} title="Sincronizza la coda offline"><span className={`status-dot ${pendingCount ? 'status-dot--sync' : 'status-dot--ok'}`} />{syncing ? 'Sincronizzo…' : pendingCount ? `${pendingCount} in coda` : 'Cloud allineato'}</button><button className="icon-button" aria-label="Ricerca"><Search size={17} /></button><button className="icon-button" aria-label="Account e sicurezza" onClick={() => navigate('account')}><Settings2 size={17} /></button><button className="profile-button" onClick={() => void onSignOut()} title="Esci"><span>{initials}</span><LogOut size={14} /></button></div>
        </div>
        <main><Screen goTo={navigate} goToAthlete={goToAthlete} openAthlete={openAthlete} openSession={openSession} profile={activeProfile} selectedAthleteId={selectedAthleteId} setSelectedAthleteId={setSelectedAthleteId} selectedSessionId={selectedSessionId} /></main>
        <nav className="bottom-nav" aria-label="Navigazione mobile">
          {roleNavItems.filter(item => mode === 'coach' ? ['dashboard', 'athletes', 'builder', 'test'].includes(item.id) : ['home', 'session', 'test'].includes(item.id)).slice(0, 4).map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.shortLabel}</span></button> })}
        </nav>
      </div>
      {menuOpen && <button className="scrim" aria-label="Chiudi navigazione" onClick={() => setMenuOpen(false)} />}
    </div>
  )
}
