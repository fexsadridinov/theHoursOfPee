import { getAppOrigin } from './auth/origin'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
export const appUrl = getAppOrigin()
export const inviteExpirationHours = Number(import.meta.env.VITE_INVITE_EXPIRATION_HOURS ?? 72)

export const isRemoteConfigured = () => Boolean(supabaseUrl && supabaseAnonKey)

export const requireHttpsInProduction = () => {
  if (typeof window === 'undefined' || import.meta.env.DEV) return
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    throw new Error('HTTPS is required in production.')
  }
}
