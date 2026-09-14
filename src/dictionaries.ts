import type {
  Activity,
  ActivityType,
  AppData,
  DemographicKind,
  DemographicValue,
  Dictionaries,
  DictionaryItem,
  DictionaryKey,
  Experience,
} from './types'

export const SCHEMA_VERSION = 2

export const dictionaryMeta: { key: DictionaryKey, label: string, hint: string }[] = [
  { key: 'supervisors', label: 'Supervisors', hint: 'People who review or sign off on your work. Use a role-style label if you want extra privacy.' },
  { key: 'domains', label: 'Domains', hint: 'High-level areas used to group activity types in reports.' },
  { key: 'organizationTypes', label: 'Organization types', hint: 'Kinds of sites, such as clinic, school, or hospital—not the site’s street address.' },
  { key: 'trainingLevels', label: 'Training levels', hint: 'The training stage for an experience, such as practicum or internship.' },
  { key: 'terms', label: 'Terms', hint: 'Academic or reporting periods you can assign to activities and experiences.' },
  { key: 'tags', label: 'Tags', hint: 'Reusable labels for filtering. Keep them generic; never store identifying notes here.' },
  { key: 'demographics', label: 'Client demographics', hint: 'Anonymous category labels only. Do not enter names or other identifying details.' },
]

export const demographicKinds: { id: DemographicKind, label: string }[] = [
  { id: 'ageGroup', label: 'Age group' },
  { id: 'gender', label: 'Gender' },
  { id: 'raceEthnicity', label: 'Race / ethnicity' },
  { id: 'sexualOrientation', label: 'Sexual orientation' },
  { id: 'disability', label: 'Disability' },
  { id: 'language', label: 'Language' },
]

const item = (id: string, name: string): DictionaryItem => ({ id, name, active: true })
const demo = (id: string, name: string, kind: DemographicKind): DemographicValue => ({ id, name, kind, active: true })

export const defaultDictionaries = (): Dictionaries => ({
  supervisors: [
    item('sup-maya', 'Dr. Maya Chen'),
    item('sup-jordan', 'Jordan Lee'),
  ],
  domains: [
    item('dom-practice', 'Practice'),
    item('dom-admin', 'Administration'),
    item('dom-growth', 'Professional growth'),
    item('dom-learning', 'Learning'),
  ],
  organizationTypes: [
    item('org-community', 'Community clinic'),
    item('org-university', 'University'),
    item('org-hospital', 'Hospital'),
    item('org-school', 'School'),
    item('org-private', 'Private practice'),
    item('org-government', 'Government agency'),
  ],
  trainingLevels: [
    item('lvl-practicum', 'Practicum'),
    item('lvl-internship', 'Internship'),
    item('lvl-postdoc', 'Postdoctoral'),
    item('lvl-independent', 'Licensed independent'),
    item('lvl-coursework', 'Coursework'),
  ],
  terms: [
    item('term-spring-26', 'Spring 2026'),
    item('term-summer-26', 'Summer 2026'),
    item('term-fall-26', 'Fall 2026'),
    item('term-spring-27', 'Spring 2027'),
  ],
  tags: [
    item('tag-client', 'client-facing'),
    item('tag-assessment', 'assessment'),
    item('tag-remote', 'remote'),
    item('tag-group', 'group'),
    item('tag-outreach', 'outreach'),
  ],
  demographics: [
    demo('demo-child', 'Child (0–12)', 'ageGroup'),
    demo('demo-adolescent', 'Adolescent (13–17)', 'ageGroup'),
    demo('demo-adult', 'Adult (18–64)', 'ageGroup'),
    demo('demo-older', 'Older adult (65+)', 'ageGroup'),
    demo('demo-age-unknown', 'Prefer not to say', 'ageGroup'),
    demo('demo-woman', 'Woman', 'gender'),
    demo('demo-man', 'Man', 'gender'),
    demo('demo-nonbinary', 'Non-binary', 'gender'),
    demo('demo-gender-other', 'Another identity', 'gender'),
    demo('demo-gender-unknown', 'Prefer not to say', 'gender'),
    demo('demo-asian', 'Asian', 'raceEthnicity'),
    demo('demo-black', 'Black / African American', 'raceEthnicity'),
    demo('demo-hispanic', 'Hispanic / Latine', 'raceEthnicity'),
    demo('demo-indigenous', 'Indigenous / Native', 'raceEthnicity'),
    demo('demo-mena', 'Middle Eastern / North African', 'raceEthnicity'),
    demo('demo-white', 'White', 'raceEthnicity'),
    demo('demo-multiracial', 'Multiracial', 'raceEthnicity'),
    demo('demo-race-other', 'Another identity', 'raceEthnicity'),
    demo('demo-race-unknown', 'Prefer not to say', 'raceEthnicity'),
    demo('demo-heterosexual', 'Heterosexual', 'sexualOrientation'),
    demo('demo-gay', 'Gay / Lesbian', 'sexualOrientation'),
    demo('demo-bisexual', 'Bisexual', 'sexualOrientation'),
    demo('demo-asexual', 'Asexual', 'sexualOrientation'),
    demo('demo-orientation-other', 'Another identity', 'sexualOrientation'),
    demo('demo-orientation-unknown', 'Prefer not to say', 'sexualOrientation'),
    demo('demo-no-disability', 'No disability reported', 'disability'),
    demo('demo-disability', 'Disability reported', 'disability'),
    demo('demo-disability-unknown', 'Prefer not to say', 'disability'),
    demo('demo-english', 'English', 'language'),
    demo('demo-spanish', 'Spanish', 'language'),
    demo('demo-asl', 'American Sign Language', 'language'),
    demo('demo-language-other', 'Another language', 'language'),
  ],
})

export const itemName = (items: DictionaryItem[], id: string, fallback = '') =>
  items.find(item => item.id === id)?.name ?? fallback

export const activeItems = <T extends DictionaryItem>(items: T[], selectedId = '') =>
  items.filter(item => item.active || item.id === selectedId)

export const selectableItems = <T extends DictionaryItem>(items: T[], selectedIds: string[] = []) =>
  items.filter(item => item.active || selectedIds.includes(item.id))

export const findOrCreateNamed = (items: DictionaryItem[], name: string): { items: DictionaryItem[], id: string } => {
  const trimmed = name.trim()
  if (!trimmed) return { items, id: '' }
  const found = items.find(item => item.name.toLowerCase() === trimmed.toLowerCase())
  if (found) return { items, id: found.id }
  const created: DictionaryItem = { id: crypto.randomUUID(), name: trimmed, active: true }
  return { items: [...items, created], id: created.id }
}

export const findOrCreateDemographic = (items: DemographicValue[], name: string, kind: DemographicKind): { items: DemographicValue[], id: string } => {
  const trimmed = name.trim()
  if (!trimmed) return { items, id: '' }
  const found = items.find(item => item.kind === kind && item.name.toLowerCase() === trimmed.toLowerCase())
  if (found) return { items, id: found.id }
  const created: DemographicValue = { id: crypto.randomUUID(), name: trimmed, kind, active: true }
  return { items: [...items, created], id: created.id }
}

export const renameItem = <T extends DictionaryItem>(items: T[], id: string, name: string): T[] => {
  const trimmed = name.trim()
  if (!trimmed) return items
  return items.map(item => item.id === id ? { ...item, name: trimmed } : item)
}

export const setItemActive = <T extends DictionaryItem>(items: T[], id: string, active: boolean): T[] =>
  items.map(item => item.id === id ? { ...item, active } : item)

export const removeItem = <T extends DictionaryItem>(items: T[], id: string): T[] =>
  items.filter(item => item.id !== id)

export const dictionaryUsage = (data: AppData, key: DictionaryKey, id: string) => {
  const activities = data.activities
  const types = data.activityTypes
  const experiences = data.experiences
  switch (key) {
    case 'supervisors': return activities.filter(activity => activity.supervisorId === id).length
    case 'domains': return types.filter(type => type.domainId === id).length
    case 'organizationTypes': return experiences.filter(experience => experience.organizationTypeId === id).length
    case 'trainingLevels': return experiences.filter(experience => experience.trainingLevelId === id).length
    case 'terms':
      return activities.filter(activity => activity.termId === id).length
        + experiences.filter(experience => experience.termId === id).length
    case 'tags': return activities.filter(activity => activity.tagIds.includes(id)).length
    case 'demographics': return 0
  }
}

export const canRemoveDictionaryItem = (data: AppData, key: DictionaryKey, id: string) =>
  dictionaryUsage(data, key, id) === 0

export const updateDictionary = <K extends DictionaryKey>(data: AppData, key: K, items: Dictionaries[K]): AppData => ({
  ...data,
  dictionaries: { ...data.dictionaries, [key]: items },
})

export const mergeDictionaries = (partial?: Partial<Dictionaries>): Dictionaries => {
  const defaults = defaultDictionaries()
  if (!partial) return defaults
  return {
    supervisors: Array.isArray(partial.supervisors) ? partial.supervisors : defaults.supervisors,
    domains: Array.isArray(partial.domains) ? partial.domains : defaults.domains,
    organizationTypes: Array.isArray(partial.organizationTypes) ? partial.organizationTypes : defaults.organizationTypes,
    trainingLevels: Array.isArray(partial.trainingLevels) ? partial.trainingLevels : defaults.trainingLevels,
    terms: Array.isArray(partial.terms) ? partial.terms : defaults.terms,
    tags: Array.isArray(partial.tags) ? partial.tags : defaults.tags,
    demographics: Array.isArray(partial.demographics) ? partial.demographics : defaults.demographics,
  }
}

type LegacyActivity = Partial<Activity> & { supervisor?: string, tags?: string[] }
type LegacyType = Partial<ActivityType> & { domain?: string }
type LegacyExperience = Partial<Experience>

const integerMinutes = (value: unknown, fallback = 60) => {
  const minutes = Math.round(Number(value))
  return Number.isFinite(minutes) && minutes > 0 ? minutes : fallback
}

export const migrateToCurrent = (raw: {
  schemaVersion: number
  activities: LegacyActivity[]
  activityTypes: LegacyType[]
  experiences: LegacyExperience[]
  dictionaries?: Partial<Dictionaries>
}): AppData => {
  let dictionaries = mergeDictionaries(raw.dictionaries)

  const activityTypes: ActivityType[] = raw.activityTypes.map((type, index) => {
    const existingId = type.domainId && dictionaries.domains.some(item => item.id === type.domainId) ? type.domainId : ''
    const fromName = existingId ? { items: dictionaries.domains, id: existingId } : findOrCreateNamed(dictionaries.domains, type.domain ?? '')
    dictionaries = { ...dictionaries, domains: fromName.items }
    return {
      id: type.id || `type-${index + 1}`,
      name: type.name?.trim() || 'Untitled type',
      shortName: type.shortName?.trim() || type.name?.trim() || 'Type',
      domainId: fromName.id,
      color: type.color || '#42564b',
      defaultDuration: integerMinutes(type.defaultDuration, 60),
      category: type.category === 'direct' || type.category === 'supervision' ? type.category : 'indirect',
      active: type.active !== false,
    }
  })

  const experiences: Experience[] = raw.experiences.map((experience, index) => {
    const existingOrg = experience.organizationTypeId && dictionaries.organizationTypes.some(item => item.id === experience.organizationTypeId)
      ? experience.organizationTypeId : ''
    const org = existingOrg
      ? { items: dictionaries.organizationTypes, id: existingOrg }
      : findOrCreateNamed(dictionaries.organizationTypes, experience.setting ?? '')
    dictionaries = { ...dictionaries, organizationTypes: org.items }
    const trainingLevelId = experience.trainingLevelId && dictionaries.trainingLevels.some(item => item.id === experience.trainingLevelId)
      ? experience.trainingLevelId : ''
    const termId = experience.termId && dictionaries.terms.some(item => item.id === experience.termId)
      ? experience.termId : ''
    return {
      id: experience.id || `exp-${index + 1}`,
      name: experience.name?.trim() || 'Untitled experience',
      organization: experience.organization ?? '',
      setting: experience.setting ?? '',
      organizationTypeId: org.id,
      trainingLevelId,
      termId,
      targetMinutes: integerMinutes(experience.targetMinutes, 60),
      startDate: experience.startDate ?? '',
      endDate: experience.endDate ?? '',
      active: experience.active !== false,
    }
  })

  const activities: Activity[] = raw.activities.map((activity, index) => {
    let supervisorId = activity.supervisorId && dictionaries.supervisors.some(item => item.id === activity.supervisorId)
      ? activity.supervisorId : ''
    if (!supervisorId && activity.supervisor) {
      const created = findOrCreateNamed(dictionaries.supervisors, activity.supervisor)
      dictionaries = { ...dictionaries, supervisors: created.items }
      supervisorId = created.id
    }
    let tagIds = Array.isArray(activity.tagIds) ? activity.tagIds.filter(id => dictionaries.tags.some(item => item.id === id)) : []
    if (!tagIds.length && Array.isArray(activity.tags)) {
      tagIds = activity.tags.map(tag => {
        const created = findOrCreateNamed(dictionaries.tags, tag)
        dictionaries = { ...dictionaries, tags: created.items }
        return created.id
      }).filter(Boolean)
    }
    const termId = activity.termId && dictionaries.terms.some(item => item.id === activity.termId) ? activity.termId : ''
    return {
      id: activity.id || `activity-${index + 1}`,
      date: activity.date || '',
      startTime: activity.startTime || '',
      durationMinutes: integerMinutes(activity.durationMinutes, 1),
      activityTypeId: activity.activityTypeId || '',
      experienceId: activity.experienceId || '',
      supervisorId,
      termId,
      setting: activity.setting ?? '',
      client: activity.client ?? '',
      status: activity.status ?? 'unconfirmed',
      tagIds,
      notes: activity.notes ?? '',
      createdAt: activity.createdAt || '',
      updatedAt: activity.updatedAt || '',
    }
  })

  return {
    schemaVersion: SCHEMA_VERSION,
    activities,
    activityTypes,
    experiences,
    dictionaries,
  }
}
