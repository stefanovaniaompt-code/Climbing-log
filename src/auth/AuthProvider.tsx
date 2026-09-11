import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { dataRuntime } from '../dataRuntime'
import { supabase } from '../lib/supabase'

export type AppUser = {
  id: string
  email: string
  isDemo: boolean
}

type AuthContextValue = {
  user: AppUser | null
  loading: boolean
  configured: boolean
  recoveryMode: boolean
  signInWithPassword: (email: string, password: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  sendMagicLink: (email: string, createAccount: boolean) => Promise<void>
  setPassword: (password: string) => Promise<void>
  enterDemo: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(dataRuntime.isConfigured)
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    if (!supabase) return

    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const authUser = data.session?.user
      setUser(authUser ? { id: authUser.id, email: authUser.email ?? '', isDemo: false } : null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      const authUser = session?.user
      setUser(authUser ? { id: authUser.id, email: authUser.email ?? '', isDemo: false } : null)
      setLoading(false)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    configured: dataRuntime.isConfigured,
    recoveryMode,
    async signInWithPassword(email, password) {
      if (!supabase) throw new Error('Supabase non è ancora configurato.')
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    async requestPasswordReset(email) {
      if (!supabase) throw new Error('Supabase non è ancora configurato.')
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/recovery`,
      })
      if (error) throw error
    },
    async sendMagicLink(email, createAccount) {
      if (!supabase) throw new Error('Supabase non è ancora configurato.')
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: createAccount,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
    },
    async setPassword(password) {
      if (!supabase || !user || user.isDemo) throw new Error('La password può essere impostata soltanto su un account reale.')
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      if (dataRuntime.backendSchema === 'legacy-v1') {
        const { error: profileError } = await supabase.from('profiles').update({ must_change_password: false }).eq('id', user.id).select('id').single()
        if (profileError) throw new Error('Password aggiornata, ma lo sblocco dell’account non è riuscito. Riprova con la nuova password.')
      }
      setRecoveryMode(false)
    },
    enterDemo() {
      setUser({ id: '00000000-0000-4000-8000-000000000001', email: 'demo@climbing.coach', isDemo: true })
    },
    async signOut() {
      if (supabase && !user?.isDemo) {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      }
      setUser(null)
    },
  }), [loading, recoveryMode, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve essere usato dentro AuthProvider')
  return context
}
