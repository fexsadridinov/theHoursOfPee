import { describe, expect, it } from 'vitest'
import { seedData } from './data'
import {
  activitiesForLog, activityReportKey, listReportLogs, prettyDateRange, reportLogKey, reportTitle,
  resolveTraineeName,
} from './report'

describe('report logs', () => {
  it('keeps each placement and supervisor as its own log', () => {
    const logs = listReportLogs(seedData)
    expect(logs.map(log => `${log.placementName} · ${log.supervisorName}`)).toEqual([
      'Lincoln High School · Jordan Lee',
      'Riverside Clinic · Dr. Maya Chen',
    ])
    const riverside = logs.find(log => log.placementId === 'place-riverside')
    expect(riverside).toBeTruthy()
    const rows = activitiesForLog(seedData, riverside)
    expect(rows.every(item => activityReportKey(item, seedData) === riverside!.key)).toBe(true)
    expect(rows.some(item => item.placementId === 'place-school')).toBe(false)
  })

  it('formats compact date ranges', () => {
    expect(prettyDateRange('2026-09-14', '2026-09-14')).toBe('September 14, 2026')
    expect(prettyDateRange('2026-09-14', '2026-10-02')).toBe('September 14 – October 2, 2026')
    expect(reportLogKey('place-riverside', 'sup-maya')).toBe('place-riverside::sup-maya')
    expect(reportTitle('Kaining Liu')).toBe('Kaining Liu — Activity Summary')
  })

  it('uses the logged-in display name on reports', () => {
    expect(resolveTraineeName('Kaining Liu', 'kaining@example.com')).toBe('Kaining Liu')
    expect(resolveTraineeName('kaining@example.com', 'kaining@example.com')).toBe('kaining')
    expect(resolveTraineeName('', 'yiwen@clinic.org')).toBe('yiwen')
  })
})
