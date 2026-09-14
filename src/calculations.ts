import type { Activity, ActivityType } from './types'

export const MINUTES_PER_HOUR = 60

export const minutesFromHours = (hours: number) => Math.round(Number(hours) * MINUTES_PER_HOUR)
export const hoursFromMinutes = (minutes: number) => Math.round((minutes / MINUTES_PER_HOUR) * 100) / 100

export const parseHours = (value: string) => {
  const hours = Number(String(value).trim().replace(',', '.'))
  if (!Number.isFinite(hours) || hours <= 0) return null
  return hours
}

export const formatHours = (minutes: number) => `${hoursFromMinutes(minutes)} h`
export const formatHoursFixed = (minutes: number) => hoursFromMinutes(minutes).toFixed(2)

export const sumMinutes = (activities: Activity[], predicate: (activity: Activity) => boolean = () => true) =>
  activities.filter(predicate).reduce((sum, item) => sum + item.durationMinutes, 0)

export const totalMinutes = (activities: Activity[]) => sumMinutes(activities)

export const groupMinutes = (activities: Activity[], key: (activity: Activity) => string) =>
  activities.reduce<Record<string, number>>((groups, activity) => {
    const label = key(activity)
    groups[label] = (groups[label] ?? 0) + activity.durationMinutes
    return groups
  }, {})

export const categoryMinutes = (activities: Activity[], types: ActivityType[]) => {
  const typeMap = new Map(types.map(type => [type.id, type.category]))
  return groupMinutes(activities, activity => typeMap.get(activity.activityTypeId) ?? 'indirect')
}

export const inDateRange = (date: string, from: string, to: string) => date >= from && date <= to
