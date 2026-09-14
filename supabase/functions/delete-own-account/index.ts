import { corsHeaders, json, serviceClient, userClient } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const auth = userClient(req)
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return json({ ok: false, message: 'Unauthorized' }, 401)
  const admin = serviceClient()
  await admin.from('audit_logs').insert({ actor_id: user.id, event: 'user_deleted', target_email: user.email })
  await admin.auth.admin.deleteUser(user.id)
  return json({ ok: true })
})
