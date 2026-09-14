import { bumpRateLimit, corsHeaders, generic, hashToken, json, serviceClient } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
    if (await bumpRateLimit(`accept:${ip}`, 10)) return generic(429)
    const { email, password, token, displayName } = await req.json() as { email?: string, password?: string, token?: string, displayName?: string }
    const normalized = String(email ?? '').trim().toLowerCase()
    if (!normalized || !password || !token) return generic()
    const token_hash = await hashToken(token)
    const admin = serviceClient()
    const { data: invite } = await admin.from('invitations').select('*').eq('token_hash', token_hash).maybeSingle()
    if (!invite || invite.email !== normalized || invite.accepted_at || invite.revoked_at) {
      return generic()
    }
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      return json({ ok: false, reason: 'expired', message: 'This invitation has expired. Ask an administrator for a new invitation.' }, 400)
    }
    const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
    const { data, error } = await admin.auth.admin.createUser({
      email: normalized,
      password,
      email_confirm: false,
      user_metadata: { display_name: displayName ?? '' },
    })
    if (error || !data.user) return generic()
    await admin.from('profiles').update({ display_name: displayName ?? '' }).eq('id', data.user.id)
    await admin.from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id)
    await admin.from('audit_logs').insert({ actor_id: data.user.id, event: 'invitation_accepted', target_email: normalized })
    if (appUrl) {
      await admin.auth.admin.generateLink({
        type: 'signup',
        email: normalized,
        options: { redirectTo: `${appUrl}/auth/callback` },
      })
    }
    return json({ ok: true, message: 'Check your email to confirm the account, then sign in.' })
  } catch {
    return generic(500)
  }
})
