const FALLBACK_DEV_ORIGIN = 'http://localhost:5173'

export const getAppOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '')
  }
  const fromEnv = (import.meta.env.VITE_APP_URL ?? '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (import.meta.env.DEV) return FALLBACK_DEV_ORIGIN
  return ''
}

export const authRedirectUrl = (path: string) => `${getAppOrigin()}${path.startsWith('/') ? path : `/${path}`}`

export const safeInternalPath = (value: string | null | undefined, fallback = '/') => {
  if (!value) return fallback
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) return fallback
  if (trimmed.includes('://')) return fallback
  return trimmed
}
