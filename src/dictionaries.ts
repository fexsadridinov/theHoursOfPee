import { minutesFromHours } from './calculations'
import type {
  Activity,
  ActivityType,
  AppData,
  Dictionaries,
  DictionaryItem,
  DictionaryKey,
} from './types'

export const SCHEMA_VERSION = 3

export const dictionaryMeta: { key: DictionaryKey, label: string, hint: string }[] = [
  { key: 'supervisors', label: 'Supervisors', hint: 'People who review or sign off on your hours. Use a role-style label if you want extra privacy.' },
]

const item = (id: string, name: string): DictionaryItem => ({ id, name, active: true })

export const defaultDictionaries = (): Dictionaries => ({
  supervisors: [
    item('sup-maya', 'Dr. Maya Chen'),
    item('sup-jordan', 'Jordan Lee'),
  ],
})

export const emptyDictionaries = (): Dictionaries => ({ supervisors: [] })

// Every workspace needs at least these two, otherwise there is nothing to log hours against.
export const defaultActivityTypes = (): ActivityType[] => [
  { id: 'type-direct', name: 'Direct hours', color: '#42564b', defaultMinutes: 60, category: 'direct', active: true },
  { id: 'type-indirect', name: 'Indirect hours', color: '#a05d42', defaultMinutes: 60, category: 'indirect', active: true },
]

export const itemName = (items: DictionaryItem[], id: string, fallback = '') =>
  items.find(item => item.id === id)?.name ?? fallback

export const activeItems = <T extends DictionaryItem>(items: T[], selectedId = '') =>
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

export const setItemActive = <T extends DictionaryItem>(items: T[], id: string, active: boolean): T[] =>
  items.map(item => item.id === id ? { ...item, active } : item)

export const removeItem = <T extends DictionaryItem>(items: T[], id: string): T[] =>
  items.filter(item => item.id !== id)

export const dictionaryUsage = (data: AppData, key: DictionaryKey, id: string) => {
  switch (key) {
    case 'supervisors': return data.activities.filter(activity => activity.supervisorId === id).length
  }
}

export const activityTypeUsage = (data: AppData, id: string) =>
  data.activities.filter(activity => activity.activityTypeId === id).length

export const canRemoveDictionaryItem = (data: AppData, key: DictionaryKey, id: string) =>
  dictionaryUsage(data, key, id) === 0

export const canRemoveActivityType = (data: AppData, id: string) =>
  activityTypeUsage(data, id) === 0 && data.activityTypes.length > 1

export const mergeDictionaries = (partial?: Partial<Dictionaries>): Dictionaries => ({
  supervisors: Array.isArray(partial?.supervisors) ? partial.supervisors : [],
})

type LegacyActivity = Partial<Activity> & { supervisor?: string, hours?: number }
// Older files carried a free-form category (including "supervision") and stored minutes as defaultDuration.
type LegacyType = Omit<Partial<ActivityType>, 'category'> & { category?: string, defaultDuration?: number }

const integerMinutes = (value: unknown, fallback = 60) => {
  const minutes = Math.round(Number(value))
  return Number.isFinite(minutes) && minutes > 0 ? minutes : fallback
}

export const migrateToCurrent = (raw: {
  schemaVersion?: number
  activities?: LegacyActivity[]
  activityTypes?: LegacyType[]
  dictionaries?: Partial<Dictionaries>
}): AppData => {
  let dictionaries = mergeDictionaries(raw.dictionaries)

  const activityTypes: ActivityType[] = (raw.activityTypes ?? []).map((type, index) => ({
    id: type.id || `type-${index + 1}`,
    name: type.name?.trim() || 'Untitled type',
    color: type.color || '#42564b',
    defaultMinutes: integerMinutes(type.defaultMinutes ?? type.defaultDuration, 60),
    // Supervision and any other older category are indirect hours now.
    category: type.category === 'direct' ? 'direct' : 'indirect',
    active: type.active !== false,
  }))

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
    return {
      id: activity.id || `activity-${index + 1}`,
      date: activity.date || '',
      durationMinutes: minutes,
      activityTypeId: activity.activityTypeId || '',
      supervisorId,
      notes: activity.notes ?? '',
      createdAt: activity.createdAt || '',
      updatedAt: activity.updatedAt || '',
    }
  })

  return {
    schemaVersion: SCHEMA_VERSION,
    activities,
    activityTypes: activityTypes.length ? activityTypes : defaultActivityTypes(),
    dictionaries,
  }
}
