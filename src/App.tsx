import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  Dumbbell,
  Home,
  KeyRound,
  Mail,
  MessageSquare,
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
import { CoachShell } from './coach/CoachShell'

type ViewId = 'system' | 'home' | 'session' | 'dashboard' | 'athletes' | 'feedback' | 'messages' | 'builder' | 'library' | 'test' | 'progress' | 'migration' | 'account'

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
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Coach', icon: Home, group: 'Coaching', roles: ['coach'] },
  { id: 'athletes', label: 'Atleti', shortLabel: 'Atleti', icon: Users, group: 'Coaching', roles: ['coach'] },
  { id: 'builder', label: 'Programmi', shortLabel: 'Programmi', icon: CalendarDays, group: 'Coaching', roles: ['coach'] },
  { id: 'test', label: 'Test / retest', shortLabel: 'Test', icon: TestTube2, group: 'Analisi', roles: ['athlete', 'coach'] },
  { id: 'progress', label: 'Progressi', shortLabel: 'Progressi', icon: BarChart3, group: 'Analisi', roles: ['coach'] },
  { id: 'library', label: 'Esercizi', shortLabel: 'Esercizi', icon: Dumbbell, group: 'Coaching', roles: ['coach'] },
  { id: 'feedback', label: 'Feedback', shortLabel: 'Feedback', icon: MessageSquare, group: 'Coaching', roles: ['coach'] },
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
  dashboard: { label: 'Dashboard coach', component: ({ profile, goTo }) => <DashboardScreen profile={profile} openPrograms={() => goTo('builder')} openFeedback={() => goTo('feedback')} openProgress={() => goTo('progress')} /> },
  athletes: { label: 'Atleti e inviti', component: ({ profile, goTo, selectedAthleteId, setSelectedAthleteId, goToAthlete }) => <AthleteManagementScreen profile={profile} selectedAthleteId={selectedAthleteId} setSelectedAthleteId={setSelectedAthleteId} openDashboard={() => goTo('dashboard')} openAthleteArea={goToAthlete} /> },
  builder: { label: 'Program builder', component: ({ profile, selectedAthleteId }) => <BuilderScreen profile={profile} selectedAthleteId={selectedAthleteId} /> },
  library: { label: 'Libreria esercizi', component: ({ profile }) => <LibraryScreen profile={profile} /> },
  test: { label: 'Test / retest', component: ({ profile, selectedAthleteId }) => <TestScreen profile={profile} selectedAthleteId={selectedAthleteId} /> },
  progress: { label: 'Progressi', component: ({ profile, selectedAthleteId }) => <TestScreen profile={profile} selectedAthleteId={selectedAthleteId} /> },
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

  return <>
    <CoachShell
      profile={activeProfile}
      view={view}
      section={viewMeta[view].label}
      items={roleNavItems.filter(item => ['dashboard', 'athletes', 'builder', 'test', 'progress', 'library', 'feedback'].includes(item.id))}
      menuOpen={menuOpen}
      unreadCount={unreadCount}
      canSwitchToAthlete={modes.includes('athlete')}
      onMenuToggle={() => setMenuOpen(value => !value)}
      onNavigate={next => navigate(next as ViewId)}
      onAccount={() => navigate('account')}
      onFeedback={() => navigate('feedback')}
      onSignOut={() => void onSignOut()}
      onSwitchToAthlete={() => changeMode('athlete')}
    >
      {screen}
    </CoachShell>
    {messageToast && <div className="message-toast" role="status">{messageToast}</div>}
  </>
}
