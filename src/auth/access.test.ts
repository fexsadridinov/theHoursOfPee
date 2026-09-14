import { describe, expect, it } from 'vitest'
import { authStatusFrom, canUseApp, decideRoute, functionErrorBody, isAdmin, isSuspended, needsPasswordChange, ownershipUserId, passwordProblem } from './access'
import { canAcceptInvitation, expiresAtFrom, generateInviteToken, hashInviteToken, invitationState, invitationStatusLabel, isRateLimited, markAccepted, type InvitationRecord } from './invitations'

const profile = (overrides = {}) => ({
  id: 'user-a', email: 'a@example.com', displayName: 'A', role: 'member' as const, status: 'active' as const,
  mustChangePassword: false, createdAt: '', updatedAt: '', ...overrides,
})
const activeSession = { userId: 'user-a', email: 'a@example.com', emailConfirmed: true }

describe('route access', () => {
  it('sends anonymous remote users to login', () => {
    expect(decideRoute('/', null, null, true)).toBe('login')
    expect(decideRoute('/login', null, null, true)).toBe('public')
    expect(decideRoute('/auth/callback', null, null, true)).toBe('public')
    expect(decideRoute('/auth/reset-password', null, null, true)).toBe('public')
  })
  it('allows the local app without a session', () => {
    expect(decideRoute('/', null, null, false)).toBe('app')
  })
  it('blocks suspended users from application data', () => {
    const suspended = profile({ status: 'suspended' })
    expect(isSuspended(suspended)).toBe(true)
    expect(canUseApp(suspended)).toBe(false)
    expect(decideRoute('/', { userId: 'user-a', email: 'a@example.com', emailConfirmed: true }, suspended, true)).toBe('suspended')
  })
  it('forbids member access to admin routes', () => {
    expect(isAdmin(profile())).toBe(false)
    expect(decideRoute('/admin', { userId: 'user-a', email: 'a@example.com', emailConfirmed: true }, profile(), true)).toBe('forbidden')
    expect(decideRoute('/admin', { userId: 'admin', email: 'admin@example.com', emailConfirmed: true }, profile({ role: 'admin' }), true)).toBe('admin')
  })
  it('rejects forged ownership ids', () => {
    expect(() => ownershipUserId('user-a', 'user-b')).toThrow('Ownership violation')
    expect(ownershipUserId('user-a')).toBe('user-a')
  })
  it('holds a one-time password user on the set-password screen', () => {
    const invited = profile({ mustChangePassword: true })
    expect(needsPasswordChange(invited)).toBe(true)
    expect(decideRoute('/', activeSession, invited, true)).toBe('password')
    expect(decideRoute('/admin', activeSession, profile({ mustChangePassword: true, role: 'admin' }), true)).toBe('password')
    expect(decideRoute('/', activeSession, profile(), true)).toBe('app')
  })
  it('requires a long, matching password', () => {
    expect(passwordProblem('short', 'short')).toBe('Use at least 8 characters.')
    expect(passwordProblem('longenough', 'different')).toBe('Both passwords must match.')
    expect(passwordProblem('longenough', 'longenough')).toBeNull()
  })
  it('reads the message an Edge Function returns with a failing status', async () => {
    const failure = { context: { json: async () => ({ ok: false, message: 'Email delivery is not configured.' }) } }
    expect(await functionErrorBody(failure)).toEqual({ ok: false, message: 'Email delivery is not configured.' })
    expect(await functionErrorBody(new Error('network'))).toBeNull()
    expect(await functionErrorBody({ context: { json: async () => { throw new Error('not json') } } })).toBeNull()
  })
  it('exposes explicit auth states', () => {
    expect(authStatusFrom(true, null, null, null)).toBe('loading')
    expect(authStatusFrom(false, null, null, null)).toBe('unauthenticated')
    expect(authStatusFrom(false, { userId: 'a', email: 'a@example.com', emailConfirmed: true }, profile(), null)).toBe('authenticated')
    expect(authStatusFrom(false, { userId: 'a', email: 'a@example.com', emailConfirmed: true }, profile({ status: 'suspended' }), null)).toBe('suspended')
    expect(authStatusFrom(false, null, null, 'fail')).toBe('error')
  })
})

describe('invitations', () => {
  const invite = (overrides: Partial<InvitationRecord> = {}): InvitationRecord => ({
    id: '1', email: 'new@example.com', tokenHash: 'abc', invitedBy: 'admin',
    expiresAt: expiresAtFrom(72), acceptedAt: null, revokedAt: null, createdAt: new Date().toISOString(), ...overrides,
  })

  it('expires after the deadline', () => {
    expect(invitationState(invite({ expiresAt: new Date(Date.now() - 1000).toISOString() }))).toBe('expired')
  })

  it('labels an invitation for the admin table', () => {
    expect(invitationStatusLabel(invite())).toBe('Awaiting first sign-in')
    expect(invitationStatusLabel(invite({ acceptedAt: new Date().toISOString() }))).toBe('Accepted')
    expect(invitationStatusLabel(invite({ revokedAt: new Date().toISOString() }))).toBe('Revoked')
    expect(invitationStatusLabel(invite({ expiresAt: new Date(Date.now() - 1000).toISOString() }))).toBe('Expired')
  })

  it('rejects revoked invitations', () => {
    expect(invitationState(invite({ revokedAt: new Date().toISOString() }))).toBe('revoked')
    expect(canAcceptInvitation(invite({ revokedAt: new Date().toISOString() }), 'new@example.com', 'abc').ok).toBe(false)
  })

  it('can be used only once', () => {
    const accepted = markAccepted(invite(), new Date().toISOString())
    expect(invitationState(accepted)).toBe('used')
    expect(() => markAccepted(accepted, new Date().toISOString())).toThrow('Invitation already used')
  })

  it('does not reveal whether an email exists', async () => {
    const token = generateInviteToken()
    const hash = await hashInviteToken(token)
    const result = canAcceptInvitation(invite({ tokenHash: hash }), 'other@example.com', hash)
    expect(result).toEqual({ ok: false, reason: 'generic' })
    expect(canAcceptInvitation(null, 'new@example.com', hash).reason).toBe('generic')
  })

  it('rate-limits invitation attempts', () => {
    expect(isRateLimited(8, 8, Date.now() - 1000)).toBe(true)
    expect(isRateLimited(2, 8, Date.now() - 1000)).toBe(false)
  })
})
