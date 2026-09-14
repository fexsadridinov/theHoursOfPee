import { describe, expect, it } from 'vitest'
import { completedMinutes, formatDuration, inDateRange, sumMinutes } from './calculations'
import type { Activity } from './types'

const item = (status: Activity['status'], minutes: number): Activity => ({
  id: crypto.randomUUID(), date: '2026-09-14', startTime: '09:00', durationMinutes: minutes,
  activityTypeId: 'type', experienceId: 'exp', supervisorId: '', termId: '', setting: '', client: '',
  status, tagIds: [], notes: '', createdAt: '', updatedAt: '',
})

describe('central calculations', () => {
  it('preserves integer minute totals', () => expect(sumMinutes([item('confirmed', 45), item('approved', 50)])).toBe(95))
  it('only includes confirmed and approved work', () => expect(completedMinutes([item('scheduled', 60), item('unconfirmed', 30), item('confirmed', 45), item('approved', 15)])).toBe(60))
  it('formats durations', () => expect(formatDuration(90)).toBe('1h 30m'))
  it('includes both date boundaries', () => expect(inDateRange('2026-09-14', '2026-09-14', '2026-09-14')).toBe(true))
})
