import { migrate } from './data'
import type { AppData } from './types'

export interface EntityCounts {
  activities: number
  activityTypes: number
  supervisors: number
}

export const entityCounts = (data: AppData): EntityCounts => ({
  activities: data.activities.length,
  activityTypes: data.activityTypes.length,
  supervisors: data.dictionaries.supervisors.length,
})

export const countLabels: { key: keyof EntityCounts, label: string }[] = [
  { key: 'activities', label: 'logged entries' },
  { key: 'activityTypes', label: 'activity types' },
  { key: 'supervisors', label: 'supervisors' },
]

export const skipExistingIds = <T extends { id: string }>(incoming: T[], existingIds: Iterable<string>) => {
  const seen = new Set(existingIds)
  return incoming.filter(item => !seen.has(item.id))
}

export const mergeWithoutOverwrite = (remote: AppData, local: AppData): { merged: AppData, skipped: EntityCounts } => {
  const activities = skipExistingIds(local.activities, remote.activities.map(item => item.id))
  const activityTypes = skipExistingIds(local.activityTypes, remote.activityTypes.map(item => item.id))
  const supervisors = skipExistingIds(local.dictionaries.supervisors, remote.dictionaries.supervisors.map(item => item.id))
  return {
    merged: {
      schemaVersion: remote.schemaVersion,
      activities: [...remote.activities, ...activities],
      activityTypes: [...remote.activityTypes, ...activityTypes],
      dictionaries: { supervisors: [...remote.dictionaries.supervisors, ...supervisors] },
    },
    skipped: {
      activities: local.activities.length - activities.length,
      activityTypes: local.activityTypes.length - activityTypes.length,
      supervisors: local.dictionaries.supervisors.length - supervisors.length,
    },
  }
}

export const previewImport = (raw: unknown) => {
  const data = migrate(raw)
  return { data, counts: entityCounts(data) }
}
