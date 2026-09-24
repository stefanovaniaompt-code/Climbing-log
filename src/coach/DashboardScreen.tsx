import { useEffect, useState } from 'react'
import { ArrowRight, Check, ClipboardCheck, Search, TrendingUp, TriangleAlert, Users } from 'lucide-react'
import type { AppProfile } from '../onboarding/types'
import { Bars, Metric, Panel, ScreenHeader, Tag } from '../shared/ui'
import type { CoachDashboardData } from './coachDashboard'
import { loadCoachDashboard } from './coachDashboardRepository'

export function DashboardScreen({ profile, openAthletes, openAthlete }: { profile: AppProfile; openAthletes: () => void; openAthlete: (athleteId: string) => void }) {
  const [data, setData] = useState<CoachDashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setError('')
    loadCoachDashboard(profile).then(value => { if (active) setData(value) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Dashboard non disponibile.') })
    return () => { active = false }
  }, [profile])

  if (error) return <div className="screen"><ScreenHeader eyebrow="COACH / PORTAFOGLIO" title="Dati coach non disponibili." text={error} action={<button className="button button--secondary" onClick={() => window.location.reload()}>Riprova</button>} /></div>
  if (!data) return <div className="screen"><ScreenHeader eyebrow="COACH / DASHBOARD" title="Caricamento dashboard" text="Aggiornamento dati in corso." /><Panel title="Caricamento" index="01"><div className="skeleton-stack"><span /><span /><span /></div></Panel></div>

  const totalRelationships = data.relationshipDistribution.active + data.relationshipDistribution.inactive + data.relationshipDistribution.pending
  const activeShare = totalRelationships ? Math.round(data.relationshipDistribution.active / totalRelationships * 100) : 0
  return <div className="screen">
    <ScreenHeader eyebrow="COACH / DASHBOARD" title={`${data.activeAthletes} ${data.activeAthletes === 1 ? 'atleta attivo' : 'atleti attivi'}, ${data.needsReview} da rivedere`} text="Programmi, sessioni e test aggiornati." action={<div className="header-actions"><Tag tone={data.source === 'legacy-v1' ? 'success' : 'neutral'}>{data.source === 'legacy-v1' ? 'ONLINE' : 'DEMO'}</Tag><button className="button button--primary" onClick={openAthletes}><Users size={16} /> Gestisci atleti</button></div>} />
    <div className="coach-summary"><Metric label="Atleti attivi" value={String(data.activeAthletes).padStart(2, '0')} /><Metric label="Aderenza media" value={data.averageAdherence === null ? '—' : String(data.averageAdherence)} unit={data.averageAdherence === null ? undefined : '%'} /><Metric label="Da rivedere" value={String(data.needsReview).padStart(2, '0')} signal={data.needsReview > 0} /></div>
    <div className="grid grid--2-1">
      <Panel title="Atleti" index="01" action={<button className="icon-button" onClick={openAthletes} aria-label="Gestisci atleti"><Search size={17} /></button>}><div className="athlete-list">{data.athletes.length === 0 && <div className="empty-state"><Users size={22} /><b>Nessun atleta collegato</b><span>Crea il primo invito dalla gestione atleti.</span></div>}{data.athletes.map(athlete => <button className="athlete" key={athlete.id} onClick={() => openAthlete(athlete.id)}><span className="avatar">{athlete.initials}</span><span className="athlete__copy"><b>{athlete.name}</b><small>{athlete.programLabel}</small></span><span className="athlete__score"><b>{athlete.adherence ?? '—'}</b><small>{athlete.adherence === null ? 'N/D' : '%'}</small></span><Tag tone={athlete.relationshipStatus !== 'active' || athlete.needsAttention ? 'warning' : 'success'}>{athlete.relationshipStatus !== 'active' ? athlete.relationshipStatus : athlete.needsAttention ? 'Controlla' : 'In linea'}</Tag><ArrowRight size={16} /></button>)}</div></Panel>
      <Panel title="Attenzione" index="02">{data.alerts.length === 0 && <div className="empty-state empty-state--compact"><Check size={20} /><b>Nessuna eccezione aperta</b><span>Il portafoglio è allineato.</span></div>}{data.alerts.map(alert => <div className={`alert-card ${alert.tone === 'neutral' ? 'alert-card--neutral' : ''}`} key={alert.id}>{alert.tone === 'warning' ? <TriangleAlert size={20} /> : <ClipboardCheck size={20} />}<div><b>{alert.title}</b><p>{alert.detail}</p><button onClick={() => openAthlete(alert.athleteId)}>Apri atleta</button></div></div>)}</Panel>
    </div>
    <div className="grid grid--2"><Panel title="Aderenza / ultime settimane" index="03">{data.adherenceTrend.length ? <Bars values={data.adherenceTrend} accentAt={data.adherenceTrend.length - 1} /> : <div className="empty-state empty-state--compact"><TrendingUp size={20} /><b>Trend in costruzione</b><span>Comparirà dopo le prime settimane pianificate.</span></div>}<div className="chart-legend"><span><i className="purple" /> Completato</span><span><i className="mustard" /> Settimana corrente</span></div></Panel><Panel title="Relazioni atleti" index="04"><div className="distribution"><div className="donut" style={{ background: `conic-gradient(var(--purple-700) 0 ${activeShare}%, var(--mustard-500) ${activeShare}% 100%)` }}><span>{activeShare}<small>%</small></span></div><ul><li><i className="purple" /> Attivi <b>{data.relationshipDistribution.active}</b></li><li><i className="mustard" /> Inattivi <b>{data.relationshipDistribution.inactive}</b></li><li><i className="pale" /> In attesa <b>{data.relationshipDistribution.pending}</b></li></ul></div></Panel></div>
  </div>
}
