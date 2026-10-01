import { useEffect, useState, type ComponentType } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, Layers3, TestTubeDiagonal, Users } from 'lucide-react'
import type { AppProfile } from '../onboarding/types'
import type { CoachDashboardData } from './coachDashboard'
import { loadCoachDashboard } from './coachDashboardRepository'

const climbingImage = 'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=2000&q=90'
const mountainImage = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=90'

export function DashboardScreen({
  profile,
  openPrograms,
  openFeedback,
  openProgress,
}: {
  profile: AppProfile
  openPrograms: () => void
  openFeedback: () => void
  openProgress: () => void
}) {
  const [data, setData] = useState<CoachDashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setError('')
    loadCoachDashboard(profile).then(value => { if (active) setData(value) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Dashboard non disponibile.') })
    return () => { active = false }
  }, [profile])

  if (error) return <div className="coach-dashboard coach-dashboard--state"><b>Dati coach non disponibili.</b><p>{error}</p><button onClick={() => window.location.reload()}>Riprova</button></div>
  if (!data) return <div className="coach-dashboard coach-dashboard--state"><b>Caricamento dashboard</b><p>Aggiornamento dati in corso.</p><div className="skeleton-stack"><span /><span /><span /></div></div>

  const firstName = profile.displayName.trim().split(/\s+/)[0] || 'Coach'
  const metrics: Array<{ label: string; value: number; icon: ComponentType<{ size?: number; className?: string }> }> = [
    { label: 'ATLETI ATTIVI', value: data.activeAthletes, icon: Users },
    { label: 'PROGRAMMI ATTIVI', value: data.activePrograms, icon: Layers3 },
    { label: 'SESSIONI COMPLETATE', value: data.completedSessions, icon: CheckCircle2 },
    { label: 'TEST COMPLETATI', value: data.completedTests, icon: TestTubeDiagonal },
  ]

  return <div className="coach-dashboard">
    <section className="coach-dashboard__title">
      <div><h1>CIAO {firstName.toUpperCase()}<i /></h1><p>PICCOLI PASSI. GRANDI PARETI.</p></div>
      <div className="coach-dashboard__today"><button onClick={openFeedback}><AlertTriangle size={17} /><span>{data.needsReview} DA RIVEDERE</span></button><time>{formatToday()}</time></div>
    </section>

    <section className="coach-dashboard__hero">
      <img src={climbingImage} alt="" />
      <div className="coach-dashboard__hero-shade" />
      <i className="coach-dashboard__hero-edge" />
      <div className="coach-dashboard__focus"><small>// FOCUS</small><h2>CONTINUITÀ</h2><i /><p>{data.activeAthletes} ATLETI ATTIVI · {data.activePrograms} PROGRAMMI ATTIVI</p></div>
      <div className="coach-dashboard__dots"><i /><i /><i /></div>
      <button aria-label="Apri programmi" onClick={openPrograms}><ChevronRight size={25} /></button>
    </section>

    <section className="coach-dashboard__metrics">
      {metrics.map((metric, index) => <DashboardMetric key={metric.label} index={String(index + 1).padStart(2, '0')} {...metric} />)}
    </section>

    <section className="coach-dashboard__lower">
      <NextSessionCard session={data.nextSession} onOpen={openPrograms} />
      <button className="coach-dashboard__review" onClick={openFeedback}>
        <i className="coach-dashboard__card-edge" />
        <span className="coach-dashboard__card-head"><b>06 / DA RIVEDERE</b><AlertTriangle size={19} /></span>
        <span className="coach-dashboard__review-value"><strong>{String(data.needsReview).padStart(2, '0')}</strong><b>SESSIONI</b></span>
        <p>Sessioni con segnali che richiedono una revisione del coach.</p>
        <span className="coach-dashboard__card-link">APRI FEEDBACK <ChevronRight size={16} /></span>
      </button>
      <article className="coach-dashboard__progress">
        <img src={mountainImage} alt="" /><div className="coach-dashboard__progress-shade" /><i className="coach-dashboard__card-edge" />
        <div><span className="coach-dashboard__card-head"><b>07 / TEST &amp; PROGRESSI</b><TestTubeDiagonal size={19} /></span><strong>{String(data.completedTests).padStart(2, '0')}</strong><b>test completati</b><p>Apri Progressi per consultare test, retest e andamento longitudinale dell’atleta.</p><button onClick={openProgress}>APRI PROGRESSI <ChevronRight size={16} /></button></div>
      </article>
    </section>
  </div>
}

function DashboardMetric({ index, label, value, icon: Icon }: { index: string; label: string; value: number; icon: ComponentType<{ size?: number; className?: string }> }) {
  return <article className="coach-dashboard__metric"><div><p><span>{index}</span> / {label}</p><Icon size={20} /></div><strong>{value}</strong></article>
}

function NextSessionCard({ session, onOpen }: { session: CoachDashboardData['nextSession']; onOpen: () => void }) {
  if (!session) return <article className="coach-dashboard__next coach-dashboard__next--empty"><i className="coach-dashboard__card-edge" /><span className="coach-dashboard__card-head"><b>05 / PROSSIMA SESSIONE</b><CalendarDays size={19} /></span><p>Nessuna sessione programmata.</p></article>
  const date = session.date ? new Date(`${session.date}T12:00:00`) : null
  return <article className="coach-dashboard__next">
    <i className="coach-dashboard__card-edge" /><span className="coach-dashboard__card-head"><b>05 / PROSSIMA SESSIONE</b><CalendarDays size={19} /></span>
    <div className="coach-dashboard__next-body">
      <div className="coach-dashboard__date"><small>{date ? weekdayShort(date) : '—'}</small><strong>{date ? String(date.getDate()).padStart(2, '0') : '—'}</strong><small>{date ? monthShort(date) : 'DATA'}</small></div>
      <div><small>{session.athleteName}</small><h3>{session.title}</h3><p>Settimana {session.weekNumber} · Sessione {session.sessionOrder}</p></div>
    </div>
    <button aria-label="Apri programmi" onClick={onOpen}><ChevronRight size={21} /></button>
  </article>
}

function weekdayShort(date: Date) { return new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(date).replace('.', '').toUpperCase() }
function monthShort(date: Date) { return new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(date).replace('.', '').toUpperCase() }
function formatToday() { return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()).replace('.', '').toUpperCase() }
