import { describe, expect, it } from 'vitest'
import sql from '../../supabase/migrations/202609140001_multiuser_rls.sql?raw'

describe('RLS migration', () => {
  it('enables RLS and ownership checks on user data', () => {
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('user_id = auth.uid()')
    expect(sql).toContain('public.is_active_user()')
    expect(sql).toContain('public.is_admin()')
  })

  it('keeps invitation tokens hashed and rate limits server-side', () => {
    expect(sql).toContain('token_hash')
    expect(sql).toContain('rate_limits')
    expect(sql).not.toMatch(/VITE_.*SERVICE_ROLE/)
  })
})
