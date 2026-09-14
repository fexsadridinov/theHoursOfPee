import { minutesFromHours } from './calculations'
import type {
  Activity,
  ActivityCategory,
  ActivityType,
  AppData,
  Dictionaries,
  DictionaryItem,
  DictionaryKey,
  Placement,
} from './types'

export const SCHEMA_VERSION = 4

export const dictionaryMeta: { key: DictionaryKey, label: string, hint: string }[] = [
  { key: 'supervisors', label: 'Supervisors', hint: 'People who review or sign off on a placement. Add them here, not while logging hours.' },
]

const item = (id: string, name: string): DictionaryItem => ({ id, name, active: true })

export const defaultDictionaries = (): Dictionaries => ({
  supervisors: [
    item('sup-maya', 'Dr. Maya Chen'),
    item('sup-jordan', 'Jordan Lee'),
  ],
})

export const emptyDictionaries = (): Dictionaries => ({ supervisors: [] })

export const DIRECT_KIND_DEFS = [
  { id: 'direct-intake', name: 'Intake Interviewing/Assessment' },
  { id: 'direct-individual', name: 'Individual Counseling' },
  { id: 'direct-group', name: 'Group Counseling' },
  { id: 'direct-consultation', name: 'Consultation' },
  { id: 'direct-crisis', name: 'Crisis Intervention' },
  { id: 'direct-other', name: 'Other Communication' },
] as const

export const INDIRECT_KIND_DEFS = [
  { id: 'indirect-records', name: 'Record Keeping' },
  { id: 'indirect-supervision', name: 'Supervision' },
  { id: 'indirect-staff', name: 'Staff Meeting/Staff Training' },
  { id: 'indirect-research', name: 'Research/Session Prep' },
  { id: 'indirect-development', name: 'Professional Development' },
  { id: 'indirect-outreach', name: 'Outreach/Community Engagement' },
  { id: 'indirect-admin', name: 'Administrative Tasks' },
] as const

const kind = (id: string, name: string, category: ActivityCategory): ActivityType => ({
  id, name, category, defaultMinutes: 60, active: true,
  color: category === 'direct' ? '#42564b' : '#a05d42',
})

// Fixed catalog. People choose Direct or Indirect, then one of these — they cannot add their own.
export const catalogTypes = (): ActivityType[] => [
  ...DIRECT_KIND_DEFS.map(item => kind(item.id, item.name, 'direct')),
  ...INDIRECT_KIND_DEFS.map(item => kind(item.id, item.name, 'indirect')),
]

export const defaultActivityTypes = catalogTypes
export const ensureRequiredTypes = (_types?: ActivityType[]) => catalogTypes()
export const kindsFor = (category: ActivityCategory) => catalogTypes().filter(type => type.category === category)
export const firstKindId = (category: ActivityCategory) => kindsFor(category)[0]?.id ?? ''

const KIND_IDS = new Set(catalogTypes().map(type => type.id))

const KIND_ALIASES: Record<string, string> = {
  'type-direct': 'direct-individual',
  'type-indirect': 'indirect-records',
  'type-supervision': 'indirect-supervision',
}

const KIND_NAME_HINTS: [RegExp, string][] = [
  [/intake/i, 'direct-intake'],
  [/individual/i, 'direct-individual'],
  [/group/i, 'direct-group'],
  [/consult/i, 'direct-consultation'],
  [/crisis/i, 'direct-crisis'],
  [/communication/i, 'direct-other'],
  [/record/i, 'indirect-records'],
  [/supervis/i, 'indirect-supervision'],
  [/staff|training/i, 'indirect-staff'],
  [/research|prep/i, 'indirect-research'],
  [/professional|development/i, 'indirect-development'],
  [/outreach|community/i, 'indirect-outreach'],
  [/admin/i, 'indirect-admin'],
]

export const resolveKindId = (id: string, types: { id?: string, name?: string, category?: string }[] = []) => {
  if (KIND_IDS.has(id)) return id
  if (KIND_ALIASES[id]) return KIND_ALIASES[id]
  const previous = types.find(type => type.id === id)
  const previousName = previous?.name
  if (previousName) {
    const hinted = KIND_NAME_HINTS.find(([pattern]) => pattern.test(previousName))
    if (hinted) return hinted[1]
  }
  if (previous?.category === 'direct') return 'direct-individual'
  if (previous?.category === 'indirect' || previous?.category === 'supervision') return 'indirect-records'
  return firstKindId('direct')
}

export const emptyPlacement = (): Placement => ({
  id: '', name: '', site: '', supervisorId: '', startDate: '', endDate: '', active: true,
})

export const defaultPlacements = (): Placement[] => [
  { id: 'place-riverside', name: 'Community placement', site: 'Riverside Clinic', supervisorId: 'sup-maya', startDate: '', endDate: '', active: true },
  { id: 'place-school', name: 'School counseling site', site: 'Lincoln High School', supervisorId: 'sup-jordan', startDate: '', endDate: '', active: true },
]

export const placementOf = (placements: Placement[], id: string) => placements.find(item => item.id === id)
export const placementName = (placements: Placement[], id: string, fallback = 'Unassigned') =>
  placementOf(placements, id)?.name || fallback
export const placementSite = (placements: Placement[], id: string) => placementOf(placements, id)?.site ?? ''

export const itemName = (items: DictionaryItem[], id: string, fallback = '') =>
  items.find(item => item.id === id)?.name ?? fallback

export const activeItems = <T extends { active: boolean, id: string }>(items: T[], selectedId = '') =>
  items.filter(item => item.active || item.id === selectedId)

export const findOrCreateNamed = (items: DictionaryItem[], name: string): { items: DictionaryItem[], id: string } => {
  const trimmed = name.trim()
  if (!trimmed) return { items, id: '' }
  const found = items.find(item => item.name.toLowerCase() === trimmed.toLowerCase())
  if (found) return { items, id: found.id }
  const created: DictionaryItem = { id: crypto.randomUUID(), name: trimmed, active: true }
  return { items: [...items, created], id: created.id }
}

export const renameItem = <T extends DictionaryItem>(items: T[], id: string, name: string): T[] => {
  const trimmed = name.trim()
  if (!trimmed) return items
  return items.map(item => item.id === id ? { ...item, name: trimmed } : item)
}

export const setItemActive = <T extends { id: string, active: boolean }>(items: T[], id: string, active: boolean): T[] =>
  items.map(item => item.id === id ? { ...item, active } : item)

export const removeItem = <T extends { id: string }>(items: T[], id: string): T[] =>
  items.filter(item => item.id !== id)

export const dictionaryUsage = (data: AppData, key: DictionaryKey, id: string) => {
  switch (key) {
    case 'supervisors':
      return data.activities.filter(activity => activity.supervisorId === id).length
        + data.placements.filter(placement => placement.supervisorId === id).length
  }
}

export const activityTypeUsage = (data: AppData, id: string) =>
  data.activities.filter(activity => activity.activityTypeId === id).length

export const placementUsage = (data: AppData, id: string) =>
  data.activities.filter(activity => activity.placementId === id).length

export const canRemoveDictionaryItem = (data: AppData, key: DictionaryKey, id: string) =>
  dictionaryUsage(data, key, id) === 0

export const canRemoveActivityType = (_data: AppData, _id: string) => false

export const canRemovePlacement = (data: AppData, id: string) => placementUsage(data, id) === 0

export const mergeDictionaries = (partial?: Partial<Dictionaries>): Dictionaries => ({
  supervisors: Array.isArray(partial?.supervisors) ? partial.supervisors : [],
})

type LegacyActivity = Partial<Activity> & { supervisor?: string, hours?: number, experienceId?: string }
type LegacyType = Omit<Partial<ActivityType>, 'category'> & { category?: string, defaultDuration?: number }
type LegacyPlacement = Partial<Placement> & { organization?: string, setting?: string }

const integerMinutes = (value: unknown, fallback = 60) => {
  const minutes = Math.round(Number(value))
  return Number.isFinite(minutes) && minutes > 0 ? minutes : fallback
}

const mapPlacement = (item: LegacyPlacement, index: number): Placement => ({
  id: item.id || `place-${index + 1}`,
  name: item.name?.trim() || 'Untitled placement',
  site: (item.site ?? item.organization ?? item.setting ?? '').trim(),
  supervisorId: item.supervisorId ?? '',
  startDate: item.startDate ?? '',
  endDate: item.endDate ?? '',
  active: item.active !== false,
})

export const migrateToCurrent = (raw: {
  schemaVersion?: number
  activities?: LegacyActivity[]
  activityTypes?: LegacyType[]
  placements?: LegacyPlacement[]
  experiences?: LegacyPlacement[]
  dictionaries?: Partial<Dictionaries>
}): AppData => {
  let dictionaries = mergeDictionaries(raw.dictionaries)
  const previousTypes = raw.activityTypes ?? []
  const placements = (raw.placements?.length ? raw.placements : raw.experiences ?? []).map(mapPlacement)

  const activities: Activity[] = (raw.activities ?? []).map((activity, index) => {
    let supervisorId = activity.supervisorId && dictionaries.supervisors.some(item => item.id === activity.supervisorId)
      ? activity.supervisorId : ''
    if (!supervisorId && activity.supervisor) {
      const created = findOrCreateNamed(dictionaries.supervisors, activity.supervisor)
      dictionaries = { ...dictionaries, supervisors: created.items }
      supervisorId = created.id
    }
    const minutes = activity.hours === undefined
      ? integerMinutes(activity.durationMinutes, 60)
      : minutesFromHours(activity.hours)
    const placementId = activity.placementId || activity.experienceId || ''
    return {
      id: activity.id || `activity-${index + 1}`,
      date: activity.date || '',
      durationMinutes: minutes,
      activityTypeId: resolveKindId(activity.activityTypeId || '', previousTypes),
      placementId,
      supervisorId,
      notes: activity.notes ?? '',
      createdAt: activity.createdAt || '',
      updatedAt: activity.updatedAt || '',
    }
  })

  return {
    schemaVersion: SCHEMA_VERSION,
    activities,
    activityTypes: catalogTypes(),
    placements,
    dictionaries,
  }
}

export const ensurePlacements = (data: AppData): AppData => {
  if (data.placements.length) return data
  if (!data.activities.length) return data
  const placement: Placement = {
    id: 'place-migrated', name: 'Existing hours', site: '', supervisorId: '', startDate: '', endDate: '', active: true,
  }
  return {
    ...data,
    placements: [placement],
    activities: data.activities.map(item => ({ ...item, placementId: item.placementId || placement.id })),
  }
}
