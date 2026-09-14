import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { AuthStatus, Profile, SessionState } from './access'
import { authStatusFrom, GENERIC_AUTH_ERROR } from './access'
import { isRemoteConfigured } from '../config'
import { getSupabase } from '../repository/supabase'
import { authRedirectUrl } from './origin'

interface AuthContextValue {
  remote: boolean
  loading: boolean
  status: AuthStatus
  errorMessage: string | null
  session: SessionState
  profile: Profile | null
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  requestReset: (email: string) => Promise<string | null>
  updatePassword: (password: string) => Promise<string | null>
  completeFirstPassword: (password: string) => Promise<string | null>
  updateDisplayName: (name: string) => Promise<void>
  deleteAccount: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const mapProfile = (row: Record<string, unknown>): Profile => ({
  id: String(row.id), email: String(row.email ?? ''), displayName: String(row.display_name ?? ''),
  role: row.role as Profile['role'], status: row.status as Profile['status'],
  mustChangePassword: row.must_change_password === true,
  createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? ''),
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const remote = isRemoteConfigured()
  const [loading, setLoading] = useState(remote)
  const [session, setSession] = useState<SessionState>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!remote) return
    const supabase = getSupabase()
    let cancelled = false
    const apply = async () => {
      try {
        const { data: { session: next }, error: sessionError } = await supabase.auth.getSession()
        if (cancelled) return
        if (sessionError) {
          setSession(null)
          setProfile(null)
          setErrorMessage('Your session expired. Please sign in again.')
          setLoading(false)
          return
        }
        if (!next?.user) {
          setSession(null)
          setProfile(null)
          setErrorMessage(null)
          setLoading(false)
          return
        }
        setSession({
          userId: next.user.id,
          email: next.user.email ?? '',
          emailConfirmed: Boolean(next.user.email_confirmed_at ?? next.user.confirmed_at),
        })
        const { data, error } = await supabase.from('profiles').select('*').eq('id', next.user.id).maybeSingle()
        if (cancelled) return
        if (error) {
          setErrorMessage('Your session expired. Please sign in again.')
          setProfile(null)
          setLoading(false)
          return
        }
        setProfile(data ? mapProfile(data as Record<string, unknown>) : null)
        setErrorMessage(null)
        setLoading(false)
      } catch {
        if (cancelled) return
        setErrorMessage('Unable to restore your session. Check your connection and try again.')
        setLoading(false)
      }
    }
    void apply()
    const { data } = supabase.auth.onAuthStateChange(() => { void apply() })
    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [remote])

  const status = authStatusFrom(loading, session, profile, errorMessage)

  const value = useMemo<AuthContextValue>(() => ({
    remote, loading, status, errorMessage, session, profile,
    signIn: async (email, password) => {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password })
      return error ? GENERIC_AUTH_ERROR : null
    },
    signOut: async () => { await getSupabase().auth.signOut() },
    requestReset: async (email) => {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: authRedirectUrl('/auth/callback?next=/auth/reset-password'),
      })
      return error ? GENERIC_AUTH_ERROR : null
    },
    updatePassword: async (password) => {
      const { error } = await getSupabase().auth.updateUser({ password })
      return error ? GENERIC_AUTH_ERROR : null
    },
    completeFirstPassword: async (password) => {
      const supabase = getSupabase()
      const { error } = await supabase.auth.updateUser({ password })
      if (error || !session) return GENERIC_AUTH_ERROR
      const { error: profileError } = await supabase.from('profiles')
        .update({ must_change_password: false }).eq('id', session.userId)
      if (profileError) return GENERIC_AUTH_ERROR
      setProfile(current => current ? { ...current, mustChangePassword: false } : current)
      return null
    },
    updateDisplayName: async (name) => {
      if (!session) return
      await getSupabase().from('profiles').update({ display_name: name }).eq('id', session.userId)
      setProfile(current => current ? { ...current, displayName: name } : current)
    },
    deleteAccount: async () => {
      const { error } = await getSupabase().functions.invoke('delete-own-account')
      await getSupabase().auth.signOut()
      return error ? GENERIC_AUTH_ERROR : null
    },
  }), [remote, loading, status, errorMessage, session, profile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider required')
  return value
}

export const navigate = (path: string) => {
  history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export const usePath = () => useSyncExternalStore(
  onStore => { window.addEventListener('popstate', onStore); return () => window.removeEventListener('popstate', onStore) },
  () => window.location.pathname + window.location.search,
)
