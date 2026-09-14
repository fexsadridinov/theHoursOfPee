import type { Activity, ActivityType } from './types'

export const countsAsCompleted = (activity: Activity) =>
  activity.status === 'confirmed' || activity.status === 'approved'

export const countsAsApproved = (activity: Activity) => activity.status === 'approved'

export const sumMinutes = (activities: Activity[], predicate: (activity: Activity) => boolean = () => true) =>
  activities.filter(predicate).reduce((sum, item) => sum + item.durationMinutes, 0)

export const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins ? `${hours}h ${mins}m` : `${hours}h`
}

export const decimalHours = (minutes: number) => (minutes / 60).toFixed(1)

export const completedMinutes = (activities: Activity[]) => sumMinutes(activities, countsAsCompleted)

export const groupMinutes = (activities: Activity[], key: (a: Activity) => string) =>
  activities.filter(countsAsCompleted).reduce<Record<string, number>>((groups, activity) => {
    const label = key(activity)
    groups[label] = (groups[label] ?? 0) + activity.durationMinutes
    return groups
  }, {})

export const categoryMinutes = (activities: Activity[], types: ActivityType[]) => {
  const typeMap = new Map(types.map(type => [type.id, type.category]))
  return groupMinutes(activities, activity => typeMap.get(activity.activityTypeId) ?? 'indirect')
}

export const inDateRange = (date: string, from: string, to: string) => date >= from && date <= to
