import { describe, expect, it } from 'vitest'
import {
  categoryMinutes, formatHours, formatHoursFixed, groupMinutes, hoursFromMinutes, inDateRange, minutesFromHours, parseHours, sumMinutes, totalMinutes,
} from './calculations'
import { catalogTypes } from './dictionaries'
import type { Activity } from './types'

const item = (minutes: number, activityTypeId = 'direct-individual'): Activity => ({
  id: crypto.randomUUID(), date: '2026-09-14', durationMinutes: minutes, activityTypeId,
  placementId: 'place-riverside', supervisorId: '', notes: '', createdAt: '', updatedAt: '',
})

describe('hour calculations', () => {
  it('keeps quarter hours exact through the hours-to-minutes round trip', () => {
    expect(minutesFromHours(1.5)).toBe(90)
    expect(minutesFromHours(0.25)).toBe(15)
    expect(hoursFromMinutes(minutesFromHours(2.75))).toBe(2.75)
  })

  it('totals every entry, with no status to exclude', () => {
    expect(totalMinutes([item(45), item(50)])).toBe(95)
    expect(sumMinutes([item(60), item(30)], activity => activity.durationMinutes > 45)).toBe(60)
  })

  it('formats minutes as hours', () => {
    expect(formatHours(90)).toBe('1.5 h')
    expect(formatHours(60)).toBe('1 h')
    expect(formatHours(45)).toBe('0.75 h')
    expect(formatHours(0)).toBe('0 h')
    expect(formatHoursFixed(90)).toBe('1.50')
  })

  it('reads hours typed with a comma or extra space', () => {
    expect(parseHours('1.5')).toBe(1.5)
    expect(parseHours(' 2,25 ')).toBe(2.25)
    expect(parseHours('0')).toBeNull()
    expect(parseHours('hours')).toBeNull()
  })

  it('splits hours into direct, indirect, and supervision', () => {
    const split = categoryMinutes([
      item(60, 'direct-individual'), item(30, 'indirect-records'),
      item(45, 'supervision-individual'), item(30, 'unknown-type'),
    ], catalogTypes())
    expect(split).toEqual({ direct: 60, indirect: 60, supervision: 45 })
  })

  it('groups by any key', () => {
    expect(groupMinutes([item(60), item(30)], activity => activity.activityTypeId)).toEqual({ 'direct-individual': 90 })
  })

  it('includes both date boundaries', () => expect(inDateRange('2026-09-14', '2026-09-14', '2026-09-14')).toBe(true))
})
