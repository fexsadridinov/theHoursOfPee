export interface InvitationRecord {
  id: string
  email: string
  tokenHash: string
  invitedBy: string
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
}

export const INVITE_RATE_LIMIT = 8
export const ACCEPT_RATE_LIMIT = 10
export const RATE_WINDOW_MS = 60 * 60 * 1000

export const generateInviteToken = () => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export const hashInviteToken = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export const invitationState = (invite: InvitationRecord | null, now = Date.now()) => {
  if (!invite) return 'missing' as const
  if (invite.acceptedAt) return 'used' as const
  if (new Date(invite.expiresAt).getTime() <= now) return 'expired' as const
  return 'valid' as const
}

export const canAcceptInvitation = (invite: InvitationRecord | null, email: string, tokenHash: string, now = Date.now()) => {
  if (!invite || invite.tokenHash !== tokenHash || invite.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
    return { ok: false as const, reason: 'generic' as const }
  }
  const state = invitationState(invite, now)
  if (state !== 'valid') return { ok: false as const, reason: state }
  return { ok: true as const }
}

export const markAccepted = (invite: InvitationRecord, at: string): InvitationRecord => {
  if (invite.acceptedAt) throw new Error('Invitation already used')
  return { ...invite, acceptedAt: at }
}

export const isRateLimited = (count: number, limit: number, startedAt: number, now = Date.now(), windowMs = RATE_WINDOW_MS) =>
  count >= limit && now - startedAt < windowMs

export const expiresAtFrom = (hours: number, now = Date.now()) => new Date(now + hours * 60 * 60 * 1000).toISOString()
