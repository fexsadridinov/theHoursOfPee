import { formatHours, hoursFromMinutes } from './calculations'
import { catalogTypes, defaultDictionaries, defaultPlacements, ensurePlacements, itemName, migrateToCurrent, placementName, SCHEMA_VERSION } from './dictionaries'
import type { Activity, AppData } from './types'

export const STORAGE_KEY = 'the-hours-of-pee:v1'

const localDate = (offset: number) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toLocaleDateString('en-CA')
}

const activity = (id: string, offset: number, hours: number, activityTypeId: string, placementId: string, supervisorId: string, notes: string): Activity => ({
  id, date: localDate(offset), durationMinutes: Math.round(hours * 60), activityTypeId, placementId, supervisorId, notes,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
})

export const seedData: AppData = {
  schemaVersion: SCHEMA_VERSION,
  dictionaries: defaultDictionaries(),
  activityTypes: catalogTypes(),
  placements: defaultPlacements(),
  activities: [
    activity('a1', 0, 1.5, 'direct-individual', 'place-riverside', 'sup-maya', 'Individual session'),
    activity('a2', 0, 0.5, 'indirect-records', 'place-riverside', 'sup-maya', 'Session notes'),
    activity('a3', -1, 1, 'supervision-individual', 'place-school', 'sup-jordan', 'Weekly supervision'),
    activity('a4', -2, 2, 'direct-group', 'place-school', 'sup-jordan', 'Group workshop'),
    activity('a5', -3, 0.75, 'indirect-research', 'place-riverside', '', 'Assessment write-up'),
    activity('a6', -7, 3, 'indirect-outreach', 'place-riverside', 'sup-maya', 'Community outreach'),
  ],
}

export const isValidBackup = (value: unknown): value is {
  schemaVersion: number
  activities: AppData['activities']
  activityTypes?: AppData['activityTypes']
  placements?: AppData['placements']
  dictionaries?: Partial<AppData['dictionaries']>
} => {
  if (!value || typeof value !== 'object') return false
  const data = value as AppData
  return [1, 2, 3, 4, SCHEMA_VERSION].includes(data.schemaVersion) && Array.isArray(data.activities)
}

export const migrate = (raw: unknown): AppData => {
  if (!isValidBackup(raw)) throw new Error('Invalid backup')
  return ensurePlacements(migrateToCurrent(raw))
}

export const loadData = (): AppData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return structuredClone(seedData)
    return migrate(JSON.parse(stored))
  } catch {
    return structuredClone(seedData)
  }
}

export const saveData = (data: AppData) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data))

export const resetData = () => {
  localStorage.removeItem(STORAGE_KEY)
  return structuredClone(seedData)
}

export const download = (name: string, contents: string, type: string) => {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export const toCsv = (data: AppData, activities = data.activities) => {
  const types = new Map(data.activityTypes.map(type => [type.id, type]))
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const header = ['Date', 'Hours', 'Category', 'Activity', 'Placement', 'Site', 'Supervisor', 'Notes']
  return [header, ...[...activities].sort((a, b) => a.date.localeCompare(b.date)).map(item => [
    item.date,
    hoursFromMinutes(item.durationMinutes),
    types.get(item.activityTypeId)?.category ?? '',
    types.get(item.activityTypeId)?.name ?? '',
    placementName(data.placements, item.placementId, ''),
    data.placements.find(placement => placement.id === item.placementId)?.site ?? '',
    itemName(data.dictionaries.supervisors, item.supervisorId),
    item.notes,
  ])].map(row => row.map(escape).join(',')).join('\n')
}

export const exportJson = (data: AppData) => JSON.stringify({
  schemaVersion: data.schemaVersion,
  exportedAt: new Date().toISOString(),
  totalHours: hoursFromMinutes(data.activities.reduce((sum, item) => sum + item.durationMinutes, 0)),
  activities: data.activities.map(item => ({
    ...item,
    hours: hoursFromMinutes(item.durationMinutes),
  })),
  activityTypes: data.activityTypes,
  placements: data.placements,
  dictionaries: data.dictionaries,
}, null, 2)

export const summaryLine = (data: AppData) =>
  `${data.activities.length} entries · ${formatHours(data.activities.reduce((sum, item) => sum + item.durationMinutes, 0))}`

export const hasStoredLocalData = () => {
  try { return Boolean(localStorage.getItem(STORAGE_KEY)) } catch { return false }
}
