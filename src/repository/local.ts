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
    const uploaded = entityUploadCount(incoming) - Object.values(skipped).reduce((sum, value) => sum + value, 0)
    return { uploaded, skipped: Object.values(skipped).reduce((sum, value) => sum + value, 0) }
  }
}

const entityUploadCount = (data: AppData) =>
  data.activities.length + data.experiences.length + data.activityTypes.length
  + Object.values(data.dictionaries).reduce((sum, list) => sum + list.length, 0)
