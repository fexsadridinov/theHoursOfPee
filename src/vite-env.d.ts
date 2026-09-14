/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_APP_URL?: string
  readonly VITE_INVITE_EXPIRATION_HOURS?: string
}

declare module '*.sql?raw' {
  const contents: string
  export default contents
}


