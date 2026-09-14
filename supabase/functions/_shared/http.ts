import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

export const generic = (status = 400) => json({ ok: false, message: 'If this invitation is valid, you can continue.' }, status)

export const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export const serviceClient = () => {
  const url = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('SB_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !key) throw new Error('Server is not configured')
  return createClient(url, key)
}

export const userClient = (req: Request) => {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  return createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
}

export const bumpRateLimit = async (key: string, limit: number) => {
  const supabase = serviceClient()
  const { data } = await supabase.from('rate_limits').select('*').eq('key', key).maybeSingle()
  const now = Date.now()
  const hour = 60 * 60 * 1000
  if (!data || now - new Date(data.window_start).getTime() >= hour) {
    await supabase.from('rate_limits').upsert({ key, window_start: new Date().toISOString(), count: 1 })
    return false
  }
  if (data.count >= limit) return true
  await supabase.from('rate_limits').update({ count: data.count + 1 }).eq('key', key)
  return false
}
