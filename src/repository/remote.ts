import { emptyRemoteWorkspace, SessionExpiredError, type DataRepository } from './types'
import { getSupabase } from './supabase'
import { mergeWithoutOverwrite } from '../migration'
import { defaultActivityTypes, ensureRequiredTypes } from '../dictionaries'
import { ownershipUserId } from '../auth/access'
import type { Activity, ActivityType, AppData, DictionaryItem } from '../types'

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
    const [activityTypes, activities, supervisors] = await Promise.all([
      supabase.from('activity_types').select('*').eq('user_id', userId),
      supabase.from('activities').select('*').eq('user_id', userId),
      supabase.from('supervisors').select('*').eq('user_id', userId),
    ])
    const failed = [activityTypes, activities, supervisors].find(result => result.error)
    if (failed?.error) throw new Error(failed.error.message)
    const workspace = emptyRemoteWorkspace()
    const types = (activityTypes.data ?? []).map(mapActivityType)
    workspace.activityTypes = ensureRequiredTypes(types.length ? types : defaultActivityTypes())
    workspace.activities = (activities.data ?? []).map(mapActivity)
    workspace.dictionaries = { supervisors: (supervisors.data ?? []).map(mapItem) }
    // Defaults only lived in memory before, so the first log was also the first write and looked like it did nothing.
    if (!types.length) await this.save(workspace)
    return workspace
  }

  async save(data: AppData) {
    const userId = ownershipUserId(await this.userId())
    await this.replaceTable('activity_types', userId, data.activityTypes.map(item => ({
      id: item.id, user_id: userId, name: item.name, short_name: item.name, domain_id: null,
      color: item.color, default_duration: item.defaultMinutes, category: item.category, active: item.active,
    })))
    await this.replaceTable('supervisors', userId, data.dictionaries.supervisors.map(item => ({
      id: item.id, user_id: userId, name: item.name, active: item.active,
    })))
    await this.replaceTable('activities', userId, data.activities.map(item => ({
      id: item.id, user_id: userId, date: item.date, start_time: '',
      duration_minutes: Math.round(item.durationMinutes),
      activity_type_id: item.activityTypeId, experience_id: null,
      supervisor_id: emptyToNull(item.supervisorId), term_id: null, setting: '', client: '',
      status: null, notes: item.notes,
      created_at: item.createdAt || new Date().toISOString(), updated_at: item.updatedAt || new Date().toISOString(),
    })))
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
    const uploaded = incoming.activities.length + incoming.activityTypes.length
      + incoming.dictionaries.supervisors.length - skippedCount
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
      if (error) throw new Error(error.message)
    }
    if (rows.length) {
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'user_id,id' })
      if (error) throw new Error(error.message)
    }
  }
}

const emptyToNull = (value: string) => value || null
const mapItem = (row: { id: string, name: string, active: boolean }): DictionaryItem => ({ id: row.id, name: row.name, active: row.active })
const mapActivityType = (row: Record<string, string | number | boolean | null>): ActivityType => ({
  id: String(row.id), name: String(row.name), color: String(row.color),
  defaultMinutes: Number(row.default_duration), category: row.category === 'direct' ? 'direct' : 'indirect',
  active: Boolean(row.active),
})
const mapActivity = (row: Record<string, string | number | boolean | null>): Activity => ({
  id: String(row.id), date: String(row.date), durationMinutes: Number(row.duration_minutes),
  activityTypeId: String(row.activity_type_id), supervisorId: String(row.supervisor_id ?? ''),
  notes: String(row.notes ?? ''), createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? ''),
})
