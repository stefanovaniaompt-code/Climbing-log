import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, ClipboardCheck, Play, TriangleAlert } from 'lucide-react'
import { AthleteAbstractVisual } from '../athlete/AthleteAbstractVisual'
import type { AppProfile } from '../onboarding/types'
import { selectCurrentWeek, summarizeWeek } from './athleteHome'
import { loadAthleteHome } from './athleteHomeRepository'
import { blockForWeek, buildAthleteWeekBlocks, statusLabel } from './athleteHomeNavigation'

type AthleteHomeScreenProps = {
  openSession: (sessionId: string) => void
  profile: AppProfile
}

export function AthleteHomeScreen({ openSession, profile }: AthleteHomeScreenProps) {
  const programStorageKey = `cc-v2:program:${profile.userId}`
  const weekStorageKey = `cc-v2:week:${profile.userId}`
  const [selectedProgramId, setSelectedProgramId] = useState(() => readStoredValue(programStorageKey))
  const [selectedWeekId, setSelectedWeekId] = useState(() => readStoredValue(weekStorageKey))
  const [home, setHome] = useState<Awaited<ReturnType<typeof loadAthleteHome>> | undefined>()
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setHome(undefined)
    setError('')
    loadAthleteHome(profile, selectedWeekId || null, selectedProgramId || null)
      .then(value => {
        if (!active) return
        setHome(value)
        if (value && value.program.id !== selectedProgramId) setSelectedProgramId(value.program.id)
        if (value && selectedWeekId && value.week.id !== selectedWeekId) setSelectedWeekId(value.week.id)
      })
      .catch(reason => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Programma non disponibile.')
      })
    return () => { active = false }
  }, [profile, reloadKey, selectedProgramId, selectedWeekId])

  useEffect(() => storeValue(programStorageKey, selectedProgramId), [programStorageKey, selectedProgramId])
  useEffect(() => storeValue(weekStorageKey, selectedWeekId), [selectedWeekId, weekStorageKey])

  const firstName = profile.displayName.split(' ')[0]

  if (error) return <AthleteHomeState title={`Ciao, ${firstName}.`} message={error} error onRetry={() => setReloadKey(value => value + 1)} />
  if (home === undefined) return <AthleteHomeState title="Caricamento programma" message="Aggiornamento in corso." loading />
  if (!home) return <AthleteHomeState title="Nessun programma attivo" message="Le nuove settimane compariranno qui dopo la pubblicazione del coach." />

  const summary = summarizeWeek(home.sessions)
  const progress = summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0
  const nextSession = summary.nextSession
  const currentWeek = selectCurrentWeek(home.weeks)
  const weekIndex = home.weeks.findIndex(week => week.id === home.week.id)
  const previousWeek = weekIndex > 0 ? home.weeks[weekIndex - 1] : null
  const followingWeek = weekIndex >= 0 && weekIndex < home.weeks.length - 1 ? home.weeks[weekIndex + 1] : null
  const blocks = buildAthleteWeekBlocks(home.weeks)
  const currentBlock = blockForWeek(blocks, home.week.id)
  const blockWeeks = currentBlock?.weeks ?? [home.week]
  const isCurrentWeek = currentWeek?.id === home.week.id
  const programProgress = home.weeks.length > 0 ? Math.round(((weekIndex + 1) / home.weeks.length) * 100) : 0

  const selectBlock = (blockKey: string) => {
    const block = blocks.find(item => item.key === blockKey)
    if (!block) return
    const currentInsideBlock = currentWeek && block.weeks.some(week => week.id === currentWeek.id) ? currentWeek : null
    setSelectedWeekId(currentInsideBlock?.id ?? block.weeks[0]?.id ?? '')
  }

  return (
    <div className="athlete-home">
      <section className="athlete-home__hero">
        <div className="athlete-home__hero-copy"><p>CIAO {firstName.toUpperCase()}</p><h1>Oggi<br />si scala.<br /><span>duro.</span></h1></div>
        <div className="athlete-home__mountains"><AthleteAbstractVisual fill /></div>
      </section>

      <section className="athlete-card athlete-home__week-card">
        <div className="athlete-home__week-head"><div><small>IL TUO PROGRAMMA · SETTIMANA {home.week.weekNumber}</small><h2>{home.program.name}</h2></div>{(home.week.phase || home.week.blockName) && <span>{home.week.phase || home.week.blockName}</span>}</div>
        <div className="athlete-home__sessions">
          {home.sessions.length === 0 ? <div className="athlete-home__empty"><ClipboardCheck size={20} /><span>Nessuna sessione in questa settimana.</span></div> : home.sessions.map(session => {
            const disabled = session.status === 'skipped'
            return <button key={session.id} disabled={disabled} onClick={() => openSession(session.id)}>
              <strong>{String(session.order).padStart(2, '0')}</strong>
              <span><b>{session.title}</b><small>{session.objective || `${session.exerciseCount} esercizi${session.durationMinutes ? ` · ${session.durationMinutes} min` : ''}`}</small></span>
              <i className={session.status === 'completed' ? 'is-complete' : session.status === 'in_progress' ? 'is-progress' : ''} aria-label={statusLabel(session.status)} />
              {!disabled && <ArrowRight size={16} />}
            </button>
          })}
        </div>
        <div className="athlete-home__week-progress"><div><span>{summary.completed} completate · {summary.total - summary.completed} da fare</span><b>{progress}%</b></div><i><span style={{ width: `${progress}%` }} /></i></div>
      </section>

      {nextSession && <button className="athlete-home__next" onClick={() => openSession(nextSession.id)}><span><small>{nextSession.status === 'in_progress' ? 'SESSIONE IN CORSO' : 'PROSSIMA SESSIONE'}</small><b>{nextSession.title}</b><em>{nextSession.exerciseCount} esercizi{nextSession.durationMinutes ? ` · ${nextSession.durationMinutes} min` : ''}</em></span><i><Play size={18} fill="currentColor" /></i></button>}

      <section className="athlete-card athlete-home__path">
        <div className="athlete-home__path-head"><div><small>IL TUO PERCORSO</small><h2>{home.week.blockName || home.week.phase || home.program.name}</h2></div><strong>{weekIndex + 1}<span>/{home.weeks.length}</span></strong></div>
        <div className="athlete-home__selectors">
          {home.programs.length > 1 && <label><span>Programma</span><select value={home.program.id} onChange={event => { setSelectedProgramId(event.target.value); setSelectedWeekId('') }}>{home.programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>}
          {blocks.length > 1 && <label><span>Blocco</span><select value={currentBlock?.key ?? ''} onChange={event => selectBlock(event.target.value)}>{blocks.map(block => <option key={block.key} value={block.key}>{block.label}</option>)}</select></label>}
          {blockWeeks.length > 1 && <label><span>Settimana</span><select value={home.week.id} onChange={event => setSelectedWeekId(event.target.value)}>{blockWeeks.map(week => <option key={week.id} value={week.id}>Settimana {week.weekNumber}{week.status === 'current' ? ' · corrente' : ''}</option>)}</select></label>}
        </div>
        <div className="athlete-home__path-progress"><i><span style={{ width: `${programProgress}%` }} /></i><small>{programProgress}% del programma</small></div>
        <div className="athlete-home__week-nav"><button disabled={!previousWeek} onClick={() => previousWeek && setSelectedWeekId(previousWeek.id)}><ArrowLeft size={16} /> Precedente</button>{!isCurrentWeek && currentWeek && <button onClick={() => setSelectedWeekId(currentWeek.id)}>Settimana corrente</button>}<button disabled={!followingWeek} onClick={() => followingWeek && setSelectedWeekId(followingWeek.id)}>Successiva <ArrowRight size={16} /></button></div>
      </section>
    </div>
  )
}

function AthleteHomeState({ title, message, error, loading, onRetry }: { title: string; message: string; error?: boolean; loading?: boolean; onRetry?: () => void }) {
  return <div className="athlete-home athlete-home--state"><section className="athlete-home__hero"><div className="athlete-home__hero-copy"><p>CLIMBING COACH</p><h1>{title}</h1></div><div className="athlete-home__mountains"><AthleteAbstractVisual compact /></div></section><div className="athlete-card athlete-home__state">{error ? <TriangleAlert size={24} /> : <ClipboardCheck size={24} />}<p>{message}</p>{loading && <div className="athlete-home__skeleton"><i /><i /><i /></div>}{onRetry && <button onClick={onRetry}>Riprova</button>}</div></div>
}

function readStoredValue(key: string) { try { return window.localStorage.getItem(key) ?? '' } catch { return '' } }
function storeValue(key: string, value: string) { try { if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key) } catch { /* Storage può essere disabilitato. */ } }
