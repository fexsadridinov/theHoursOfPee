import type { AppData } from '../types'

export type RepositoryKind = 'local' | 'remote'
export type SaveStatus = 'saved' | 'saving' | 'offline' | 'failed' | 'expired'

export class SessionExpiredError extends Error {
  constructor() { super('Session expired'); this.name = 'SessionExpiredError' }
}

export interface DataRepository {
  kind: RepositoryKind
  load(): Promise<AppData>
  save(data: AppData): Promise<void>
  reset(): Promise<AppData>
  importData(data: AppData): Promise<{ uploaded: number, skipped: number }>
}

export const emptyRemoteWorkspace = (): AppData => ({
  schemaVersion: 2,
  activities: [],
  activityTypes: [],
  experiences: [],
  dictionaries: {
    supervisors: [], domains: [], organizationTypes: [], trainingLevels: [], terms: [], tags: [], demographics: [],
  },
})
