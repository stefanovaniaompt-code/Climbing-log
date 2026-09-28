import type { ReactNode } from 'react'
import { Dumbbell, Home, MessageCircle, RefreshCw, Settings2, TrendingUp, Users } from 'lucide-react'
import type { AppProfile } from '../onboarding/types'
import './athlete.css'

export type AthleteView = 'home' | 'session' | 'test' | 'messages'

type AthleteShellProps = {
  children: ReactNode
  profile: AppProfile
  view: string
  unreadCount: number
  pendingCount: number
  syncing: boolean
  canSwitchToCoach: boolean
  onNavigate: (view: AthleteView) => void
  onAccount: () => void
  onSignOut: () => Promise<void>
  onSync: () => void
  onSwitchToCoach: () => void
}

const items: Array<{ id: AthleteView; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'session', label: 'Sessione', icon: Dumbbell },
  { id: 'test', label: 'Progressi', icon: TrendingUp },
  { id: 'messages', label: 'Coach', icon: MessageCircle },
]

export function AthleteShell(props: AthleteShellProps) {
  const initials = props.profile.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'CC'

  return (
    <div className="athlete-shell">
      <header className="athlete-shell__header">
        <button className="athlete-shell__brand" onClick={() => props.onNavigate('home')} aria-label="Vai alla home">
          <span>CC</span>
          <b>Climbing Coach</b>
        </button>
        <div className="athlete-shell__actions">
          {props.pendingCount > 0 && <button className="athlete-shell__sync" onClick={props.onSync} disabled={props.syncing} aria-label="Sincronizza modifiche">
            <RefreshCw size={16} className={props.syncing ? 'is-spinning' : ''} />
            <span>{props.pendingCount}</span>
          </button>}
          {props.canSwitchToCoach && <button className="athlete-shell__tool" onClick={props.onSwitchToCoach} aria-label="Passa alla modalità coach"><Users size={18} /></button>}
          <button className="athlete-shell__tool" onClick={props.onAccount} aria-label="Account e sicurezza"><Settings2 size={18} /></button>
          <button className="athlete-shell__profile" onClick={() => void props.onSignOut()} title="Esci" aria-label="Esci"><span>{initials}</span></button>
        </div>
      </header>

      <main className="athlete-shell__main">{props.children}</main>

      <nav className="athlete-bottom-nav" aria-label="Navigazione atleta">
        {items.map(item => {
          const Icon = item.icon
          const active = props.view === item.id
          return <button key={item.id} className={active ? 'is-active' : ''} onClick={() => props.onNavigate(item.id)} aria-current={active ? 'page' : undefined}>
            <span className="athlete-bottom-nav__icon"><Icon size={20} strokeWidth={1.9} />{item.id === 'messages' && props.unreadCount > 0 && <i>{props.unreadCount}</i>}</span>
            <span>{item.label}</span>
          </button>
        })}
      </nav>
    </div>
  )
}
