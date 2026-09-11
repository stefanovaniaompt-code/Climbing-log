import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import App from './App'
import { AuthScreen } from './auth/AuthScreen'
import { PasswordRecoveryScreen } from './auth/PasswordRecoveryScreen'
import { TemporaryPasswordScreen } from './auth/TemporaryPasswordScreen'
import { useAuth } from './auth/AuthProvider'
import { OnboardingScreen } from './onboarding/OnboardingScreen'
import { loadProfile } from './onboarding/profileRepository'
import type { AppProfile } from './onboarding/types'

export function resolveCapabilityRoute(pathname: string, profile: AppProfile) {
  const wantsCoach = pathname.startsWith('/app/coach')
  const wantsAthlete = pathname.startsWith('/app/athlete')
  if (wantsCoach && !profile.capabilities.canAccessCoachArea) return '/app/athlete'
  if (wantsAthlete && !profile.capabilities.canAccessAthleteArea) return '/app/coach'
  if (!wantsCoach && !wantsAthlete) return profile.capabilities.canAccessCoachArea ? '/app/coach' : '/app/athlete'
  return null
}

function LoadingScreen() {
  return <main className="app-loading"><span className="brand__mark" /><div><b>CLIMBING COACH</b><small>Verifica sessione…</small></div></main>
}

function AuthenticatedFlow() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [profile, setProfile] = useState<AppProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    if (!user) return
    let active = true
    setLoadingProfile(true)
    loadProfile(user).then(value => {
      if (active) setProfile(value)
    }).catch(error => {
      if (active) setProfileError(error instanceof Error ? error.message : 'Profilo non disponibile.')
    }).finally(() => {
      if (active) setLoadingProfile(false)
    })
    return () => { active = false }
  }, [user])

  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  if (loadingProfile) return <LoadingScreen />
  if (profileError) return <main className="fatal-state"><b>Profilo non disponibile</b><p>{profileError}</p><button className="button button--secondary" onClick={() => void signOut()}>Torna all’accesso</button></main>
  if (!profile) return <OnboardingScreen user={user} onComplete={setProfile} onSignOut={signOut} />
  if (profile.mustChangePassword) return <TemporaryPasswordScreen onComplete={() => setProfile({ ...profile, mustChangePassword: false })} />
  const redirect = resolveCapabilityRoute(location.pathname, profile)
  if (redirect) return <Navigate to={redirect} replace />
  return <App profile={profile} onSignOut={signOut} initialMode={location.pathname.startsWith('/app/athlete') ? 'athlete' : 'coach'} />
}

export default function AppRoot() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />

  return <Routes>
    <Route path="/auth/recovery" element={<PasswordRecoveryScreen />} />
    <Route path="/auth/*" element={user ? <Navigate to="/app" replace /> : <AuthScreen />} />
    <Route path="/*" element={<AuthenticatedFlow />} />
  </Routes>
}
