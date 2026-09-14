import { describe, expect, it } from 'vitest'
import {
  activeItems,
  canRemoveActivityType,
  canRemoveDictionaryItem,
  canRemovePlacement,
  catalogTypes,
  defaultActivityTypes,
  dictionaryUsage,
  ensureRequiredTypes,
  findOrCreateNamed,
  kindsFor,
  migrateToCurrent,
  removeItem,
  renameItem,
  resolveKindId,
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

  it('blocks removal of supervisors still in use on hours or placements', () => {
    expect(dictionaryUsage(seedData, 'supervisors', 'sup-maya')).toBeGreaterThan(0)
    expect(canRemoveDictionaryItem(seedData, 'supervisors', 'sup-maya')).toBe(false)
    const unused = { ...seedData, activities: [], placements: seedData.placements.map(item => ({ ...item, supervisorId: '' })) }
    expect(canRemoveDictionaryItem(unused, 'supervisors', 'sup-maya')).toBe(true)
    expect(removeItem(unused.dictionaries.supervisors, 'sup-maya').some(item => item.id === 'sup-maya')).toBe(false)
  })

  it('never lets people add or remove the fixed activity catalog', () => {
    expect(canRemoveActivityType(seedData, 'direct-individual')).toBe(false)
    expect(catalogTypes()).toHaveLength(13)
    expect(kindsFor('direct').map(type => type.name)).toEqual([
      'Intake Interviewing/Assessment', 'Individual Counseling', 'Group Counseling',
      'Consultation', 'Crisis Intervention', 'Other Communication',
    ])
    expect(kindsFor('indirect').map(type => type.name)).toEqual([
      'Record Keeping', 'Supervision', 'Staff Meeting/Staff Training', 'Research/Session Prep',
      'Professional Development', 'Outreach/Community Engagement', 'Administrative Tasks',
    ])
  })

  it('blocks removing a placement that still has hours', () => {
    expect(canRemovePlacement(seedData, 'place-riverside')).toBe(false)
    expect(canRemovePlacement({ ...seedData, activities: [] }, 'place-riverside')).toBe(true)
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

  it('turns experiences into placements and remaps the old activity types', () => {
    const next = migrateToCurrent(legacy)
    expect(next.placements).toEqual([
      { id: 'exp-clinic', name: 'Community placement', site: 'Riverside', supervisorId: '', startDate: '2026-06-01', endDate: '', active: true },
    ])
    expect(next.activities[0]).toEqual({
      id: 'a1', date: '2026-09-14', durationMinutes: 90, activityTypeId: 'direct-individual',
      placementId: 'exp-clinic', supervisorId: 'sup-maya', notes: 'Individual session', createdAt: '', updatedAt: '',
    })
    expect(next.activities[1].activityTypeId).toBe('indirect-supervision')
    expect(Object.keys(next.dictionaries)).toEqual(['supervisors'])
    expect('experiences' in next).toBe(false)
    expect(totalMinutes(next.activities)).toBe(120)
  })

  it('maps legacy supervisor names and uses the fixed catalog', () => {
    const next = migrateToCurrent(legacy)
    expect(next.dictionaries.supervisors.some(item => item.name === 'New Supervisor')).toBe(true)
    expect(next.activities[1].supervisorId).toBeTruthy()
    expect(next.activityTypes).toEqual(defaultActivityTypes())
    expect(resolveKindId('type-direct')).toBe('direct-individual')
    expect(resolveKindId('mystery', [{ id: 'mystery', name: 'Intake interview', category: 'direct' }])).toBe('direct-intake')
  })

  it('gives a typeless backup the fixed catalog', () => {
    const next = migrateToCurrent({ schemaVersion: 2, activities: [], activityTypes: [] })
    expect(next.activityTypes).toEqual(catalogTypes())
    expect(next.placements).toEqual([])
  })

  it('keeps existing hours on a migrated placement when none were stored', () => {
    const next = migrate({
      schemaVersion: 3,
      activities: [{ id: 'a1', date: '2026-09-14', durationMinutes: 60, activityTypeId: 'type-direct', supervisorId: '', notes: 'kept', createdAt: '', updatedAt: '' }],
      activityTypes: [],
    })
    expect(next.placements).toEqual([
      { id: 'place-migrated', name: 'Existing hours', site: '', supervisorId: '', startDate: '', endDate: '', active: true },
    ])
    expect(next.activities[0].placementId).toBe('place-migrated')
  })

  it('replaces leftover custom types with the catalog', () => {
    const next = ensureRequiredTypes([{ id: 'old-direct', name: 'Direct practice', color: '#42564b', defaultMinutes: 60, category: 'direct', active: true }])
    expect(next.map(type => type.category).filter(category => category === 'direct')).toHaveLength(6)
    expect(next.map(type => type.category).filter(category => category === 'indirect')).toHaveLength(7)
  })

  it('round-trips a JSON export through the importer', () => {
    const restored = migrate(JSON.parse(exportJson(seedData)))
    expect(restored.activities).toEqual(seedData.activities)
    expect(restored.placements).toEqual(seedData.placements)
    expect(restored.activityTypes).toEqual(seedData.activityTypes)
  })

  it('exports hours, placement, and resolved names in CSV', () => {
    const csv = toCsv(seedData, seedData.activities.filter(item => item.id === 'a1'))
    expect(csv).toContain('"Date","Hours","Category","Activity","Placement","Site","Supervisor","Notes"')
    expect(csv).toContain('"1.5"')
    expect(csv).toContain('Individual Counseling')
    expect(csv).toContain('Community placement')
    expect(csv).toContain('Riverside Clinic')
    expect(csv).toContain('Dr. Maya Chen')
  })
})
