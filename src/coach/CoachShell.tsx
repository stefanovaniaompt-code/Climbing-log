import { Bell, LogOut, Menu, Search, Settings, X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AppProfile } from '../onboarding/types'
import './coach.css'

export type CoachShellItem = { id: string; label: string; icon: LucideIcon }

export function CoachShell({
  profile,
  view,
  section,
  items,
  menuOpen,
  unreadCount,
  canSwitchToAthlete,
  children,
  onMenuToggle,
  onNavigate,
  onAccount,
  onFeedback,
  onSignOut,
  onSwitchToAthlete,
}: {
  profile: AppProfile
  view: string
  section: string
  items: CoachShellItem[]
  menuOpen: boolean
  unreadCount: number
  canSwitchToAthlete: boolean
  children: ReactNode
  onMenuToggle: () => void
  onNavigate: (view: string) => void
  onAccount: () => void
  onFeedback: () => void
  onSignOut: () => void
  onSwitchToAthlete: () => void
}) {
  const name = profile.displayName.trim() || 'Coach'
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'CC'

  return <div className="coach-shell">
    <aside className={`coach-shell__sidebar ${menuOpen ? 'is-open' : ''}`}>
      <button className="coach-shell__close" onClick={onMenuToggle} aria-label="Chiudi navigazione"><X size={20} /></button>
      <div className="coach-brand">
        <i />
        <strong>CC</strong>
        <span>CLIMBING<br />COACH</span>
      </div>
      <div className="coach-motto"><i /><span>PEOPLE<br />PROCESS<br />PROGRESS</span></div>
      <nav aria-label="Navigazione coach">
        {items.map(item => {
          const Icon = item.icon
          return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => onNavigate(item.id)}>
            <Icon size={17} strokeWidth={1.9} />
            <span>{item.label}</span>
            {item.id === 'feedback' && unreadCount > 0 && <em>{unreadCount}</em>}
          </button>
        })}
        <div className="coach-shell__separator" />
        <button onClick={onAccount}><Settings size={17} strokeWidth={1.9} /><span>Impostazioni</span></button>
      </nav>
      <div className="coach-profile">
        <button onClick={onSignOut} title="Esci">
          <span className="coach-profile__avatar">{initials}<i /></span>
          <span><b>Coach</b><small>{name}</small></span>
          <LogOut className="coach-profile__logout" size={15} />
        </button>
      </div>
    </aside>

    <div className="coach-shell__main">
      <header className="coach-topbar">
        <button className="coach-topbar__menu" onClick={onMenuToggle} aria-label="Apri navigazione"><Menu size={20} /></button>
        <p>// {section.toUpperCase()}</p>
        <div className="coach-topbar__tools">
          <div className="coach-search"><Search size={17} /><span>CERCA ATLETI, SESSIONI, ESERCIZI...</span></div>
          <button className="coach-bell" onClick={onFeedback} aria-label={`Feedback${unreadCount ? `, ${unreadCount} da leggere` : ''}`}><Bell size={19} />{unreadCount > 0 && <i />}</button>
          <span className="coach-topbar__divider" />
          <button className="coach-account" onClick={canSwitchToAthlete ? onSwitchToAthlete : onAccount} aria-label={canSwitchToAthlete ? 'Passa alla modalità atleta' : 'Account'}><i /></button>
        </div>
      </header>
      <main className="coach-shell__content">{children}</main>
    </div>
    {menuOpen && <button className="coach-shell__scrim" onClick={onMenuToggle} aria-label="Chiudi navigazione" />}
  </div>
}
