export type ActivityCategory = 'direct' | 'indirect'

export interface DictionaryItem {
  id: string
  name: string
  active: boolean
}

export interface Dictionaries {
  supervisors: DictionaryItem[]
}

export type DictionaryKey = keyof Dictionaries

export interface ActivityType {
  id: string
  name: string
  color: string
  defaultMinutes: number
  category: ActivityCategory
  active: boolean
}

// Hours are the unit people work in; minutes are stored so quarter hours stay exact.
export interface Activity {
  id: string
  date: string
  durationMinutes: number
  activityTypeId: string
  supervisorId: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface AppData {
  schemaVersion: number
  activities: Activity[]
  activityTypes: ActivityType[]
  dictionaries: Dictionaries
}
