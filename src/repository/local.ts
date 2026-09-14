import { loadData, resetData, saveData } from '../data'
import { mergeWithoutOverwrite } from '../migration'
import type { AppData } from '../types'
import type { DataRepository } from './types'

export class LocalRepository implements DataRepository {
  kind = 'local' as const
  async load() { return loadData() }
  async save(data: AppData) { saveData(data) }
  async reset() { return resetData() }
  async importData(incoming: AppData) {
    const current = loadData()
    const { merged, skipped } = mergeWithoutOverwrite(current, incoming)
    saveData(merged)
    const skippedCount = Object.values(skipped).reduce((sum, value) => sum + value, 0)
    return { uploaded: entityUploadCount(incoming) - skippedCount, skipped: skippedCount }
  }
}

const entityUploadCount = (data: AppData) =>
  data.activities.length + data.placements.length + data.dictionaries.supervisors.length
