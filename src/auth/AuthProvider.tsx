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
  sendMagicLink: (email: string) => Promise<void>
  setPassword: (password: string) => Promise<void>
  enterDemo: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const RECOVERY_STORAGE_KEY = 'cc-v2:password-recovery'

function appUrl(path: string) {
  const configuredBase = import.meta.env.BASE_URL
  const base = configuredBase.endsWith('/')
    ? configuredBase
    : configuredBase + '/'
  const cleanPath = path.replace(/^\//, '')
  return new URL(base + cleanPath, window.location.origin).toString()
}

function readRecoveryMode() {
  try {
    return window.sessionStorage.getItem(RECOVERY_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function storeRecoveryMode(value: boolean) {
  try {
    if (value) {
      window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, '1')
    } else {
      window.sessionStorage.removeItem(RECOVERY_STORAGE_KEY)
    }
  } catch {
    // Session storage can be unavailable.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(dataRuntime.isConfigured)
  const [recoveryMode, setRecoveryMode] = useState(readRecoveryMode)

  useEffect(() => {
    if (!supabase) return

    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return

      const authUser = data.session?.user

      setUser(
        authUser
          ? {
              id: authUser.id,
              email: authUser.email ?? '',
              isDemo: false,
            }
          : null,
      )

      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          storeRecoveryMode(true)
          setRecoveryMode(true)
        }

        if (event === 'SIGNED_OUT') {
          storeRecoveryMode(false)
          setRecoveryMode(false)
        }

        const authUser = session?.user

        setUser(
          authUser
            ? {
                id: authUser.id,
                email: authUser.email ?? '',
                isDemo: false,
              }
            : null,
        )

        setLoading(false)
      },
    )

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
      if (!supabase) {
        throw new Error('Supabase non è ancora configurato.')
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error
    },

    async requestPasswordReset(email) {
      if (!supabase) {
        throw new Error('Supabase non è ancora configurato.')
      }

      const { error } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: appUrl('/auth/recovery'),
        },
      )

      if (error) throw error
    },

    async sendMagicLink(email) {
      if (!supabase) {
        throw new Error('Supabase non è ancora configurato.')
      }

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: appUrl('/auth/callback'),
        },
      })

      if (error) throw error
    },

    async setPassword(password) {
      if (!supabase || !user || user.isDemo) {
        throw new Error(
          'La password può essere impostata soltanto su un account reale.',
        )
      }

      const { error } = await supabase.auth.updateUser({
        password,
      })

      if (error) throw error

      if (dataRuntime.backendSchema === 'legacy-v1') {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ must_change_password: false })
          .eq('id', user.id)
          .select('id')
          .single()

        if (profileError) {
          throw new Error(
            'Password aggiornata, ma lo sblocco dell’account non è riuscito. Riprova con la nuova password.',
          )
        }
      }

      storeRecoveryMode(false)
      setRecoveryMode(false)
    },

    enterDemo() {
      setUser({
        id: '00000000-0000-4000-8000-000000000001',
        email: 'demo@climbing.coach',
        isDemo: true,
      })
    },

    async signOut() {
      if (supabase && !user?.isDemo) {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      }

      storeRecoveryMode(false)
      setRecoveryMode(false)
      setUser(null)
    },
  }), [loading, recoveryMode, user])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth deve essere usato dentro AuthProvider')
  }

  return context
}
