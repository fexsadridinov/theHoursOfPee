export type Role = 'admin' | 'member'
export type AccountStatus = 'active' | 'suspended'

export interface Profile {
  id: string
  email: string
  displayName: string
  role: Role
  status: AccountStatus
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

export type RouteDecision = 'public' | 'login' | 'confirm' | 'suspended' | 'forbidden' | 'app' | 'account' | 'admin'

export const publicPaths = ['/login', '/invite', '/register', '/confirm-email', '/forgot-password', '/reset-password']

export const decideRoute = (path: string, session: SessionState, profile: Profile | null, remote: boolean): RouteDecision => {
  const pathname = path.split('?')[0]
  if (!remote) return pathname.startsWith('/admin') || pathname.startsWith('/account') ? 'app' : 'app'
  if (publicPaths.includes(pathname)) return 'public'
  if (!session) return 'login'
  if (!session.emailConfirmed && pathname !== '/confirm-email') return 'confirm'
  if (isSuspended(profile)) return 'suspended'
  if (!canUseApp(profile)) return 'login'
  if (pathname.startsWith('/admin')) return isAdmin(profile) ? 'admin' : 'forbidden'
  if (pathname.startsWith('/account')) return 'account'
  return 'app'
}
