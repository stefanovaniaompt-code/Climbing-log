import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  ClipboardCheck,
  Home,
  KeyRound,
  LogOut,
  Mail,
  Menu,
  Mountain,
  Settings2,
  SlidersHorizontal,
  TestTube2,
  TimerReset,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { dataRuntime } from './dataRuntime'
import { countPendingOperations, flushExerciseOutbox, OUTBOX_CHANGED_EVENT } from './outbox'
import { availableModes, defaultMode, type AppProfile, type AppRole } from './onboarding/types'
import { AthleteHomeScreen as HomeScreen } from './dashboard/AthleteHomeScreen'
import { syncQueuedExercise } from './session/sessionRunnerRepository'
import { SessionScreen } from './session/SessionScreen'
import { DashboardScreen } from './coach/DashboardScreen'
import { AthleteManagementScreen } from './coach/AthleteManagementScreen'
import { BuilderScreen } from './builder/BuilderScreen'
import { LibraryScreen } from './library/LibraryScreen'
import { TestScreen } from './tests/TestScreen'
import { useUpdateBlocker } from './pwa/useUpdateBlocker'
import { SystemScreen } from './features/system/SystemScreen'
import { MigrationScreen } from './features/migration/MigrationScreen'
import { AccountSecurityScreen } from './features/account/AccountSecurityScreen'
import { CoachFeedbackScreen } from './feedback/CoachFeedbackScreen'
import { MessagesScreen } from './messaging/MessagesScreen'
import { useMessageNotifications } from './messaging/useMessageNotifications'
import { AthleteShell, type AthleteView } from './athlete/AthleteShell'

type ViewId = 'system' | 'home' | 'session' | 'dashboard' | 'athletes' | 'feedback' | 'messages' | 'builder' | 'library' | 'test' | 'migration' | 'account'

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
  { id: 'feedback', label: 'Feedback', shortLabel: 'Feedback', icon: ClipboardCheck, group: 'Coaching', roles: ['coach'] },
  { id: 'builder', label: 'Program builder', shortLabel: 'Builder', icon: SlidersHorizontal, group: 'Coaching', roles: ['coach'] },
  { id: 'library', label: 'Libreria esercizi', shortLabel: 'Esercizi', icon: BookOpen, group: 'Coaching', roles: ['coach'] },
  { id: 'test', label: 'Test / retest', shortLabel: 'Test', icon: TestTube2, group: 'Analisi', roles: ['athlete', 'coach'] },
  { id: 'messages', label: 'Messaggi', shortLabel: 'Messaggi', icon: Mail, group: 'Comunicazione', roles: ['athlete'] },
  { id: 'account', label: 'Account e sicurezza', shortLabel: 'Account', icon: KeyRound, group: 'Account', roles: ['athlete', 'coach'] },
]

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
  dashboard: { label: 'Coach dashboard', component: ({ profile, goTo, openAthlete }) => <DashboardScreen profile={profile} openAthletes={() => goTo('athletes')} openAthlete={openAthlete} /> },
  athletes: { label: 'Atleti e inviti', component: ({ profile, goTo, selectedAthleteId, setSelectedAthleteId, goToAthlete }) => <AthleteManagementScreen profile={profile} selectedAthleteId={selectedAthleteId} setSelectedAthleteId={setSelectedAthleteId} openDashboard={() => goTo('dashboard')} openAthleteArea={goToAthlete} /> },
  builder: { label: 'Program builder', component: ({ profile, selectedAthleteId }) => <BuilderScreen profile={profile} selectedAthleteId={selectedAthleteId} /> },
  library: { label: 'Libreria esercizi', component: ({ profile }) => <LibraryScreen profile={profile} /> },
  test: { label: 'Test / retest', component: ({ profile, selectedAthleteId }) => <TestScreen profile={profile} selectedAthleteId={selectedAthleteId} /> },
  feedback: { label: 'Feedback', component: ({ profile }) => <CoachFeedbackScreen profile={profile} /> },
  messages: { label: 'Messaggi', component: ({ profile }) => <MessagesScreen profile={profile} /> },
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
  const { unreadCount, toast: messageToast } = useMessageNotifications(activeProfile)
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

  const updateUnsafeView =
    view !== 'home' &&
    view !== 'dashboard'

  useUpdateBlocker(
    `app-view:${profile.userId}`,
    updateUnsafeView,
  )
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
    if (next === 'session' && mode === 'athlete') setSelectedSessionId('')
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

  const screen = <Screen goTo={navigate} goToAthlete={goToAthlete} openAthlete={openAthlete} openSession={openSession} profile={activeProfile} selectedAthleteId={selectedAthleteId} setSelectedAthleteId={setSelectedAthleteId} selectedSessionId={selectedSessionId} />

  if (mode === 'athlete') {
    return <>
      <AthleteShell
        profile={activeProfile}
        view={view}
        unreadCount={unreadCount}
        pendingCount={pendingCount}
        syncing={syncing}
        canSwitchToCoach={modes.includes('coach')}
        onNavigate={next => navigate(next as AthleteView)}
        onAccount={() => navigate('account')}
        onSignOut={onSignOut}
        onSync={() => void synchronizePending()}
        onSwitchToCoach={() => changeMode('coach')}
      >
        {screen}
      </AthleteShell>
      {messageToast && <div className="message-toast" role="status">{messageToast}</div>}
    </>
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div className="brand"><div className="brand__mark"><Mountain size={22} /></div><div><b>CLIMBING<br />COACH</b><span>TRAINING SYSTEM</span></div></div>
        <nav aria-label="Navigazione prototipo">
          {groups.map(group => <div className="nav-group" key={group}><small>{group}</small>{roleNavItems.filter(item => item.group === group).map(item => { const Icon = item.icon; const messageItem = item.id === 'feedback' || item.id === 'messages'; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={17} /><span>{item.label}</span><i>{messageItem && unreadCount ? unreadCount : item.id === 'migration' ? '!' : ''}</i></button> })}</div>)}
        </nav>
        <div className="sidebar__foot"><div><span className={`status-dot ${pendingCount ? 'status-dot--sync' : 'status-dot--ok'}`} /><b>{profile.workspaceName}</b></div><small>{dataRuntime.isConfigured ? 'Supabase collegato' : 'Demo locale'} · {pendingCount ? `${pendingCount} modifiche in coda` : 'coda vuota'}</small></div>
      </aside>
      <div className="app-main">
        <div className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Apri navigazione"><Menu size={20} /></button>
          <div className="topbar__crumb"><span>CC</span><i>/</i><b>{viewMeta[view].label}</b></div>
          <div className="topbar__tools">{modes.length > 1 ? <div className="mode-switch" aria-label="Modalità"><button className="active" onClick={() => changeMode('coach')}>Coach</button><button onClick={() => changeMode('athlete')}>Atleta</button></div> : <span className="role-chip">Coach</span>}<button className="sync-chip" onClick={() => void synchronizePending()} disabled={syncing || pendingCount === 0} title="Sincronizza la coda offline"><span className={`status-dot ${pendingCount ? 'status-dot--sync' : 'status-dot--ok'}`} />{syncing ? 'Sincronizzo…' : pendingCount ? `${pendingCount} in coda` : 'Cloud allineato'}</button><button className="icon-button message-indicator" aria-label={`Messaggi${unreadCount ? `, ${unreadCount} non letti` : ''}`} onClick={() => navigate('feedback')}><Mail size={17} />{unreadCount > 0 && <span>{unreadCount}</span>}</button><button className="icon-button" aria-label="Account e sicurezza" onClick={() => navigate('account')}><Settings2 size={17} /></button><button className="profile-button" onClick={() => void onSignOut()} title="Esci"><span>{initials}</span><LogOut size={14} /></button></div>
        </div>
        <main>{screen}</main>
        <nav className="bottom-nav" aria-label="Navigazione mobile">
          {roleNavItems.filter(item => ['dashboard', 'athletes', 'feedback', 'test'].includes(item.id)).slice(0, 4).map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.shortLabel}</span>{item.id === 'feedback' && unreadCount > 0 && <i>{unreadCount}</i>}</button> })}
        </nav>
      </div>
      {menuOpen && <button className="scrim" aria-label="Chiudi navigazione" onClick={() => setMenuOpen(false)} />}
      {messageToast && <div className="message-toast" role="status">{messageToast}</div>}
    </div>
  )
}
