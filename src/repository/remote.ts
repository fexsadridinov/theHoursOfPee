import { emptyRemoteWorkspace, SessionExpiredError, type DataRepository } from './types'
import { getSupabase } from './supabase'
import { mergeWithoutOverwrite } from '../migration'
import { catalogTypes, resolveKindId, ensurePlacements } from '../dictionaries'
import { ownershipUserId } from '../auth/access'
import type { Activity, AppData, DictionaryItem, Placement } from '../types'

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
    const [activities, supervisors, placements] = await Promise.all([
      supabase.from('activities').select('*').eq('user_id', userId),
      supabase.from('supervisors').select('*').eq('user_id', userId),
      supabase.from('placements').select('*').eq('user_id', userId),
    ])
    const failed = [activities, supervisors, placements].find(result => result.error)
    if (failed?.error) throw new Error(failed.error.message)
    const workspace = emptyRemoteWorkspace()
    workspace.activityTypes = catalogTypes()
    workspace.placements = (placements.data ?? []).map(mapPlacement)
    workspace.activities = (activities.data ?? []).map(mapActivity)
    workspace.dictionaries = { supervisors: (supervisors.data ?? []).map(mapItem) }
    return ensurePlacements(workspace)
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
    await this.replaceTable('placements', userId, data.placements.map(item => ({
      id: item.id, user_id: userId, name: item.name, site: item.site,
      supervisor_id: emptyToNull(item.supervisorId), start_date: emptyToNull(item.startDate),
      end_date: emptyToNull(item.endDate), active: item.active,
    })))
    await this.replaceTable('activities', userId, data.activities.map(item => ({
      id: item.id, user_id: userId, date: item.date, start_time: '',
      duration_minutes: Math.round(item.durationMinutes),
      activity_type_id: resolveKindId(item.activityTypeId),
      experience_id: null, placement_id: emptyToNull(item.placementId),
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
    const uploaded = incoming.activities.length + incoming.placements.length
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
const mapPlacement = (row: Record<string, string | number | boolean | null>): Placement => ({
  id: String(row.id), name: String(row.name), site: String(row.site ?? ''),
  supervisorId: String(row.supervisor_id ?? ''), startDate: String(row.start_date ?? ''),
  endDate: String(row.end_date ?? ''), active: row.active !== false,
})
const mapActivity = (row: Record<string, string | number | boolean | null>): Activity => ({
  id: String(row.id), date: String(row.date), durationMinutes: Number(row.duration_minutes),
  activityTypeId: resolveKindId(String(row.activity_type_id ?? '')),
  placementId: String(row.placement_id ?? row.experience_id ?? ''),
  supervisorId: String(row.supervisor_id ?? ''),
  notes: String(row.notes ?? ''), createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? ''),
})
