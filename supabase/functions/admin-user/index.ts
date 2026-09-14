import { corsHeaders, json, serviceClient, userClient } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = userClient(req)
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return json({ ok: false, message: 'Unauthorized' }, 401)
    const admin = serviceClient()
    const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single()
    if (!profile || profile.role !== 'admin' || profile.status !== 'active') return json({ ok: false, message: 'Unauthorized' }, 403)
    const { action, userId } = await req.json() as { action?: string, userId?: string }
    if (!action || !userId || userId === user.id) return json({ ok: false, message: 'Invalid request' }, 400)
    if (action === 'suspend') {
      await admin.from('profiles').update({ status: 'suspended' }).eq('id', userId)
      await admin.from('audit_logs').insert({ actor_id: user.id, event: 'user_suspended', metadata: { userId } })
    } else if (action === 'reactivate') {
      await admin.from('profiles').update({ status: 'active' }).eq('id', userId)
      await admin.from('audit_logs').insert({ actor_id: user.id, event: 'user_reactivated', metadata: { userId } })
    } else if (action === 'delete') {
      await admin.auth.admin.deleteUser(userId)
      await admin.from('audit_logs').insert({ actor_id: user.id, event: 'user_deleted', metadata: { userId } })
    } else {
      return json({ ok: false, message: 'Invalid request' }, 400)
    }
    return json({ ok: true })
  } catch {
    return json({ ok: false, message: 'Unable to complete that request.' }, 500)
  }
})
