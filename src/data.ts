import { defaultDictionaries, itemName, migrateToCurrent, SCHEMA_VERSION } from './dictionaries'
import type { Activity, AppData } from './types'

export const STORAGE_KEY = 'the-hours-of-pee:v1'

const localDate = (offset: number) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toLocaleDateString('en-CA')
}

const activity = (id: string, offset: number, startTime: string, durationMinutes: number, activityTypeId: string, experienceId: string, status: Activity['status'], notes: string, client = '', extraTagIds: string[] = []): Activity => ({
  id, date: localDate(offset), startTime, durationMinutes, activityTypeId, experienceId,
  supervisorId: experienceId === 'exp-clinic' ? 'sup-maya' : 'sup-jordan',
  termId: offset <= -10 ? 'term-summer-26' : 'term-fall-26',
  setting: experienceId === 'exp-clinic' ? 'Community clinic' : 'University',
  client, status, tagIds: [...(client ? ['tag-client'] : []), ...extraTagIds],
  notes, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
})

export const seedData: AppData = {
  schemaVersion: SCHEMA_VERSION,
  dictionaries: defaultDictionaries(),
  activityTypes: [
    { id: 'type-direct', name: 'Direct practice', shortName: 'Direct', domainId: 'dom-practice', color: '#42564b', defaultDuration: 60, category: 'direct', active: true },
    { id: 'type-notes', name: 'Documentation', shortName: 'Notes', domainId: 'dom-admin', color: '#a05d42', defaultDuration: 30, category: 'indirect', active: true },
    { id: 'type-supervision', name: 'Supervision', shortName: 'Supervision', domainId: 'dom-growth', color: '#857754', defaultDuration: 60, category: 'supervision', active: true },
    { id: 'type-training', name: 'Training & research', shortName: 'Training', domainId: 'dom-learning', color: '#586d7d', defaultDuration: 90, category: 'indirect', active: true },
  ],
  experiences: [
    { id: 'exp-clinic', name: 'Community placement', organization: 'Riverside Wellbeing', setting: 'Community clinic', organizationTypeId: 'org-community', trainingLevelId: 'lvl-practicum', termId: 'term-fall-26', targetMinutes: 18000, startDate: localDate(-80), endDate: localDate(150), active: true },
    { id: 'exp-campus', name: 'Campus practicum', organization: 'North Hall Centre', setting: 'University', organizationTypeId: 'org-university', trainingLevelId: 'lvl-practicum', termId: 'term-fall-26', targetMinutes: 9000, startDate: localDate(-50), endDate: localDate(90), active: true },
  ],
  activities: [
    activity('a1', 0, '09:00', 90, 'type-direct', 'exp-clinic', 'confirmed', 'Individual session', 'Client 014'),
    activity('a2', 0, '11:00', 30, 'type-notes', 'exp-clinic', 'confirmed', 'Session notes'),
    activity('a3', -1, '14:00', 60, 'type-supervision', 'exp-clinic', 'approved', 'Weekly supervision'),
    activity('a4', -2, '10:00', 120, 'type-direct', 'exp-campus', 'confirmed', 'Group workshop', 'Group 03', ['tag-group']),
    activity('a5', -3, '13:30', 45, 'type-notes', 'exp-campus', 'unconfirmed', 'Assessment write-up', '', ['tag-assessment']),
    activity('a6', 1, '09:30', 60, 'type-direct', 'exp-clinic', 'scheduled', 'Follow-up session', 'Client 014'),
    activity('a7', 3, '15:00', 90, 'type-training', 'exp-campus', 'scheduled', 'Skills seminar'),
    activity('a8', -7, '09:00', 180, 'type-direct', 'exp-clinic', 'approved', 'Community outreach', 'Group 02', ['tag-outreach']),
    activity('a9', -8, '12:30', 60, 'type-supervision', 'exp-campus', 'confirmed', 'Case consultation'),
    activity('a10', -10, '10:00', 75, 'type-direct', 'exp-clinic', 'confirmed', 'Intake session', 'Client 021', ['tag-assessment']),
    activity('a11', -13, '14:00', 120, 'type-training', 'exp-campus', 'confirmed', 'Research seminar'),
    activity('a12', -15, '08:30', 60, 'type-direct', 'exp-clinic', 'rejected', 'Needs corrected category', 'Client 018'),
  ],
}

export const isValidBackup = (value: unknown): value is {
  schemaVersion: number
  activities: AppData['activities']
  activityTypes: AppData['activityTypes']
  experiences: AppData['experiences']
  dictionaries?: AppData['dictionaries']
} => {
  if (!value || typeof value !== 'object') return false
  const data = value as AppData
  return (data.schemaVersion === 1 || data.schemaVersion === SCHEMA_VERSION)
    && Array.isArray(data.activities)
    && Array.isArray(data.activityTypes)
    && Array.isArray(data.experiences)
}

export const migrate = (raw: unknown): AppData => {
  if (!isValidBackup(raw)) throw new Error('Invalid backup')
  return migrateToCurrent(raw)
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

export const toCsv = (data: AppData, activities = data.activities, options: { redactClients?: boolean } = {}) => {
  const typeMap = new Map(data.activityTypes.map(type => [type.id, type.name]))
  const experienceMap = new Map(data.experiences.map(exp => [exp.id, exp.name]))
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const header = ['Date', 'Start', 'Duration minutes', 'Duration hours', 'Status', 'Activity type', 'Experience', 'Supervisor', 'Term', 'Setting', 'Client', 'Tags', 'Notes']
  return [header, ...activities.map(item => [
    item.date, item.startTime, item.durationMinutes, (item.durationMinutes / 60).toFixed(2), item.status,
    typeMap.get(item.activityTypeId), experienceMap.get(item.experienceId),
    itemName(data.dictionaries.supervisors, item.supervisorId),
    itemName(data.dictionaries.terms, item.termId),
    item.setting, options.redactClients && item.client ? 'REDACTED' : item.client,
    item.tagIds.map(id => itemName(data.dictionaries.tags, id)).filter(Boolean).join('; '),
    item.notes,
  ])].map(row => row.map(escape).join(',')).join('\n')
}

export const exportJson = (data: AppData, options: { redactClients?: boolean } = {}) => JSON.stringify({
  schemaVersion: data.schemaVersion,
  exportedAt: new Date().toISOString(),
  activities: options.redactClients ? data.activities.map(item => ({ ...item, client: item.client ? 'REDACTED' : '' })) : data.activities,
  activityTypes: data.activityTypes,
  experiences: data.experiences,
  dictionaries: data.dictionaries,
}, null, 2)

export const hasStoredLocalData = () => {
  try { return Boolean(localStorage.getItem(STORAGE_KEY)) } catch { return false }
}
