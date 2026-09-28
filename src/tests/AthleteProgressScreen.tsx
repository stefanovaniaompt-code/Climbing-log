import { useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, ShieldCheck, TestTube2, TriangleAlert } from 'lucide-react'
import type { MetricSideBundle, TestPresentation } from './testPresentation'

type Props = {
  athleteName: string
  presentation: TestPresentation | null
  loading: boolean
  error: string
  assignedTests: ReactNode
}

export function AthleteProgressScreen({ athleteName, presentation, loading, error, assignedTests }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = presentation?.groups.find(group => group.key === selectedKey) ?? null

  if (selected) return <AthleteTestDetail group={selected} onBack={() => setSelectedKey(null)} />

  return <div className="athlete-progress">
    <header className="athlete-progress__hero"><small>PROGRESSI</small><h1>I tuoi test.</h1><p>{athleteName}, qui trovi soltanto misurazioni realmente registrate.</p></header>

    {assignedTests}

    {loading && <div className="athlete-progress__loading"><i /><i /><i /></div>}
    {error && <div className="athlete-progress__notice is-error"><TriangleAlert size={20} /><span>{error}</span></div>}

    {!loading && !error && presentation?.sessions.length === 0 && <div className="athlete-card athlete-progress__empty"><TestTube2 size={25} /><h2>Nessun risultato disponibile</h2><p>I risultati compariranno dopo la prima valutazione registrata dal coach.</p></div>}

    {!!presentation?.sessions.length && <section className="athlete-progress__summary">
      <div><small>RILEVAZIONI</small><strong>{presentation.sessions.length}</strong></div>
      <div><small>SERIE REALI</small><strong>{presentation.groups.length}</strong></div>
      <div><small>ULTIMO TEST</small><strong>{presentation.latestTestedAt ? shortDate(presentation.latestTestedAt) : '—'}</strong></div>
    </section>}

    {!!presentation?.groups.length && <section className="athlete-progress__groups">
      <div className="athlete-progress__section-head"><div><small>RISULTATI</small><h2>Andamento nel tempo</h2></div><span>{presentation.groups.length}</span></div>
      {presentation.groups.map(group => <button className="athlete-card athlete-progress-card" key={group.key} onClick={() => setSelectedKey(group.key)}>
        <div className="athlete-progress-card__head"><div><small>{[group.grip, group.setupLabel].filter(Boolean).join(' · ') || 'Setup standard'}</small><h3>{group.label}</h3></div><ArrowRight size={18} /></div>
        <MetricValues group={group} />
        <RealMetricChart group={group} compact />
        <p>{group.points.length === 1 ? 'Una rilevazione: viene mostrato un singolo punto.' : `${group.points.length} rilevazioni reali.`}</p>
      </button>)}
    </section>}
  </div>
}

function AthleteTestDetail({ group, onBack }: { group: MetricSideBundle; onBack: () => void }) {
  return <div className="athlete-test-detail">
    <button className="athlete-test-detail__back" onClick={onBack}><ArrowLeft size={17} /> Tutti i progressi</button>
    <header><small>DETTAGLIO TEST</small><h1>{group.label}</h1><p>{[group.grip, group.setupLabel, group.protocolVersion ? `Protocollo ${group.protocolVersion}` : ''].filter(Boolean).join(' · ')}</p></header>
    <section className="athlete-card athlete-test-detail__result"><MetricValues group={group} /><RealMetricChart group={group} /></section>
    <section className="athlete-card athlete-test-detail__history"><div><small>STORICO</small><h2>Rilevazioni registrate</h2></div>{[...group.points].reverse().map((point, index) => <article key={`${point.date}-${index}`}><time>{longDate(point.date)}</time><span>{point.right !== null && <b>DX {formatValue(point.right)} {group.unit}</b>}{point.left !== null && <b>SX {formatValue(point.left)} {group.unit}</b>}{point.bilateral !== null && <b>{formatValue(point.bilateral)} {group.unit}</b>}</span></article>)}</section>
    <div className="athlete-progress__notice"><ShieldCheck size={18} /><span>Dati in sola lettura registrati nella cronologia test.</span></div>
  </div>
}

function MetricValues({ group }: { group: MetricSideBundle }) {
  const values = [
    group.right ? { label: 'DX', value: group.right.latest, percent: group.right.percent } : null,
    group.left ? { label: 'SX', value: group.left.latest, percent: group.left.percent } : null,
    group.bilateral ? { label: 'VALORE', value: group.bilateral.latest, percent: group.bilateral.percent } : null,
  ].filter((value): value is NonNullable<typeof value> => value !== null)
  return <div className="athlete-progress-values">{values.map(value => <div key={value.label}><small>{value.label}</small><strong>{formatValue(value.value)}<span> {group.unit}</span></strong>{value.percent !== null && <em className={value.percent >= 0 ? 'is-positive' : 'is-negative'}>{value.percent >= 0 ? '+' : ''}{formatValue(value.percent)}%</em>}</div>)}</div>
}

function RealMetricChart({ group, compact = false }: { group: MetricSideBundle; compact?: boolean }) {
  const series = [
    { key: 'right' as const, label: 'DX', color: '#d6aa24' },
    { key: 'left' as const, label: 'SX', color: '#7b3a99' },
    { key: 'bilateral' as const, label: 'Valore', color: '#55206f' },
  ].filter(item => group.points.some(point => point[item.key] !== null))
  const values = group.points.flatMap(point => series.map(item => point[item.key]).filter((value): value is number => value !== null))
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)
  const range = Math.max(max - min, 1)
  const x = (index: number) => group.points.length === 1 ? 150 : 18 + (index / (group.points.length - 1)) * 264
  const y = (value: number) => 150 - ((value - min) / range) * 118

  return <div className={`athlete-real-chart${compact ? ' is-compact' : ''}`}>
    <svg viewBox="0 0 300 170" role="img" aria-label={`Andamento reale ${group.label}`}>
      {[32, 71, 110, 149].map(line => <line key={line} x1="12" y1={line} x2="288" y2={line} stroke="#e4d9e8" strokeWidth="1" />)}
      {series.map(item => {
        const points = group.points.map((point, index) => point[item.key] === null ? null : { x: x(index), y: y(point[item.key] as number), value: point[item.key] as number }).filter((point): point is NonNullable<typeof point> => point !== null)
        return <g key={item.key}>{points.length >= 2 && <polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}{points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="4.5" fill={item.color}><title>{formatValue(point.value)} {group.unit}</title></circle>)}</g>
      })}
    </svg>
    <div className="athlete-real-chart__legend">{series.map(item => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
  </div>
}

function formatValue(value: number) { return value.toLocaleString('it-IT', { maximumFractionDigits: 2 }) }
function shortDate(value: string) { return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)).replace('.', '').toUpperCase() }
function longDate(value: string) { return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) }
