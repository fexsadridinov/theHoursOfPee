import { bumpRateLimit, corsHeaders, generic, hashToken, json, serviceClient, userClient } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = userClient(req)
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return json({ ok: false, message: 'Unauthorized' }, 401)
    const { data: profile } = await serviceClient().from('profiles').select('*').eq('id', user.id).single()
    if (!profile || profile.role !== 'admin' || profile.status !== 'active') return json({ ok: false, message: 'Unauthorized' }, 403)
    if (await bumpRateLimit(`invite:${user.id}`, 8)) return json({ ok: false, message: 'Try again later.' }, 429)

    const { email } = await req.json() as { email?: string }
    const normalized = String(email ?? '').trim().toLowerCase()
    if (!normalized || !normalized.includes('@')) return generic()

    const hours = Number(Deno.env.get('INVITE_EXPIRATION_HOURS') ?? 72)
    const tokenBytes = new Uint8Array(32)
    crypto.getRandomValues(tokenBytes)
    const token = [...tokenBytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
    const token_hash = await hashToken(token)
    const expires_at = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    const admin = serviceClient()
    await admin.from('invitations').insert({ email: normalized, token_hash, invited_by: user.id, expires_at })
    await admin.from('audit_logs').insert({ actor_id: user.id, event: 'invitation_created', target_email: normalized })

    const appUrl = Deno.env.get('APP_URL') ?? ''
    const inviteUrl = `${appUrl}/invite?email=${encodeURIComponent(normalized)}&token=${token}`
    const resend = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('INVITE_FROM_EMAIL') ?? 'noreply@localhost'
    if (resend) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [normalized],
          subject: 'Your invitation to the Hours of Pee',
          text: `You were invited to the Hours of Pee. Open this link to create your account: ${inviteUrl}`,
        }),
      })
    }

    return json({ ok: true, message: 'If that address can be invited, an email was sent.' })
  } catch {
    return generic(500)
  }
})
