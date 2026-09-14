import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from '../config'

let client: SupabaseClient | null = null

export const getSupabase = () => {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Remote mode is not configured.')
  client ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return client
}
