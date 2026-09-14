export type Role = 'admin' | 'member'
export type AccountStatus = 'active' | 'suspended' | 'deleted'
export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'suspended' | 'error'

export interface Profile {
  id: string
  email: string
  displayName: string
  role: Role
  status: AccountStatus
  mustChangePassword: boolean
  createdAt: string
  updatedAt: string
}

export type SessionState = {
  userId: string
  email: string
  emailConfirmed: boolean
} | null

export const GENERIC_AUTH_ERROR = 'Unable to complete that request. Try again or contact an administrator.'
export const GENERIC_INVITE_RESPONSE = 'If this invitation is valid, you can continue.'

export const canUseApp = (profile: Profile | null) => Boolean(profile && profile.status === 'active')
export const isSuspended = (profile: Profile | null) => profile?.status === 'suspended'
export const isAdmin = (profile: Profile | null) => canUseApp(profile) && profile?.role === 'admin'

export const ownershipUserId = (sessionUserId: string, attempted?: string) => {
  if (attempted && attempted !== sessionUserId) throw new Error('Ownership violation')
  return sessionUserId
}

export type RouteDecision = 'public' | 'login' | 'confirm' | 'suspended' | 'password' | 'forbidden' | 'app' | 'account' | 'admin'

export const needsPasswordChange = (profile: Profile | null) => Boolean(canUseApp(profile) && profile?.mustChangePassword)

export const passwordProblem = (password: string, confirm: string) => {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (password !== confirm) return 'Both passwords must match.'
  return null
}

export type FunctionReply = { ok?: boolean, emailed?: boolean, message?: string }

// supabase-js hides the response body on non-2xx replies, and Edge Functions explain what an admin must fix.
export const functionErrorBody = async (error: unknown): Promise<FunctionReply | null> => {
  const response = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context
  if (!response || typeof response.json !== 'function') return null
  try {
    const body = await response.json()
    return body && typeof body === 'object' ? body as FunctionReply : null
  } catch {
    return null
  }
}

export const publicPaths = [
  '/login', '/invite', '/register', '/confirm-email', '/forgot-password', '/reset-password',
  '/auth/callback', '/auth/confirm', '/auth/reset-password',
]

export const recoveryPaths = ['/reset-password', '/auth/reset-password']

export const authStatusFrom = (
  loading: boolean,
  session: SessionState,
  profile: Profile | null,
  error: string | null,
): AuthStatus => {
  if (loading) return 'loading'
  if (error) return 'error'
  if (!session) return 'unauthenticated'
  if (profile?.status === 'suspended' || profile?.status === 'deleted') return 'suspended'
  if (session && profile?.status === 'active') return 'authenticated'
  if (session && !profile) return 'loading'
  return 'error'
}

export const decideRoute = (path: string, session: SessionState, profile: Profile | null, remote: boolean): RouteDecision => {
  const pathname = path.split('?')[0]
  if (!remote) return pathname.startsWith('/admin') || pathname.startsWith('/account') ? 'app' : 'app'
  if (publicPaths.includes(pathname)) return 'public'
  if (!session) return 'login'
  if (!session.emailConfirmed && pathname !== '/confirm-email') return 'confirm'
  if (isSuspended(profile)) return 'suspended'
  if (!canUseApp(profile)) return 'login'
  if (needsPasswordChange(profile)) return 'password'
  if (pathname.startsWith('/admin')) return isAdmin(profile) ? 'admin' : 'forbidden'
  if (pathname.startsWith('/account')) return 'account'
  return 'app'
}
