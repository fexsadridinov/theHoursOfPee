import { migrate } from './data'
import type { AppData } from './types'

export interface EntityCounts {
  activities: number
  experiences: number
  supervisors: number
  clients: number
  activityTypes: number
  recurrenceSeries: number
  requirements: number
}

export const entityCounts = (data: AppData): EntityCounts => ({
  activities: data.activities.length,
  experiences: data.experiences.length,
  supervisors: data.dictionaries.supervisors.length,
  clients: new Set(data.activities.map(item => item.client).filter(Boolean)).size,
  activityTypes: data.activityTypes.length,
  recurrenceSeries: 0,
  requirements: 0,
})

export const skipExistingIds = <T extends { id: string }>(incoming: T[], existingIds: Iterable<string>) => {
  const seen = new Set(existingIds)
  return incoming.filter(item => !seen.has(item.id))
}

export const mergeWithoutOverwrite = (remote: AppData, local: AppData): { merged: AppData, skipped: EntityCounts } => {
  const activities = skipExistingIds(local.activities, remote.activities.map(item => item.id))
  const experiences = skipExistingIds(local.experiences, remote.experiences.map(item => item.id))
  const activityTypes = skipExistingIds(local.activityTypes, remote.activityTypes.map(item => item.id))
  const skipDict = <T extends { id: string }>(incoming: T[], existing: T[]) =>
    skipExistingIds(incoming, existing.map(item => item.id))
  return {
    merged: {
      schemaVersion: remote.schemaVersion,
      activities: [...remote.activities, ...activities],
      experiences: [...remote.experiences, ...experiences],
      activityTypes: [...remote.activityTypes, ...activityTypes],
      dictionaries: {
        supervisors: [...remote.dictionaries.supervisors, ...skipDict(local.dictionaries.supervisors, remote.dictionaries.supervisors)],
        domains: [...remote.dictionaries.domains, ...skipDict(local.dictionaries.domains, remote.dictionaries.domains)],
        organizationTypes: [...remote.dictionaries.organizationTypes, ...skipDict(local.dictionaries.organizationTypes, remote.dictionaries.organizationTypes)],
        trainingLevels: [...remote.dictionaries.trainingLevels, ...skipDict(local.dictionaries.trainingLevels, remote.dictionaries.trainingLevels)],
        terms: [...remote.dictionaries.terms, ...skipDict(local.dictionaries.terms, remote.dictionaries.terms)],
        tags: [...remote.dictionaries.tags, ...skipDict(local.dictionaries.tags, remote.dictionaries.tags)],
        demographics: [...remote.dictionaries.demographics, ...skipDict(local.dictionaries.demographics, remote.dictionaries.demographics)],
      },
    },
    skipped: {
      activities: local.activities.length - activities.length,
      experiences: local.experiences.length - experiences.length,
      supervisors: local.dictionaries.supervisors.length - skipDict(local.dictionaries.supervisors, remote.dictionaries.supervisors).length,
      clients: 0,
      activityTypes: local.activityTypes.length - activityTypes.length,
      recurrenceSeries: 0,
      requirements: 0,
    },
  }
}

export const previewImport = (raw: unknown) => {
  const data = migrate(raw)
  return { data, counts: entityCounts(data) }
}
