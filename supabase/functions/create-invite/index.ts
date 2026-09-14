import { bumpRateLimit, corsHeaders, generic, hashToken, json, serviceClient, userClient } from '../_shared/http.ts'

const appOrigin = () => (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')

const sendInviteEmail = async (to: string, inviteUrl: string) => {
  const resend = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('INVITE_FROM_EMAIL')
  if (!resend || !from) return false
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Your invitation to the Hours of Pee',
      text: `You were invited to the Hours of Pee. Open this link to create your account: ${inviteUrl}`,
    }),
  })
  return response.ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = userClient(req)
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return json({ ok: false, message: 'Unauthorized' }, 401)
    const { data: profile } = await serviceClient().from('profiles').select('*').eq('id', user.id).single()
    if (!profile || profile.role !== 'admin' || profile.status !== 'active') return json({ ok: false, message: 'Unauthorized' }, 403)
    if (await bumpRateLimit(`invite:${user.id}`, 8)) return json({ ok: false, message: 'Try again later.' }, 429)

    const body = await req.json() as { email?: string, action?: string, invitationId?: string }
    const action = body.action ?? 'create'
    const admin = serviceClient()

    if (action === 'revoke') {
      if (!body.invitationId) return json({ ok: false, message: 'Invalid request' }, 400)
      const { data: existing } = await admin.from('invitations').select('*').eq('id', body.invitationId).maybeSingle()
      if (!existing || existing.accepted_at) return json({ ok: false, message: 'Invalid request' }, 400)
      await admin.from('invitations').update({ revoked_at: new Date().toISOString() }).eq('id', existing.id)
      await admin.from('audit_logs').insert({ actor_id: user.id, event: 'invitation_revoked', target_email: existing.email, metadata: { invitationId: existing.id } })
      return json({ ok: true, emailed: false, message: 'Invitation revoked.' })
    }

    const normalized = String(body.email ?? '').trim().toLowerCase()
    if (!normalized || !normalized.includes('@')) return generic()

    if (action === 'replace' && body.invitationId) {
      await admin.from('invitations').update({ revoked_at: new Date().toISOString() }).eq('id', body.invitationId).is('accepted_at', null)
      await admin.from('audit_logs').insert({ actor_id: user.id, event: 'invitation_replaced', target_email: normalized, metadata: { invitationId: body.invitationId } })
    }

    const hours = Number(Deno.env.get('INVITE_EXPIRATION_HOURS') ?? 72)
    const tokenBytes = new Uint8Array(32)
    crypto.getRandomValues(tokenBytes)
    const token = [...tokenBytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
    const token_hash = await hashToken(token)
    const expires_at = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    await admin.from('invitations').insert({ email: normalized, token_hash, invited_by: user.id, expires_at })
    await admin.from('audit_logs').insert({ actor_id: user.id, event: 'invitation_created', target_email: normalized })

    const origin = appOrigin()
    const inviteUrl = origin ? `${origin}/invite?email=${encodeURIComponent(normalized)}&token=${token}` : ''
    const emailed = origin ? await sendInviteEmail(normalized, inviteUrl) : false
    const message = emailed
      ? 'Invitation created and emailed.'
      : 'Invitation created. Email delivery is not configured. Set RESEND_API_KEY, INVITE_FROM_EMAIL, and APP_URL on the Edge Function. The invite link was not emailed and is not shown here.'
    return json({ ok: true, emailed, message })
  } catch {
    return generic(500)
  }
})
