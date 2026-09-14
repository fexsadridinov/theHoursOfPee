export type ActivityStatus = 'scheduled' | 'unconfirmed' | 'confirmed' | 'approved' | 'rejected'

export type DemographicKind =
  | 'ageGroup'
  | 'gender'
  | 'raceEthnicity'
  | 'sexualOrientation'
  | 'disability'
  | 'language'

export interface DictionaryItem {
  id: string
  name: string
  active: boolean
}

export interface DemographicValue extends DictionaryItem {
  kind: DemographicKind
}

export interface Dictionaries {
  supervisors: DictionaryItem[]
  domains: DictionaryItem[]
  organizationTypes: DictionaryItem[]
  trainingLevels: DictionaryItem[]
  terms: DictionaryItem[]
  tags: DictionaryItem[]
  demographics: DemographicValue[]
}

export type DictionaryKey = keyof Dictionaries

export interface ActivityType {
  id: string
  name: string
  shortName: string
  domainId: string
  color: string
  defaultDuration: number
  category: 'direct' | 'indirect' | 'supervision'
  active: boolean
}

export interface Experience {
  id: string
  name: string
  organization: string
  setting: string
  organizationTypeId: string
  trainingLevelId: string
  termId: string
  targetMinutes: number
  startDate: string
  endDate: string
  active: boolean
}

export interface Activity {
  id: string
  date: string
  startTime: string
  durationMinutes: number
  activityTypeId: string
  experienceId: string
  supervisorId: string
  termId: string
  setting: string
  client: string
  status: ActivityStatus
  tagIds: string[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface AppData {
  schemaVersion: number
  activities: Activity[]
  activityTypes: ActivityType[]
  experiences: Experience[]
  dictionaries: Dictionaries
}
