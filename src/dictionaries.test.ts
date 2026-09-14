import { describe, expect, it } from 'vitest'
import {
  canRemoveDictionaryItem,
  defaultDictionaries,
  dictionaryUsage,
  findOrCreateDemographic,
  findOrCreateNamed,
  migrateToCurrent,
  removeItem,
  renameItem,
  SCHEMA_VERSION,
  selectableItems,
  setItemActive,
} from './dictionaries'
import { isValidBackup, migrate, seedData, toCsv } from './data'
import { completedMinutes, sumMinutes } from './calculations'

describe('dictionary helpers', () => {
  it('reuses an existing value case-insensitively', () => {
    const items = defaultDictionaries().supervisors
    const created = findOrCreateNamed(items, 'dr. maya chen')
    expect(created.id).toBe('sup-maya')
    expect(created.items).toHaveLength(items.length)
  })

  it('adds a new dictionary value', () => {
    const created = findOrCreateNamed([], 'Alex Rivera')
    expect(created.items).toEqual([{ id: created.id, name: 'Alex Rivera', active: true }])
  })

  it('renames and deactivates without changing the id', () => {
    const renamed = renameItem(defaultDictionaries().terms, 'term-fall-26', 'Autumn 2026')
    expect(renamed.find(item => item.id === 'term-fall-26')?.name).toBe('Autumn 2026')
    expect(setItemActive(renamed, 'term-fall-26', false).find(item => item.id === 'term-fall-26')?.active).toBe(false)
  })

  it('blocks removal of values still in use', () => {
    expect(dictionaryUsage(seedData, 'supervisors', 'sup-maya')).toBeGreaterThan(0)
    expect(canRemoveDictionaryItem(seedData, 'supervisors', 'sup-maya')).toBe(false)
    expect(canRemoveDictionaryItem(seedData, 'tags', 'tag-remote')).toBe(true)
    expect(removeItem(seedData.dictionaries.tags, 'tag-remote').some(item => item.id === 'tag-remote')).toBe(false)
  })

  it('exposes active values for forms', () => {
    const hidden = setItemActive(defaultDictionaries().tags, 'tag-remote', false)
    expect(selectableItems(hidden, ['tag-remote']).map(item => item.id)).toEqual(['tag-client', 'tag-assessment', 'tag-remote', 'tag-group', 'tag-outreach'])
    expect(selectableItems(hidden).map(item => item.id)).toEqual(['tag-client', 'tag-assessment', 'tag-group', 'tag-outreach'])
  })

  it('scopes demographic values to their kind', () => {
    const first = findOrCreateDemographic(defaultDictionaries().demographics, 'Prefer not to say', 'gender')
    expect(first.id).toBe('demo-gender-unknown')
    const created = findOrCreateDemographic(first.items, 'Prefer not to say', 'language')
    expect(created.id).not.toBe(first.id)
    expect(created.items.find(item => item.id === created.id)?.kind).toBe('language')
  })
})

describe('schema migration', () => {
  const legacy = {
    schemaVersion: 1 as const,
    activityTypes: [
      { id: 'type-direct', name: 'Direct practice', shortName: 'Direct', domain: 'Practice', color: '#42564b', defaultDuration: 60, category: 'direct' as const, active: true },
    ],
    experiences: [
      { id: 'exp-clinic', name: 'Community placement', organization: 'Riverside', setting: 'Community clinic', targetMinutes: 18000, startDate: '2026-06-01', endDate: '', active: true },
    ],
    activities: [
      {
        id: 'a1', date: '2026-09-14', startTime: '09:00', durationMinutes: 90.4, activityTypeId: 'type-direct',
        experienceId: 'exp-clinic', supervisor: 'Dr. Maya Chen', setting: 'Community clinic', client: 'Client 014',
        status: 'confirmed' as const, tags: ['client-facing', 'assessment'], notes: 'Individual session', createdAt: '', updatedAt: '',
      },
      {
        id: 'a2', date: '2026-09-13', startTime: '11:00', durationMinutes: 30, activityTypeId: 'type-direct',
        experienceId: 'exp-clinic', supervisor: 'New Supervisor', setting: '', client: '',
        status: 'unconfirmed' as const, tags: [], notes: '', createdAt: '', updatedAt: '',
      },
    ],
  }

  it('accepts version 1 backups and writes version 2 data', () => {
    expect(isValidBackup(legacy)).toBe(true)
    const next = migrate(legacy)
    expect(next.schemaVersion).toBe(SCHEMA_VERSION)
    expect(next.dictionaries.supervisors.some(item => item.name === 'Dr. Maya Chen')).toBe(true)
  })

  it('maps legacy strings onto dictionary ids and keeps integer minutes', () => {
    const next = migrateToCurrent(legacy)
    const first = next.activities[0]
    expect(first.durationMinutes).toBe(90)
    expect(first.supervisorId).toBe('sup-maya')
    expect(first.tagIds).toEqual(['tag-client', 'tag-assessment'])
    expect(next.activityTypes[0].domainId).toBe('dom-practice')
    expect(next.experiences[0].organizationTypeId).toBe('org-community')
    expect(next.activities[1].supervisorId).toBeTruthy()
    expect(next.dictionaries.supervisors.some(item => item.name === 'New Supervisor')).toBe(true)
    expect(completedMinutes(next.activities)).toBe(90)
    expect(sumMinutes(next.activities)).toBe(120)
  })

  it('exports resolved dictionary labels in CSV', () => {
    const csv = toCsv(seedData, seedData.activities.filter(item => item.id === 'a1'))
    expect(csv).toContain('Dr. Maya Chen')
    expect(csv).toContain('Fall 2026')
    expect(csv).toContain('client-facing')
    expect(csv).toContain('90')
  })
})
