import { categoryMinutes, formatHoursFixed, sumMinutes } from './calculations'
import { download } from './data'
import { CATEGORY_ORDER, categoryLabel, itemName, kindsFor, placementName, placementOf, resolveKindId } from './dictionaries'
import type { Activity, AppData } from './types'

export const CSV_MIME = 'text/csv;charset=utf-8'

const typeOf = (data: AppData, id: string) => data.activityTypes.find(type => type.id === resolveKindId(id, data.activityTypes))

export const TRAINEE_NAME_KEY = 'the-hours-of-pee:trainee-name'
export const DEFAULT_TRAINEE_NAME = 'Trainee'

export type ReportLog = {
  key: string
  placementId: string
  supervisorId: string
  placementName: string
  site: string
  supervisorName: string
}

export const reportLogKey = (placementId: string, supervisorId: string) => `${placementId}::${supervisorId}`

export const activityReportKey = (activity: Activity, data: AppData) => {
  const placement = placementOf(data.placements, activity.placementId)
  return reportLogKey(activity.placementId, activity.supervisorId || placement?.supervisorId || '')
}

export const listReportLogs = (data: AppData): ReportLog[] => {
  const logs = new Map<string, ReportLog>()
  const remember = (placementId: string, supervisorId: string) => {
    const key = reportLogKey(placementId, supervisorId)
    if (logs.has(key)) return
    const placement = placementOf(data.placements, placementId)
    logs.set(key, {
      key,
      placementId,
      supervisorId,
      placementName: placement?.name || (placementId ? placementName(data.placements, placementId) : 'Unassigned'),
      site: placement?.site ?? '',
      supervisorName: itemName(data.dictionaries.supervisors, supervisorId, supervisorId ? 'Unknown supervisor' : 'No supervisor'),
    })
  }
  for (const placement of data.placements) remember(placement.id, placement.supervisorId)
  for (const activity of data.activities) {
    const placement = placementOf(data.placements, activity.placementId)
    remember(activity.placementId, activity.supervisorId || placement?.supervisorId || '')
  }
  return [...logs.values()].sort((a, b) => a.placementName.localeCompare(b.placementName) || a.supervisorName.localeCompare(b.supervisorName))
}

export const activitiesForLog = (data: AppData, log: ReportLog | undefined) => {
  if (!log) return []
  return data.activities.filter(item => activityReportKey(item, data) === log.key)
}

export const prettyDateRange = (from: string, to: string) => {
  if (!from && !to) return ''
  if (!to || from === to) return longDateUs(from || to)
  const start = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${from} to ${to}`
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, ${start.getFullYear()}`
  }
  return `${longDateUs(from)} – ${longDateUs(to)}`
}

export const longDateUs = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

export const fileSlug = (value: string) =>
  value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || DEFAULT_TRAINEE_NAME

export const timeLogFileBase = (traineeName: string, from: string, to: string) =>
  `${fileSlug(traineeName || DEFAULT_TRAINEE_NAME)}_TimeLog_${from}_to_${to}`

export type TimeLogMeta = {
  traineeName: string
  placementName: string
  supervisorName: string
  site?: string
  from: string
  to: string
}

export const reportTitle = (traineeName: string) =>
  `${(traineeName || DEFAULT_TRAINEE_NAME).trim()} — Activity Summary`

const csvEscape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
const csvLine = (cells: unknown[]) => cells.map(csvEscape).join(',')

export const buildTimeLogCsv = (data: AppData, activities: Activity[], meta: TimeLogMeta) => {
  const rows = [...activities].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  const split = categoryMinutes(rows, data.activityTypes)
  const header = [
    reportTitle(meta.traineeName),
    `Placement: ${meta.placementName || 'Unassigned'}`,
    `Supervisor: ${meta.supervisorName || 'No supervisor'}`,
    `Date range: ${prettyDateRange(meta.from, meta.to)}`,
    meta.site ? `Site: ${meta.site}` : '',
    `Entries: ${rows.length}`,
    `Total hours: ${formatHoursFixed(sumMinutes(rows))}`,
    ...CATEGORY_ORDER.map(category => `${categoryLabel(category)} hours: ${formatHoursFixed(split[category] ?? 0)}`),
  ].filter(Boolean)

  const table = [
    csvLine(['Date', 'Hours', 'Category', 'Activity', 'Notes']),
    ...rows.map(item => {
      const kind = typeOf(data, item.activityTypeId)
      return csvLine([
        item.date,
        formatHoursFixed(item.durationMinutes),
        kind ? categoryLabel(kind.category) : '',
        kind?.name ?? '',
        item.notes,
      ])
    }),
  ]

  const byType = [
    csvLine(['Category', 'Activity', 'Hours']),
    ...CATEGORY_ORDER.flatMap(category => {
      const kinds = kindsFor(category)
        .map(kind => ({ kind, minutes: sumMinutes(rows, item => item.activityTypeId === kind.id) }))
        .filter(row => row.minutes > 0)
      return kinds.map(row => csvLine([categoryLabel(category), row.kind.name, formatHoursFixed(row.minutes)]))
    }),
  ]

  return `\uFEFF${[...header, '', ...table, '', 'Hours by type', ...byType].join('\n')}\n`
}

export const readTraineeName = (fallback = DEFAULT_TRAINEE_NAME) => {
  try {
    const stored = localStorage.getItem(TRAINEE_NAME_KEY)?.trim()
    if (stored) return stored
  } catch { /* ignore */ }
  return fallback
}

export const writeTraineeName = (name: string) => {
  try { localStorage.setItem(TRAINEE_NAME_KEY, name.trim()) } catch { /* ignore */ }
}

export const resolveTraineeName = (displayName?: string | null) => {
  const named = displayName?.trim()
  if (named && !named.includes('@')) return named
  return readTraineeName(DEFAULT_TRAINEE_NAME)
}

export const downloadTimeLog = (fileBase: string, csv: string) =>
  download(`${fileBase}.csv`, csv, CSV_MIME)

export const printTimeLog = (fileBase: string) => {
  const previous = document.title
  document.title = fileBase
  const restore = () => {
    document.title = previous
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)
  requestAnimationFrame(() => window.print())
}
