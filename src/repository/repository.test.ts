import { describe, expect, it } from 'vitest'
import { mergeWithoutOverwrite, skipExistingIds, entityCounts } from '../migration'
import { seedData } from '../data'
import { SCHEMA_VERSION } from '../dictionaries'
import { emptyRemoteWorkspace } from './types'
import { LocalRepository } from './local'
import { ownershipUserId } from '../auth/access'

describe('local-to-remote migration', () => {
  it('never overwrites existing remote ids', () => {
    const remote = structuredClone(seedData)
    const local = structuredClone(seedData)
    local.activities.push({ ...seedData.activities[0], id: 'fresh-activity', notes: 'new' })
    const { merged, skipped } = mergeWithoutOverwrite(remote, local)
    expect(skipped.activities).toBe(seedData.activities.length)
    expect(merged.activities.some(item => item.id === 'fresh-activity')).toBe(true)
    expect(merged.activities.filter(item => item.id === seedData.activities[0].id)).toHaveLength(1)
  })

  it('counts entities for the migration preview', () => {
    const counts = entityCounts(seedData)
    expect(counts.activities).toBe(seedData.activities.length)
    expect(counts.activityTypes).toBe(seedData.activityTypes.length)
    expect(counts.supervisors).toBe(seedData.dictionaries.supervisors.length)
  })
})

describe('ownership filtering', () => {
  it('keeps the session user id on writes', () => {
    expect(ownershipUserId('aaa')).toBe('aaa')
    expect(() => ownershipUserId('aaa', 'bbb')).toThrow()
  })

  it('skips duplicate imports', () => {
    expect(skipExistingIds([{ id: 'a' }, { id: 'b' }], ['a']).map(item => item.id)).toEqual(['b'])
  })
})

describe('account deletion and export', () => {
  it('local reset removes stored workspace data', async () => {
    const memory = new Map<string, string>()
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => { memory.set(key, value) },
        removeItem: (key: string) => { memory.delete(key) },
      },
    })
    const repo = new LocalRepository()
    await repo.save(seedData)
    const reset = await repo.reset()
    expect(reset.activities).toEqual(seedData.activities)
    if (original) Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
  })
})

describe('a brand new online workspace', () => {
  it('has no entries but can still be logged against', () => {
    const empty = emptyRemoteWorkspace()
    expect(empty.activities).toEqual([])
    expect(empty.schemaVersion).toBe(SCHEMA_VERSION)
    // Without seeded types the activity dropdown is empty and nothing can be saved.
    expect(empty.activityTypes.map(type => type.category)).toEqual(['direct', 'indirect'])
  })
})
