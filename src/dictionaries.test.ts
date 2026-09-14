import { describe, expect, it } from 'vitest'
import {
  activeItems,
  canRemoveActivityType,
  canRemoveDictionaryItem,
  defaultActivityTypes,
  dictionaryUsage,
  ensureRequiredTypes,
  findOrCreateNamed,
  migrateToCurrent,
  removeItem,
  renameItem,
  SCHEMA_VERSION,
  setItemActive,
} from './dictionaries'
import { isValidBackup, migrate, seedData, toCsv, exportJson } from './data'
import { totalMinutes } from './calculations'

describe('dictionary helpers', () => {
  it('reuses an existing value case-insensitively', () => {
    const items = seedData.dictionaries.supervisors
    const created = findOrCreateNamed(items, 'dr. maya chen')
    expect(created.id).toBe('sup-maya')
    expect(created.items).toHaveLength(items.length)
  })

  it('adds a new dictionary value', () => {
    const created = findOrCreateNamed([], 'Alex Rivera')
    expect(created.items).toEqual([{ id: created.id, name: 'Alex Rivera', active: true }])
  })

  it('renames and hides without changing the id', () => {
    const renamed = renameItem(seedData.dictionaries.supervisors, 'sup-jordan', 'Jordan Lee-Smith')
    expect(renamed.find(item => item.id === 'sup-jordan')?.name).toBe('Jordan Lee-Smith')
    expect(setItemActive(renamed, 'sup-jordan', false).find(item => item.id === 'sup-jordan')?.active).toBe(false)
  })

  it('keeps hidden values selectable while they are still attached to an entry', () => {
    const hidden = setItemActive(seedData.dictionaries.supervisors, 'sup-maya', false)
    expect(activeItems(hidden, 'sup-maya').map(item => item.id)).toEqual(['sup-maya', 'sup-jordan'])
    expect(activeItems(hidden).map(item => item.id)).toEqual(['sup-jordan'])
  })

  it('blocks removal of supervisors still in use', () => {
    expect(dictionaryUsage(seedData, 'supervisors', 'sup-maya')).toBeGreaterThan(0)
    expect(canRemoveDictionaryItem(seedData, 'supervisors', 'sup-maya')).toBe(false)
    const unused = { ...seedData, activities: [] }
    expect(canRemoveDictionaryItem(unused, 'supervisors', 'sup-maya')).toBe(true)
    expect(removeItem(unused.dictionaries.supervisors, 'sup-maya').some(item => item.id === 'sup-maya')).toBe(false)
  })

  it('never leaves a workspace without an activity type', () => {
    expect(canRemoveActivityType(seedData, 'type-direct')).toBe(false)
    const single = { ...seedData, activities: [], activityTypes: [defaultActivityTypes()[0]] }
    expect(canRemoveActivityType(single, 'type-direct')).toBe(false)
  })
})

describe('schema migration', () => {
  const legacy = {
    schemaVersion: 2 as const,
    activityTypes: [
      { id: 'type-direct', name: 'Direct practice', shortName: 'Direct', domainId: 'dom-practice', color: '#42564b', defaultDuration: 60, category: 'direct' as const, active: true },
      { id: 'type-supervision', name: 'Supervision', shortName: 'Supervision', domainId: 'dom-growth', color: '#857754', defaultDuration: 90, category: 'supervision', active: true },
    ],
    experiences: [
      { id: 'exp-clinic', name: 'Community placement', organization: 'Riverside', setting: 'Community clinic', targetMinutes: 18000, startDate: '2026-06-01', endDate: '', active: true },
    ],
    activities: [
      {
        id: 'a1', date: '2026-09-14', startTime: '09:00', durationMinutes: 90.4, activityTypeId: 'type-direct',
        experienceId: 'exp-clinic', supervisorId: 'sup-maya', setting: 'Community clinic', client: 'Client 014',
        status: 'unconfirmed' as const, tagIds: ['tag-client'], notes: 'Individual session', createdAt: '', updatedAt: '',
      },
      {
        id: 'a2', date: '2026-09-13', startTime: '11:00', durationMinutes: 30, activityTypeId: 'type-supervision',
        experienceId: 'exp-clinic', supervisor: 'New Supervisor', setting: '', client: '',
        status: 'scheduled' as const, tagIds: [], notes: '', createdAt: '', updatedAt: '',
      },
    ],
    dictionaries: { supervisors: [{ id: 'sup-maya', name: 'Dr. Maya Chen', active: true }] },
  }

  it('accepts older backups and writes the current version', () => {
    expect(isValidBackup(legacy)).toBe(true)
    const next = migrate(legacy)
    expect(next.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('drops experiences, statuses, clients, and tags while keeping the hours', () => {
    const next = migrateToCurrent(legacy)
    expect(next.activities[0]).toEqual({
      id: 'a1', date: '2026-09-14', durationMinutes: 90, activityTypeId: 'type-direct',
      supervisorId: 'sup-maya', notes: 'Individual session', createdAt: '', updatedAt: '',
    })
    expect(Object.keys(next.dictionaries)).toEqual(['supervisors'])
    expect('experiences' in next).toBe(false)
    // Every entry survives the migration; nothing is filtered by its old status.
    expect(totalMinutes(next.activities)).toBe(120)
  })

  it('maps legacy supervisor names and folds supervision into indirect hours', () => {
    const next = migrateToCurrent(legacy)
    expect(next.dictionaries.supervisors.some(item => item.name === 'New Supervisor')).toBe(true)
    expect(next.activities[1].supervisorId).toBeTruthy()
    expect(next.activityTypes.map(type => type.category)).toEqual(['direct', 'indirect'])
  })

  it('gives a typeless backup the default direct and indirect types', () => {
    const next = migrateToCurrent({ schemaVersion: 2, activities: [], activityTypes: [] })
    expect(next.activityTypes.map(type => type.name)).toEqual(['Direct hours', 'Indirect hours'])
  })

  it('adds a missing indirect type without duplicating an existing direct type', () => {
    const next = ensureRequiredTypes([{ id: 'old-direct', name: 'Direct practice', color: '#42564b', defaultMinutes: 60, category: 'direct', active: true }])
    expect(next.map(type => type.category)).toEqual(['direct', 'indirect'])
  })

  it('round-trips a JSON export through the importer', () => {
    const restored = migrate(JSON.parse(exportJson(seedData)))
    expect(restored.activities).toEqual(seedData.activities)
    expect(restored.activityTypes).toEqual(seedData.activityTypes)
  })

  it('exports hours and resolved names in CSV', () => {
    const csv = toCsv(seedData, seedData.activities.filter(item => item.id === 'a1'))
    expect(csv).toContain('"Date","Hours","Activity type","Category","Supervisor","Notes"')
    expect(csv).toContain('"1.5"')
    expect(csv).toContain('Direct hours')
    expect(csv).toContain('Dr. Maya Chen')
  })
})
