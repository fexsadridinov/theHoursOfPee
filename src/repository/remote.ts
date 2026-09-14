import { emptyRemoteWorkspace, SessionExpiredError, type DataRepository } from './types'
import { getSupabase } from './supabase'
import { mergeWithoutOverwrite } from '../migration'
import { ownershipUserId } from '../auth/access'
import type { Activity, ActivityType, AppData, DemographicValue, DictionaryItem, Experience } from '../types'

const dictTables = {
  supervisors: 'supervisors',
  domains: 'domains',
  organizationTypes: 'organization_types',
  trainingLevels: 'training_levels',
  terms: 'terms',
  tags: 'tags',
  demographics: 'demographics',
} as const

export class RemoteRepository implements DataRepository {
  kind = 'remote' as const

  private async userId() {
    const { data: { session } } = await getSupabase().auth.getSession()
    if (!session?.user) throw new SessionExpiredError()
    return session.user.id
  }

  async load(): Promise<AppData> {
    const userId = await this.userId()
    const supabase = getSupabase()
    const [experiences, activityTypes, activities, supervisors, domains, organizationTypes, trainingLevels, terms, tags, demographics, activityTags] = await Promise.all([
      supabase.from('experiences').select('*').eq('user_id', userId),
      supabase.from('activity_types').select('*').eq('user_id', userId),
      supabase.from('activities').select('*').eq('user_id', userId),
      supabase.from('supervisors').select('*').eq('user_id', userId),
      supabase.from('domains').select('*').eq('user_id', userId),
      supabase.from('organization_types').select('*').eq('user_id', userId),
      supabase.from('training_levels').select('*').eq('user_id', userId),
      supabase.from('terms').select('*').eq('user_id', userId),
      supabase.from('tags').select('*').eq('user_id', userId),
      supabase.from('demographics').select('*').eq('user_id', userId),
      supabase.from('activity_tags').select('*').eq('user_id', userId),
    ])
    const error = [experiences, activityTypes, activities, supervisors, domains, organizationTypes, trainingLevels, terms, tags, demographics, activityTags].find(result => result.error)
    if (error?.error) throw error.error
    const tagMap = new Map<string, string[]>()
    for (const row of activityTags.data ?? []) {
      const list = tagMap.get(row.activity_id) ?? []
      list.push(row.tag_id)
      tagMap.set(row.activity_id, list)
    }
    const workspace = emptyRemoteWorkspace()
    workspace.experiences = (experiences.data ?? []).map(mapExperience)
    workspace.activityTypes = (activityTypes.data ?? []).map(mapActivityType)
    workspace.activities = (activities.data ?? []).map(row => mapActivity(row, tagMap.get(row.id) ?? []))
    workspace.dictionaries = {
      supervisors: (supervisors.data ?? []).map(mapItem),
      domains: (domains.data ?? []).map(mapItem),
      organizationTypes: (organizationTypes.data ?? []).map(mapItem),
      trainingLevels: (trainingLevels.data ?? []).map(mapItem),
      terms: (terms.data ?? []).map(mapItem),
      tags: (tags.data ?? []).map(mapItem),
      demographics: (demographics.data ?? []).map(mapDemographic),
    }
    return workspace
  }

  async save(data: AppData) {
    const userId = ownershipUserId(await this.userId())
    const supabase = getSupabase()
    await this.replaceTable('experiences', userId, data.experiences.map(item => ({
      id: item.id, user_id: userId, name: item.name, organization: item.organization, setting: item.setting,
      organization_type_id: emptyToNull(item.organizationTypeId), training_level_id: emptyToNull(item.trainingLevelId),
      term_id: emptyToNull(item.termId), target_minutes: item.targetMinutes, start_date: emptyToNull(item.startDate),
      end_date: emptyToNull(item.endDate), active: item.active,
    })))
    await this.replaceTable('activity_types', userId, data.activityTypes.map(item => ({
      id: item.id, user_id: userId, name: item.name, short_name: item.shortName, domain_id: emptyToNull(item.domainId),
      color: item.color, default_duration: item.defaultDuration, category: item.category, active: item.active,
    })))
    for (const [key, table] of Object.entries(dictTables)) {
      const rows = data.dictionaries[key as keyof AppData['dictionaries']].map(item => ({
        id: item.id, user_id: userId, name: item.name, active: item.active,
        ...('kind' in item ? { kind: item.kind } : {}),
      }))
      await this.replaceTable(table, userId, rows)
    }
    await this.replaceTable('activities', userId, data.activities.map(item => ({
      id: item.id, user_id: userId, date: item.date, start_time: item.startTime, duration_minutes: Math.round(item.durationMinutes),
      activity_type_id: item.activityTypeId, experience_id: item.experienceId, supervisor_id: emptyToNull(item.supervisorId),
      term_id: emptyToNull(item.termId), setting: item.setting, client: item.client, status: item.status, notes: item.notes,
      created_at: item.createdAt || new Date().toISOString(), updated_at: item.updatedAt || new Date().toISOString(),
    })))
    const tagRows = data.activities.flatMap(activity => activity.tagIds.map(tagId => ({
      activity_id: activity.id, tag_id: tagId, user_id: userId,
    })))
    await supabase.from('activity_tags').delete().eq('user_id', userId)
    if (tagRows.length) {
      const { error } = await supabase.from('activity_tags').insert(tagRows)
      if (error) throw error
    }
  }

  async reset() {
    const empty = emptyRemoteWorkspace()
    await this.save(empty)
    return empty
  }

  async importData(incoming: AppData) {
    const remote = await this.load()
    const { merged, skipped } = mergeWithoutOverwrite(remote, incoming)
    await this.save(merged)
    const skippedCount = Object.values(skipped).reduce((sum, value) => sum + value, 0)
    const uploaded = incoming.activities.length + incoming.experiences.length + incoming.activityTypes.length - skipped.activities - skipped.experiences - skipped.activityTypes
    return { uploaded, skipped: skippedCount }
  }

  private async replaceTable(table: string, userId: string, rows: Record<string, unknown>[]) {
    const supabase = getSupabase()
    const { data: existing, error: readError } = await supabase.from(table).select('id').eq('user_id', userId)
    if (readError) throw readError
    const keep = new Set(rows.map(row => String(row.id)))
    const remove = (existing ?? []).map(row => row.id).filter(id => !keep.has(id))
    if (remove.length) {
      const { error } = await supabase.from(table).delete().eq('user_id', userId).in('id', remove)
      if (error) throw error
    }
    if (rows.length) {
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'user_id,id' })
      if (error) throw error
    }
  }
}

const emptyToNull = (value: string) => value || null
const mapItem = (row: { id: string, name: string, active: boolean }): DictionaryItem => ({ id: row.id, name: row.name, active: row.active })
const mapDemographic = (row: { id: string, name: string, active: boolean, kind: DemographicValue['kind'] }): DemographicValue => ({ ...mapItem(row), kind: row.kind })
const mapExperience = (row: Record<string, string | number | boolean | null>): Experience => ({
  id: String(row.id), name: String(row.name), organization: String(row.organization ?? ''), setting: String(row.setting ?? ''),
  organizationTypeId: String(row.organization_type_id ?? ''), trainingLevelId: String(row.training_level_id ?? ''),
  termId: String(row.term_id ?? ''), targetMinutes: Number(row.target_minutes), startDate: String(row.start_date ?? ''),
  endDate: String(row.end_date ?? ''), active: Boolean(row.active),
})
const mapActivityType = (row: Record<string, string | number | boolean | null>): ActivityType => ({
  id: String(row.id), name: String(row.name), shortName: String(row.short_name), domainId: String(row.domain_id ?? ''),
  color: String(row.color), defaultDuration: Number(row.default_duration), category: row.category as ActivityType['category'],
  active: Boolean(row.active),
})
const mapActivity = (row: Record<string, string | number | boolean | null>, tagIds: string[]): Activity => ({
  id: String(row.id), date: String(row.date), startTime: String(row.start_time ?? ''), durationMinutes: Number(row.duration_minutes),
  activityTypeId: String(row.activity_type_id), experienceId: String(row.experience_id), supervisorId: String(row.supervisor_id ?? ''),
  termId: String(row.term_id ?? ''), setting: String(row.setting ?? ''), client: String(row.client ?? ''),
  status: row.status as Activity['status'], tagIds, notes: String(row.notes ?? ''),
  createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? ''),
})
