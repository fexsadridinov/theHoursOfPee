import { bumpRateLimit, corsHeaders, generic, hashToken, json, serviceClient, userClient } from '../_shared/http.ts'
import { mailConfigured, oneTimePassword, sendMail } from '../_shared/mail.ts'

const appOrigin = () => (Deno.env.get('APP_URL') ?? '').trim().replace(/\/$/, '')

const inviteBody = (origin: string, password: string) => [
  'You have been invited to the Hours of Pee, a private activity and placement hours tracker.',
  '',
  `Sign in: ${origin || 'ask your administrator for the site address'}`,
  `One-time password: ${password}`,
  '',
  'This password works once. As soon as you sign in you will be asked to choose your own password.',
  'Do not share this email. Use anonymous client labels only inside the workspace.',
].join('\n')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = userClient(req)
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return json({ ok: false, message: 'Unauthorized' }, 401)
    const admin = serviceClient()
    const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single()
    if (!profile || profile.role !== 'admin' || profile.status !== 'active') return json({ ok: false, message: 'Unauthorized' }, 403)
    if (await bumpRateLimit(`invite:${user.id}`, 8)) return json({ ok: false, message: 'Too many invitations for now. Try again later.' }, 429)

    const body = await req.json() as { email?: string, action?: string, invitationId?: string }
    const action = body.action ?? 'create'

    if (action === 'revoke') {
      if (!body.invitationId) return json({ ok: false, message: 'Invalid request' }, 400)
      const { data: existing } = await admin.from('invitations').select('*').eq('id', body.invitationId).maybeSingle()
      if (!existing || existing.accepted_at) return json({ ok: false, message: 'That invitation can no longer be revoked.' }, 400)
      await admin.from('invitations').update({ revoked_at: new Date().toISOString() }).eq('id', existing.id)
      // The one-time password must stop working, so suspend an account that never chose its own password.
      await admin.from('profiles').update({ status: 'suspended' })
        .eq('email', existing.email).eq('must_change_password', true)
      await admin.from('audit_logs').insert({
        actor_id: user.id, event: 'invitation_revoked', target_email: existing.email,
        metadata: { invitationId: existing.id },
      })
      return json({ ok: true, emailed: false, message: 'Invitation revoked. The one-time password no longer works.' })
    }

    const normalized = String(body.email ?? '').trim().toLowerCase()
    if (!normalized || !normalized.includes('@')) return generic()

    const origin = appOrigin()
    if (!mailConfigured()) {
      return json({
        ok: false,
        emailed: false,
        message: 'Email delivery is not configured, so no invitation was created. Set SMTP_USERNAME, SMTP_PASSWORD, INVITE_FROM_EMAIL, and APP_URL on this function first.',
      }, 503)
    }

    const password = oneTimePassword()
    const { data: existingProfile } = await admin.from('profiles').select('id, status').eq('email', normalized).maybeSingle()
    let userId = existingProfile?.id as string | undefined

    if (userId) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true })
      if (error) return generic(500)
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: normalized,
        password,
        email_confirm: true,
      })
      if (error || !created.user) return generic(500)
      userId = created.user.id
    }

    await admin.from('profiles')
      .update({ must_change_password: true, status: 'active' })
      .eq('id', userId)

    if (action === 'replace' && body.invitationId) {
      await admin.from('invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', body.invitationId).is('accepted_at', null)
      await admin.from('audit_logs').insert({
        actor_id: user.id, event: 'invitation_replaced', target_email: normalized,
        metadata: { invitationId: body.invitationId },
      })
    }

    const hours = Number(Deno.env.get('INVITE_EXPIRATION_HOURS') ?? 72)
    const { data: invitation } = await admin.from('invitations').insert({
      email: normalized,
      token_hash: await hashToken(password),
      invited_by: user.id,
      expires_at: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
    }).select('id').single()
    await admin.from('audit_logs').insert({ actor_id: user.id, event: 'invitation_created', target_email: normalized })

    const emailed = await sendMail(normalized, 'Your invitation to the Hours of Pee', inviteBody(origin, password))
    if (!emailed) {
      // Nobody knows the password if the email failed, so close the invitation instead of leaving a usable account.
      if (invitation?.id) await admin.from('invitations').update({ revoked_at: new Date().toISOString() }).eq('id', invitation.id)
      await admin.from('profiles').update({ status: 'suspended' }).eq('id', userId)
      return json({
        ok: false,
        emailed: false,
        message: 'The invitation email could not be sent, so the invitation was revoked. Check the SMTP credentials and try again.',
      }, 502)
    }

    return json({
      ok: true,
      emailed: true,
      message: `Invitation emailed to ${normalized}. They sign in with the one-time password and then choose their own.`,
    })
  } catch {
    return generic(500)
  }
})
