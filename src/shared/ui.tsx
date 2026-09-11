import type { ReactNode } from 'react'
import { TrendingUp, Trash2, TriangleAlert } from 'lucide-react'

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'purple' | 'signal' | 'success' | 'warning' }) {
  return <span className={`tag tag--${tone}`}>{children}</span>
}

export function Panel({ children, className = '', title, index, action }: { children: ReactNode; className?: string; title?: string; index?: string; action?: ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <div className="panel__head">
          <div className="panel__title">{index && <span>{index}</span>}{title}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function ConfirmDialog({ title, text, confirmLabel, busy = false, onCancel, onConfirm }: { title: string; text: string; confirmLabel: string; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-text">
      <div className="confirm-dialog__icon"><TriangleAlert size={22} /></div>
      <div><span className="eyebrow">CONFERMA RICHIESTA</span><h2 id="confirm-dialog-title">{title}</h2><p id="confirm-dialog-text">{text}</p></div>
      <div className="confirm-dialog__actions"><button className="button button--secondary" disabled={busy} onClick={onCancel}>Annulla</button><button className="button button--danger" disabled={busy} onClick={onConfirm}><Trash2 size={16} /> {busy ? 'Elimino…' : confirmLabel}</button></div>
    </section>
  </div>
}

export function Metric({ label, value, unit, delta, signal = false }: { label: string; value: string; unit?: string; delta?: string; signal?: boolean }) {
  return (
    <div className={`metric ${signal ? 'metric--signal' : ''}`}>
      <div className="metric__label">{label}</div>
      <div className="metric__value">{value}<span>{unit}</span></div>
      {delta && <div className="metric__delta"><TrendingUp size={13} /> {delta}</div>}
    </div>
  )
}

export function Bars({ values, accentAt = -1 }: { values: number[]; accentAt?: number }) {
  return (
    <div className="bars" aria-label="Grafico a barre dimostrativo">
      {values.map((value, index) => (
        <span key={index} className={index === accentAt ? 'is-accent' : ''} style={{ height: `${value}%` }} />
      ))}
    </div>
  )
}

export function ScreenHeader({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: ReactNode }) {
  return (
    <header className="screen-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action}
    </header>
  )
}
