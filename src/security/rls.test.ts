import { describe, expect, it } from 'vitest'
import sql from '../../supabase/migrations/202609140001_multiuser_rls.sql?raw'
import indexes from '../../supabase/migrations/202609150001_indexes_invites_status.sql?raw'
import hoursOnly from '../../supabase/migrations/202609150004_hours_only_activities.sql?raw'

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

  it('indexes ownership columns and requires related-row ownership', () => {
    expect(indexes).toContain('activities_user_date_idx')
    expect(indexes).toContain('invitations_token_hash_idx')
    expect(indexes).toContain('experience_supervisors_related')
    expect(indexes).toContain('revoked_at')
  })
})

describe('hours-only migration', () => {
  it('stops requiring the columns the app no longer writes', () => {
    expect(hoursOnly).toContain('alter column experience_id drop not null')
    expect(hoursOnly).toContain('alter column status drop not null')
  })

  it('does not drop columns, so existing rows keep their history', () => {
    expect(hoursOnly).not.toMatch(/drop column|drop table/i)
  })
})
