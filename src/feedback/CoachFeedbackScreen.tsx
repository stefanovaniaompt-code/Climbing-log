import { useEffect, useMemo, useState } from 'react'
import { Activity, MessageCircle } from 'lucide-react'
import type { AppProfile } from '../onboarding/types'
import type { ProgramType } from '../programs/programType'
import { Panel, ScreenHeader, Tag } from '../shared/ui'
import { MessageThread } from '../messaging/MessageThread'
import { painExerciseFrequency, summarizeFeedback, type FeedbackEntry } from './coachFeedback'
import { loadCoachFeedback } from './coachFeedbackRepository'

const yesNo = (value: boolean) => value ? 'Sì' : 'No'
const date = (value: string) => new Date(value).toLocaleString('it-IT')

export function CoachFeedbackScreen({ profile }: { profile: AppProfile }) {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]); const [tab, setTab] = useState<ProgramType>('athlete'); const [selectedId, setSelectedId] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)
  useEffect(() => { let active = true; setLoading(true); loadCoachFeedback(profile).then(value => { if (active) setEntries(value) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Feedback non disponibili.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [profile])
  const summaries = useMemo(() => summarizeFeedback(entries, tab), [entries, tab])
  useEffect(() => { if (!summaries.some(item => item.athleteId === selectedId)) setSelectedId('') }, [summaries, selectedId])
  const selected = summaries.find(item => item.athleteId === selectedId)
  const history = entries.filter(entry => entry.programType === tab && entry.athleteId === selectedId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  const frequentExercises = painExerciseFrequency(history)
  return <div className="screen"><ScreenHeader eyebrow="COACH / FEEDBACK" title="Feedback" text="Riepiloghi deterministici degli ultimi 30 giorni e storico completo." />
    <div className="feedback-tabs" role="tablist"><button className={tab === 'athlete' ? 'active' : ''} onClick={() => { setTab('athlete'); setSelectedId('') }}>Atleti</button><button className={tab === 'patient' ? 'active' : ''} onClick={() => { setTab('patient'); setSelectedId('') }}>Pazienti</button></div>
    {loading && <div className="skeleton-stack"><span /><span /><span /></div>}{error && <p className="form-error form-error--box">{error}</p>}
    {!loading && !summaries.length && <div className="empty-state"><Activity size={22} /><b>Nessun feedback {tab === 'athlete' ? 'atleta' : 'paziente'}</b><span>I dati appariranno dopo il primo invio.</span></div>}
    <div className="feedback-card-grid">{summaries.map(summary => <button className={`feedback-card ${selectedId === summary.athleteId ? 'active' : ''}`} key={summary.athleteId} onClick={() => setSelectedId(summary.athleteId)}><div><b>{summary.name}</b><small>Ultimo feedback: {date(summary.latestFeedbackAt)}</small></div>{tab === 'athlete' ? <dl><div><dt>Feedback</dt><dd>{summary.feedbackCount}</dd></div><div><dt>Completate</dt><dd>{summary.completedCount}</dd></div><div><dt>Non completate</dt><dd>{summary.notCompletedCount}</dd></div><div><dt>RPE medio</dt><dd>{summary.averageRpe ?? '—'}</dd></div><div><dt>Dolore</dt><dd>{summary.painCount}</dd></div></dl> : <dl><div><dt>Feedback</dt><dd>{summary.feedbackCount}</dd></div><div><dt>Con dolore</dt><dd>{summary.painCount}</dd></div><div><dt>Senza dolore</dt><dd>{summary.noPainCount}</dd></div><div><dt>Ultima VAS</dt><dd>{summary.latestVas ?? '—'}</dd></div><div><dt>VAS media / max</dt><dd>{summary.averageVas ?? '—'} / {summary.maxVas ?? '—'}</dd></div><div><dt>Dolore persistente</dt><dd>{summary.persistentPainCount}</dd></div><div><dt>Non terminate</dt><dd>{summary.notCompletedCount}</dd></div></dl>}</button>)}</div>
    {selected && <div className="feedback-person-detail"><Panel title="Feedback" index="01" action={<Tag tone={tab === 'patient' ? 'warning' : 'success'}>{tab === 'patient' ? 'PAZIENTE' : 'ATLETA'}</Tag>}>
      {tab === 'athlete' && selected.latestNotes && <div className="feedback-latest-note"><b>Note ultimo feedback</b><p>{selected.latestNotes}</p></div>}
      {tab === 'patient' && frequentExercises.length > 0 && <div className="feedback-frequency"><b>Esercizi più associati al dolore</b>{frequentExercises.map(item => <span key={item.name}>{item.name} · {item.count}</span>)}</div>}
      <div className="feedback-history">{history.map(entry => <article key={entry.id}><header><div><b>{entry.sessionTitle}</b><small>{date(entry.submittedAt)}</small></div><Tag tone={entry.completionOutcome === 'completed' ? 'success' : 'warning'}>{entry.completionOutcome === 'completed' ? 'COMPLETATA' : 'NON COMPLETATA'}</Tag></header>{tab === 'athlete' ? <dl><div><dt>RPE</dt><dd>{entry.sessionRpe ?? '—'}</dd></div><div><dt>Dolore</dt><dd>{yesNo(entry.painPresent)}</dd></div>{entry.notes && <div className="wide"><dt>Note</dt><dd>{entry.notes}</dd></div>}</dl> : <dl><div><dt>Dolore</dt><dd>{yesNo(entry.painPresent)}</dd></div>{entry.painPresent && <><div><dt>VAS</dt><dd>{entry.painVas}</dd></div><div><dt>Esercizio</dt><dd>{entry.painExerciseName ?? '—'}</dd></div><div><dt>Persistente</dt><dd>{yesNo(entry.painPersistsPostSession === true)}</dd></div><div><dt>Terminata</dt><dd>{yesNo(entry.completionOutcome === 'completed')}</dd></div></>}</dl>}</article>)}</div>
    </Panel><Panel title="Messaggi" index="02" action={<MessageCircle size={18} />}><MessageThread profile={profile} coachId={profile.userId} athleteId={selected.athleteId} counterpartName={selected.name} /></Panel></div>}
  </div>
}
