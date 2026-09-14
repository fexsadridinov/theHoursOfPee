import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity as ActivityIcon, BookMarked, CalendarDays, Check, ChevronLeft, ChevronRight,
  CircleAlert, Clock3, Database, Download, FileBarChart, LayoutDashboard, Menu, MoreHorizontal,
  Plus, Search, Settings, SlidersHorizontal, Sparkles, Target, Trash2, Upload, Users, X,
} from 'lucide-react'
import { categoryMinutes, completedMinutes, formatDuration, groupMinutes, inDateRange, sumMinutes } from './calculations'
import { download, exportJson, isValidBackup, migrate, resetData, toCsv } from './data'
import { useAuth, navigate } from './auth/AuthProvider'
import { useWorkspace } from './workspace/WorkspaceProvider'
import {
  activeItems, canRemoveDictionaryItem, demographicKinds, dictionaryMeta, dictionaryUsage,
  findOrCreateDemographic, findOrCreateNamed, itemName, removeItem, renameItem, selectableItems, setItemActive,
} from './dictionaries'
import type { Activity, ActivityStatus, AppData, DemographicKind, Dictionaries, DictionaryItem, DictionaryKey, Experience } from './types'

type Page = 'dashboard' | 'calendar' | 'activities' | 'experiences' | 'reports' | 'settings'

const today = () => new Date().toLocaleDateString('en-CA')
const uid = () => crypto.randomUUID()
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = {}) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', options)
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const startOfWeek = (date: Date) => { const copy = new Date(date); const day = (copy.getDay() + 6) % 7; copy.setDate(copy.getDate() - day); return copy }
const iso = (date: Date) => date.toLocaleDateString('en-CA')

const emptyActivity = (data: AppData, date = today()): Activity => ({
  id: '', date, startTime: '09:00', durationMinutes: data.activityTypes[0]?.defaultDuration ?? 60,
  activityTypeId: data.activityTypes[0]?.id ?? '', experienceId: data.experiences[0]?.id ?? '',
  supervisorId: '', termId: data.experiences[0]?.termId ?? '', setting: data.experiences[0]?.setting ?? '',
  client: '', status: date > today() ? 'scheduled' : 'unconfirmed',
  tagIds: [], notes: '', createdAt: '', updatedAt: '',
})

function App() {
  const { data, setData, recordAudit, kind } = useWorkspace()
  const { remote, profile, signOut } = useAuth()
  const [page, setPage] = useState<Page>('dashboard')
  const [navOpen, setNavOpen] = useState(false)
  const [editing, setEditing] = useState<Activity | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 2600); return () => clearTimeout(id) }, [toast])

  const openNew = (date?: string) => setEditing(emptyActivity(data, date))
  const saveActivity = (activity: Activity) => {
    const now = new Date().toISOString()
    setData(current => ({ ...current, activities: activity.id
      ? current.activities.map(item => item.id === activity.id ? { ...activity, updatedAt: now } : item)
      : [{ ...activity, id: uid(), createdAt: now, updatedAt: now }, ...current.activities],
    }))
    setEditing(null); setToast(activity.id ? 'Activity updated' : 'Activity added')
  }
  const removeActivity = (id: string) => {
    if (!confirm('Delete this activity? This cannot be undone.')) return
    setData(current => ({ ...current, activities: current.activities.filter(item => item.id !== id) }))
    setEditing(null); setToast('Activity deleted')
  }

  const nav = [
    ['dashboard', LayoutDashboard, 'Overview'], ['calendar', CalendarDays, 'Calendar'],
    ['activities', Clock3, 'Activities'], ['experiences', Target, 'Experiences'],
    ['reports', FileBarChart, 'Reports'], ['settings', Settings, 'Settings'],
  ] as const

  return <div className="app-shell">
    <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark">HP</div><div><strong>the Hours of Pee</strong><span>personal hours tracker</span></div></div>
      <nav aria-label="Main navigation">
        {nav.map(([id, Icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => { setPage(id); setNavOpen(false) }}><Icon size={19}/><span>{label}</span></button>)}
        {remote && <button onClick={() => navigate('/account')}><Users size={19}/><span>Account</span></button>}
        {profile?.role === 'admin' && <button onClick={() => navigate('/admin')}><Sparkles size={19}/><span>Admin</span></button>}
        {remote && <button onClick={() => void signOut().then(() => navigate('/login'))}><span>Sign out</span></button>}
      </nav>
      <div className="privacy-note"><Sparkles size={17}/><div><strong>{kind === 'remote' ? 'Private account' : 'Local & private'}</strong><span>{kind === 'remote' ? 'Your rows are isolated by account. Use anonymous client labels only.' : 'Your data never leaves this browser.'}</span></div></div>
    </aside>
    {navOpen && <button className="backdrop" aria-label="Close menu" onClick={() => setNavOpen(false)}/>}
    <main>
      <header className="topbar">
        <button className="icon-button menu-button" onClick={() => setNavOpen(true)}><Menu size={21}/></button>
        <div className="eyebrow">PERSONAL WORKSPACE</div>
        <button className="primary compact" onClick={() => openNew()}><Plus size={18}/> Add activity</button>
      </header>
      {page === 'dashboard' && <Dashboard data={data} openNew={openNew} edit={setEditing} go={setPage}/>}
      {page === 'calendar' && <Calendar data={data} openNew={openNew} edit={setEditing}/>}
      {page === 'activities' && <Activities data={data} setData={setData} edit={setEditing} openNew={openNew} notify={setToast}/>}
      {page === 'experiences' && <Experiences data={data} setData={setData}/>}
      {page === 'reports' && <Reports data={data}/>}
      {page === 'settings' && <SettingsPage data={data} setData={setData} notify={setToast}/>}
    </main>
    {editing && <ActivityDialog activity={editing} data={data} setData={setData} close={() => setEditing(null)} save={saveActivity} remove={removeActivity}/>}
    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
  </div>
}

function PageHeading({ kicker, title, copy, action }: { kicker: string, title: string, copy: string, action?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="kicker">{kicker}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>
}

function Dashboard({ data, openNew, edit, go }: { data: AppData, openNew: () => void, edit: (a: Activity) => void, go: (p: Page) => void }) {
  const completed = data.activities.filter(a => a.status === 'confirmed' || a.status === 'approved')
  const now = new Date(); const weekStart = startOfWeek(now); const month = monthKey(now)
  const todayMinutes = sumMinutes(completed, a => a.date === today())
  const weekMinutes = sumMinutes(completed, a => a.date >= iso(weekStart) && a.date <= today())
  const monthMinutes = sumMinutes(completed, a => a.date.startsWith(month))
  const total = completedMinutes(data.activities)
  const byCategory = categoryMinutes(data.activities, data.activityTypes)
  const attention = data.activities.filter(a => (a.status === 'unconfirmed' && a.date <= today()) || a.status === 'rejected')
  const recent = [...data.activities].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  const weekBars = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(weekStart); start.setDate(start.getDate() - (7 - i) * 7)
    const end = new Date(start); end.setDate(end.getDate() + 6)
    return { label: dateLabel(iso(start), { month: 'short', day: 'numeric' }), minutes: sumMinutes(completed, a => inDateRange(a.date, iso(start), iso(end))) }
  })
  const maxWeek = Math.max(...weekBars.map(b => b.minutes), 1)

  return <section className="page">
    <PageHeading kicker="Your progress" title="Good afternoon." copy="A calm view of your time, progress, and what needs attention." action={<button className="primary" onClick={openNew}><Plus size={18}/> Log time</button>}/>
    <div className="metric-grid">
      <Metric label="Today" value={formatDuration(todayMinutes)} hint="Completed time" tone="sage"/>
      <Metric label="This week" value={formatDuration(weekMinutes)} hint={`${Math.round(weekMinutes / 60 / 20 * 100)}% of 20h rhythm`} tone="clay"/>
      <Metric label="This month" value={formatDuration(monthMinutes)} hint="Confirmed + approved" tone="blue"/>
      <Metric label="All-time total" value={formatDuration(total)} hint={`${formatDuration(sumMinutes(data.activities, a => a.status === 'approved'))} approved`} tone="gold"/>
    </div>
    <div className="dashboard-grid">
      <article className="panel span-2">
        <div className="panel-head"><div><span className="kicker">8 WEEK VIEW</span><h2>Hours over time</h2></div><span className="legend"><i/> Completed</span></div>
        <div className="bar-chart" role="img" aria-label="Completed hours over eight weeks">
          {weekBars.map((bar, i) => <div className="bar-column" key={i}><span className="bar-value">{bar.minutes ? (bar.minutes / 60).toFixed(1) : ''}</span><div className="bar" style={{ height: `${Math.max(4, bar.minutes / maxWeek * 100)}%` }}/><small>{bar.label}</small></div>)}
        </div>
      </article>
      <article className="panel attention-card">
        <div className="panel-head"><div><span className="kicker">TO DO</span><h2>Needs attention</h2></div><span className="count-badge">{attention.length}</span></div>
        {attention.length ? <div className="attention-list">{attention.slice(0, 3).map(a => <button key={a.id} onClick={() => edit(a)}><CircleAlert size={18}/><span><strong>{a.status === 'rejected' ? 'Review rejected entry' : 'Confirm past activity'}</strong><small>{dateLabel(a.date, { month: 'short', day: 'numeric' })} · {formatDuration(a.durationMinutes)}</small></span><ChevronRight size={17}/></button>)}</div> : <div className="empty-mini"><Check size={20}/>You’re all caught up.</div>}
        <button className="text-button" onClick={() => go('activities')}>View all activities <ChevronRight size={16}/></button>
      </article>
      <article className="panel">
        <div className="panel-head"><div><span className="kicker">BREAKDOWN</span><h2>Type of work</h2></div></div>
        <div className="donut-row"><div className="donut" style={{ background: `conic-gradient(#42564b 0 ${((byCategory.direct ?? 0) / Math.max(total, 1)) * 100}%, #b56f53 0 ${(((byCategory.direct ?? 0) + (byCategory.indirect ?? 0)) / Math.max(total, 1)) * 100}%, #d8c58d 0)` }}><div><strong>{formatDuration(total)}</strong><span>total</span></div></div><div className="donut-legend">{(['direct', 'indirect', 'supervision'] as const).map((key, i) => <div key={key}><i className={`dot d${i}`}/><span>{key}</span><strong>{formatDuration(byCategory[key] ?? 0)}</strong></div>)}</div></div>
      </article>
      <article className="panel span-2">
        <div className="panel-head"><div><span className="kicker">PROGRESS</span><h2>Active experiences</h2></div><button className="text-button" onClick={() => go('experiences')}>Manage <ChevronRight size={16}/></button></div>
        <div className="progress-list">{data.experiences.filter(e => e.active).map(exp => { const value = sumMinutes(completed, a => a.experienceId === exp.id); const pct = Math.min(100, value / exp.targetMinutes * 100); return <div key={exp.id}><div><strong>{exp.name}</strong><span>{formatDuration(value)} of {formatDuration(exp.targetMinutes)}</span></div><div className="progress"><i style={{ width: `${pct}%` }}/></div><small>{Math.round(pct)}%</small></div> })}</div>
      </article>
      <article className="panel full recent-panel">
        <div className="panel-head"><div><span className="kicker">LATEST</span><h2>Recent activities</h2></div><button className="text-button" onClick={() => go('activities')}>View all <ChevronRight size={16}/></button></div>
        <ActivityRows activities={recent} data={data} edit={edit}/>
      </article>
    </div>
  </section>
}

function Metric({ label, value, hint, tone }: { label: string, value: string, hint: string, tone: string }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>
}

function Calendar({ data, openNew, edit }: { data: AppData, openNew: (date?: string) => void, edit: (a: Activity) => void }) {
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState(today())
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = startOfWeek(first)
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(d.getDate() + i); return d })
  const selectedItems = data.activities.filter(a => a.date === selected).sort((a,b) => a.startTime.localeCompare(b.startTime))
  const selectedDate = new Date(`${selected}T12:00:00`); const selectedWeek = startOfWeek(selectedDate); const selectedMonth = monthKey(selectedDate)
  return <section className="page">
    <PageHeading kicker="Plan & review" title="Calendar" copy="See your scheduled and completed work in context." action={<button className="primary" onClick={() => openNew(selected)}><Plus size={18}/> Add on {dateLabel(selected, { day: 'numeric', month: 'short' })}</button>}/>
    <div className="calendar-layout">
      <article className="panel calendar-panel">
        <div className="calendar-toolbar"><div><button className="secondary" onClick={() => { setCursor(new Date()); setSelected(today()) }}>Today</button><button className="icon-button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft/></button><button className="icon-button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight/></button></div><h2>{cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2><span className="view-switch"><button className="active">Month</button><button disabled>Week</button></span></div>
        <div className="calendar-grid weekday-row">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d}>{d}</span>)}</div>
        <div className="calendar-grid month-grid">{days.map(day => { const dayIso = iso(day); const items = data.activities.filter(a => a.date === dayIso); return <button key={dayIso} className={`${day.getMonth() !== cursor.getMonth() ? 'muted' : ''} ${dayIso === selected ? 'selected' : ''} ${dayIso === today() ? 'today' : ''}`} onClick={() => setSelected(dayIso)}><span>{day.getDate()}</span><div>{items.slice(0, 3).map(a => <i key={a.id} style={{ background: data.activityTypes.find(t => t.id === a.activityTypeId)?.color }}/>)}</div>{items.length > 3 && <small>+{items.length - 3}</small>}</button> })}</div>
      </article>
      <aside className="panel day-panel">
        <span className="kicker">SELECTED DAY</span><h2>{dateLabel(selected, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
        <div className="day-totals"><div><span>Day</span><strong>{formatDuration(sumMinutes(selectedItems))}</strong></div><div><span>Week</span><strong>{formatDuration(sumMinutes(data.activities, a => inDateRange(a.date, iso(selectedWeek), iso(new Date(selectedWeek.getFullYear(), selectedWeek.getMonth(), selectedWeek.getDate()+6)))) )}</strong></div><div><span>Month</span><strong>{formatDuration(sumMinutes(data.activities, a => a.date.startsWith(selectedMonth)))}</strong></div>
        </div>
        <div className="day-list">{selectedItems.length ? selectedItems.map(a => <button key={a.id} onClick={() => edit(a)} style={{ borderLeftColor: data.activityTypes.find(t => t.id === a.activityTypeId)?.color }}><span>{a.startTime || 'Any time'}</span><strong>{data.activityTypes.find(t => t.id === a.activityTypeId)?.name}</strong><small>{formatDuration(a.durationMinutes)} · {a.status}</small></button>) : <div className="empty"><CalendarDays size={28}/><strong>Nothing logged</strong><span>This day is wide open.</span></div>}</div>
      </aside>
    </div>
  </section>
}

function Activities({ data, setData, edit, openNew, notify }: { data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>>, edit: (a: Activity) => void, openNew: () => void, notify: (s: string) => void }) {
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [selected, setSelected] = useState<string[]>([])
  const visible = useMemo(() => data.activities.filter(a => {
    const type = data.activityTypes.find(t => t.id === a.activityTypeId)?.name ?? ''
    const exp = data.experiences.find(e => e.id === a.experienceId)?.name ?? ''
    const supervisor = itemName(data.dictionaries.supervisors, a.supervisorId)
    const term = itemName(data.dictionaries.terms, a.termId)
    const tags = a.tagIds.map(id => itemName(data.dictionaries.tags, id)).join(' ')
    return (status === 'all' || a.status === status) && `${type} ${exp} ${supervisor} ${term} ${tags} ${a.client} ${a.notes}`.toLowerCase().includes(query.toLowerCase())
  }).sort((a,b) => b.date.localeCompare(a.date)), [data, query, status])
  const bulkStatus = (next: ActivityStatus) => { setData(current => ({ ...current, activities: current.activities.map(a => selected.includes(a.id) ? { ...a, status: next, updatedAt: new Date().toISOString() } : a) })); setSelected([]); notify(`${selected.length} activities updated`) }
  const bulkDelete = () => { if (!confirm(`Delete ${selected.length} selected activities?`)) return; setData(current => ({ ...current, activities: current.activities.filter(a => !selected.includes(a.id)) })); setSelected([]); notify('Activities deleted') }
  return <section className="page">
    <PageHeading kicker="Your records" title="Activities" copy={`${visible.length} entries · ${formatDuration(sumMinutes(visible))} shown`} action={<button className="primary" onClick={openNew}><Plus size={18}/> Add activity</button>}/>
    <article className="panel table-panel">
      <div className="filterbar"><label className="search"><Search size={18}/><input aria-label="Search activities" placeholder="Search activities…" value={query} onChange={e => setQuery(e.target.value)}/></label><label className="select-wrap"><SlidersHorizontal size={17}/><select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{['scheduled','unconfirmed','confirmed','approved','rejected'].map(s => <option key={s}>{s}</option>)}</select></label><button className="secondary" onClick={() => download('hours-of-pee-activities.csv', toCsv(data, visible), 'text/csv')}><Download size={17}/> Export</button></div>
      {selected.length > 0 && <div className="bulkbar"><strong>{selected.length} selected</strong><button onClick={() => bulkStatus('confirmed')}><Check size={16}/> Confirm</button><button onClick={() => bulkStatus('unconfirmed')}>Unconfirm</button><button className="danger-text" onClick={bulkDelete}><Trash2 size={16}/> Delete</button></div>}
      <div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select all" checked={visible.length > 0 && visible.every(a => selected.includes(a.id))} onChange={e => setSelected(e.target.checked ? visible.map(a => a.id) : [])}/></th><th>Date</th><th>Status</th><th>Activity type</th><th>Experience</th><th>Supervisor</th><th>Duration</th><th>Notes</th><th/></tr></thead><tbody>{visible.map(a => <tr key={a.id}><td><input type="checkbox" aria-label={`Select ${a.notes}`} checked={selected.includes(a.id)} onChange={e => setSelected(s => e.target.checked ? [...s, a.id] : s.filter(id => id !== a.id))}/></td><td><strong>{dateLabel(a.date, { day: '2-digit', month: 'short', year: 'numeric' })}</strong><small>{a.startTime}</small></td><td><Status value={a.status}/></td><td><span className="type-cell"><i style={{ background: data.activityTypes.find(t => t.id === a.activityTypeId)?.color }}/>{data.activityTypes.find(t => t.id === a.activityTypeId)?.name}</span></td><td>{data.experiences.find(e => e.id === a.experienceId)?.name}</td><td>{itemName(data.dictionaries.supervisors, a.supervisorId, '—')}</td><td><strong>{formatDuration(a.durationMinutes)}</strong></td><td className="notes-cell">{a.notes || '—'}</td><td><button className="icon-button" aria-label="Edit activity" onClick={() => edit(a)}><MoreHorizontal size={19}/></button></td></tr>)}</tbody></table></div>
      {!visible.length && <div className="empty"><Search size={30}/><strong>No activities found</strong><span>Try changing the search or filters.</span></div>}
    </article>
  </section>
}

function ActivityRows({ activities, data, edit }: { activities: Activity[], data: AppData, edit: (a: Activity) => void }) {
  return <div className="activity-rows">{activities.map(a => <button key={a.id} onClick={() => edit(a)}><span className="date-tile"><strong>{dateLabel(a.date, { day: '2-digit' })}</strong><small>{dateLabel(a.date, { month: 'short' })}</small></span><i style={{ background: data.activityTypes.find(t => t.id === a.activityTypeId)?.color }}/><span className="grow"><strong>{data.activityTypes.find(t => t.id === a.activityTypeId)?.name}</strong><small>{data.experiences.find(e => e.id === a.experienceId)?.name} · {a.notes}</small></span><Status value={a.status}/><strong>{formatDuration(a.durationMinutes)}</strong><ChevronRight size={17}/></button>)}</div>
}

function Status({ value }: { value: ActivityStatus }) { return <span className={`status ${value}`}><i/>{value}</span> }

function Experiences({ data, setData }: { data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>> }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [organization, setOrganization] = useState('')
  const [target, setTarget] = useState('150')
  const [organizationTypeId, setOrganizationTypeId] = useState(data.dictionaries.organizationTypes.find(item => item.active)?.id ?? '')
  const [trainingLevelId, setTrainingLevelId] = useState(data.dictionaries.trainingLevels.find(item => item.active)?.id ?? '')
  const [termId, setTermId] = useState(data.dictionaries.terms.find(item => item.active)?.id ?? '')
  const completed = data.activities.filter(a => a.status === 'confirmed' || a.status === 'approved')
  const add = () => {
    if (!name.trim()) return
    const experience: Experience = {
      id: uid(), name: name.trim(), organization: organization.trim(), setting: itemName(data.dictionaries.organizationTypes, organizationTypeId),
      organizationTypeId, trainingLevelId, termId, targetMinutes: Math.round(Number(target) * 60),
      startDate: today(), endDate: '', active: true,
    }
    setData(current => ({ ...current, experiences: [...current.experiences, experience] }))
    setName(''); setOrganization(''); setAdding(false)
  }
  return <section className="page"><PageHeading kicker="Placements" title="Experiences" copy="Track progress across practicums, jobs, rotations, and other placements." action={<button className="primary" onClick={() => setAdding(true)}><Plus size={18}/> New experience</button>}/>
    {adding && <article className="panel inline-form experience-form">
      <label>Name<input value={name} onChange={e => setName(e.target.value)} autoFocus/></label>
      <label>Organization<input value={organization} onChange={e => setOrganization(e.target.value)}/></label>
      <label>Target hours<input type="number" min="1" value={target} onChange={e => setTarget(e.target.value)}/></label>
      <label>Organization type<select value={organizationTypeId} onChange={e => setOrganizationTypeId(e.target.value)}><option value="">None</option>{activeItems(data.dictionaries.organizationTypes, organizationTypeId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Training level<select value={trainingLevelId} onChange={e => setTrainingLevelId(e.target.value)}><option value="">None</option>{activeItems(data.dictionaries.trainingLevels, trainingLevelId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Term<select value={termId} onChange={e => setTermId(e.target.value)}><option value="">None</option>{activeItems(data.dictionaries.terms, termId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button className="primary" onClick={add}>Save experience</button>
      <button className="secondary" onClick={() => setAdding(false)}>Cancel</button>
    </article>}
    <div className="experience-grid">{data.experiences.map(exp => {
      const minutes = sumMinutes(completed, a => a.experienceId === exp.id)
      const pct = Math.min(100, minutes / exp.targetMinutes * 100)
      const orgType = itemName(data.dictionaries.organizationTypes, exp.organizationTypeId)
      const level = itemName(data.dictionaries.trainingLevels, exp.trainingLevelId)
      const term = itemName(data.dictionaries.terms, exp.termId)
      return <article className="panel experience-card" key={exp.id}>
        <div className="experience-top"><div className="experience-icon"><Target size={21}/></div><Status value={exp.active ? 'confirmed' : 'unconfirmed'}/></div>
        <h2>{exp.name}</h2>
        <p>{[exp.organization || 'No organization', orgType || exp.setting || 'General setting', level, term].filter(Boolean).join(' · ')}</p>
        <div className="big-progress"><div><strong>{formatDuration(minutes)}</strong><span>of {formatDuration(exp.targetMinutes)}</span></div><strong>{Math.round(pct)}%</strong></div>
        <div className="progress"><i style={{ width: `${pct}%` }}/></div>
        <div className="experience-meta"><span>{data.activities.filter(a => a.experienceId === exp.id).length} activities</span><span>{exp.startDate ? `Since ${dateLabel(exp.startDate, { month: 'short', year: 'numeric' })}` : 'No start date'}</span></div>
      </article>
    })}</div>
  </section>
}

function Reports({ data }: { data: AppData }) {
  const completed = data.activities.filter(a => a.status === 'confirmed' || a.status === 'approved')
  const dates = completed.map(a => a.date).sort(); const [from, setFrom] = useState(dates[0] ?? today()); const [to, setTo] = useState(today()); const [experience, setExperience] = useState('all'); const [approvedOnly, setApprovedOnly] = useState(false)
  const filtered = completed.filter(a => inDateRange(a.date, from, to) && (experience === 'all' || a.experienceId === experience) && (!approvedOnly || a.status === 'approved'))
  const byType = groupMinutes(filtered, a => data.activityTypes.find(t => t.id === a.activityTypeId)?.name ?? 'Other')
  const byExperience = groupMinutes(filtered, a => data.experiences.find(e => e.id === a.experienceId)?.name ?? 'Other')
  const bySupervisor = groupMinutes(filtered, a => itemName(data.dictionaries.supervisors, a.supervisorId, 'Unassigned'))
  const byDomain = groupMinutes(filtered, a => {
    const type = data.activityTypes.find(t => t.id === a.activityTypeId)
    return itemName(data.dictionaries.domains, type?.domainId ?? '', 'Unassigned')
  })
  const exportReport = () => download('hours-of-pee-report.csv', toCsv(data, filtered), 'text/csv')
  return <section className="page report-page"><PageHeading kicker="Review & export" title="Reports" copy="Create a clear, printable record of your completed work." action={<div className="button-row"><button className="secondary" onClick={exportReport}><Download size={17}/> CSV</button><button className="primary" onClick={() => print()}><FileBarChart size={17}/> Print / PDF</button></div>}/>
    <article className="panel report-filters"><label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label><label>To<input type="date" value={to} onChange={e => setTo(e.target.value)}/></label><label>Experience<select value={experience} onChange={e => setExperience(e.target.value)}><option value="all">All experiences</option>{data.experiences.map(e => <option value={e.id} key={e.id}>{e.name}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={approvedOnly} onChange={e => setApprovedOnly(e.target.checked)}/> Approved only</label></article>
    <article className="panel printable-report"><div className="report-title"><div><span className="kicker">ACTIVITY SUMMARY</span><h2>Hours record</h2><p>{dateLabel(from, { day: 'numeric', month: 'long', year: 'numeric' })} — {dateLabel(to, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div><div className="report-total"><span>Total completed</span><strong>{formatDuration(sumMinutes(filtered))}</strong><small>{filtered.length} activities</small></div></div>
      <div className="report-breakdown"><ReportGroup title="By activity type" values={byType}/><ReportGroup title="By experience" values={byExperience}/><ReportGroup title="By supervisor" values={bySupervisor}/><ReportGroup title="By domain" values={byDomain}/></div>
      <div className="report-details"><h3>Activity details</h3><table><thead><tr><th>Date</th><th>Activity</th><th>Experience</th><th>Status</th><th>Duration</th></tr></thead><tbody>{filtered.sort((a,b) => a.date.localeCompare(b.date)).map(a => <tr key={a.id}><td>{dateLabel(a.date, { day: '2-digit', month: 'short', year: 'numeric' })}</td><td>{data.activityTypes.find(t => t.id === a.activityTypeId)?.name}<small>{a.notes}</small></td><td>{data.experiences.find(e => e.id === a.experienceId)?.name}</td><td>{a.status}</td><td>{formatDuration(a.durationMinutes)}</td></tr>)}</tbody></table></div>
      <div className="signature"><span>Signature</span><i/><span>Date</span><i/></div>
    </article>
  </section>
}

function ReportGroup({ title, values }: { title: string, values: Record<string, number> }) {
  const max = Math.max(...Object.values(values), 1)
  return <div><h3>{title}</h3>{Object.entries(values).sort((a,b) => b[1]-a[1]).map(([label, minutes]) => <div className="report-bar" key={label}><div><span>{label}</span><strong>{formatDuration(minutes)}</strong></div><i><b style={{ width: `${minutes / max * 100}%` }}/></i></div>)}</div>
}

function SettingsPage({ data, setData, notify }: { data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>>, notify: (s: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const { recordAudit } = useWorkspace()
  const backup = async (redact = false) => {
    download(`hours-of-pee-backup-${today()}${redact ? '-redacted' : ''}.json`, exportJson(data, { redactClients: redact }), 'application/json')
    await recordAudit('data_export')
  }
  const restore = async (file?: File) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      if (!isValidBackup(parsed)) throw new Error()
      const next = migrate(parsed)
      if (!confirm(`Restore ${next.activities.length} activities? This replaces current data after confirmation.`)) return
      setData(next); await recordAudit('data_import'); notify('Backup restored')
    } catch { alert('This file is not a valid the Hours of Pee backup.') }
  }
  const reset = () => { if (prompt('Type DELETE to reset all local data.') !== 'DELETE') return; setData(resetData()); notify('Local data reset') }
  return <section className="page"><PageHeading kicker="Your workspace" title="Settings & data" copy="Manage local categories, dictionaries, backups, and privacy controls."/>
    <div className="settings-grid">
      <article className="panel settings-card"><div className="settings-icon"><Database/></div><h2>Backup & restore</h2><p>Save a complete, versioned copy of your data. Use a redacted export when sharing hours without client labels.</p><div className="button-row"><button className="primary" onClick={() => void backup(false)}><Download size={17}/> JSON</button><button className="secondary" onClick={() => { download('hours-of-pee-activities.csv', toCsv(data), 'text/csv'); void recordAudit('data_export') }}>CSV</button><button className="secondary" onClick={() => void backup(true)}>Redacted JSON</button><button className="secondary" onClick={() => download('hours-of-pee-redacted.csv', toCsv(data, data.activities, { redactClients: true }), 'text/csv')}>Redacted CSV</button><button className="secondary" onClick={() => input.current?.click()}><Upload size={17}/> Restore</button><input ref={input} hidden type="file" accept="application/json" onChange={e => restore(e.target.files?.[0])}/></div></article>
      <article className="panel settings-card"><div className="settings-icon"><ActivityIcon/></div><h2>Activity types</h2><p>These configurable categories power colors, domains, defaults, and report groupings.</p><div className="type-settings">{data.activityTypes.map(type => <div key={type.id}><i style={{ background: type.color }}/><span><strong>{type.name}</strong><small>{itemName(data.dictionaries.domains, type.domainId, 'No domain')} · {type.category}</small></span><label className="type-domain"><span className="sr-only">Domain for {type.name}</span><select aria-label={`Domain for ${type.name}`} value={type.domainId} onChange={e => setData(current => ({ ...current, activityTypes: current.activityTypes.map(item => item.id === type.id ? { ...item, domainId: e.target.value } : item) }))}>{activeItems(data.dictionaries.domains, type.domainId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span>{formatDuration(type.defaultDuration)}</span></div>)}</div></article>
      <article className="panel settings-card privacy-card"><div className="settings-icon"><Users/></div><h2>Privacy by design</h2><p>Use anonymous client labels only. Never enter names, addresses, medical record numbers, or other identifying details.</p><div className="privacy-lines"><span><Check/> Browser-local storage</span><span><Check/> No account or analytics</span><span><Check/> Redactable exports</span></div></article>
      <article className="panel settings-card danger-card"><div className="settings-icon"><Trash2/></div><h2>Reset local data</h2><p>Remove all entries and restore the example workspace. Download a backup first if you may need this data.</p><button className="danger" onClick={reset}>Delete all local data</button></article>
      <DictionaryManager data={data} setData={setData} notify={notify}/>
    </div>
  </section>
}

function DictionaryManager({ data, setData, notify }: { data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>>, notify: (s: string) => void }) {
  const [tab, setTab] = useState<DictionaryKey>('supervisors')
  const [newName, setNewName] = useState('')
  const [demoKind, setDemoKind] = useState<DemographicKind>('ageGroup')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const meta = dictionaryMeta.find(item => item.key === tab)!
  const items = data.dictionaries[tab]
  const visible = tab === 'demographics'
    ? data.dictionaries.demographics.filter(item => item.kind === demoKind)
    : items

  const commitName = (id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) { setDrafts(current => { const next = { ...current }; delete next[id]; return next }); return }
    setData(current => {
      const list = current.dictionaries[tab]
      return { ...current, dictionaries: { ...current.dictionaries, [tab]: renameItem(list as DictionaryItem[], id, trimmed) } as Dictionaries }
    })
    setDrafts(current => { const next = { ...current }; delete next[id]; return next })
  }

  const add = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    setData(current => {
      if (tab === 'demographics') {
        const created = findOrCreateDemographic(current.dictionaries.demographics, trimmed, demoKind)
        if (current.dictionaries.demographics.some(item => item.id === created.id)) notify('That value already exists')
        else notify('Dictionary value added')
        return { ...current, dictionaries: { ...current.dictionaries, demographics: created.items } }
      }
      const created = findOrCreateNamed(current.dictionaries[tab] as DictionaryItem[], trimmed)
      if ((current.dictionaries[tab] as DictionaryItem[]).some(item => item.id === created.id)) notify('That value already exists')
      else notify('Dictionary value added')
      return { ...current, dictionaries: { ...current.dictionaries, [tab]: created.items } }
    })
    setNewName('')
  }

  const toggle = (id: string, active: boolean) => {
    setData(current => ({ ...current, dictionaries: { ...current.dictionaries, [tab]: setItemActive(current.dictionaries[tab] as DictionaryItem[], id, active) } as Dictionaries }))
  }

  const remove = (id: string) => {
    if (!canRemoveDictionaryItem(data, tab, id)) return
    if (!confirm('Remove this value from the dictionary?')) return
    setData(current => ({ ...current, dictionaries: { ...current.dictionaries, [tab]: removeItem(current.dictionaries[tab] as DictionaryItem[], id) } as Dictionaries }))
    notify('Dictionary value removed')
  }

  return <article className="panel settings-card dictionary-card">
    <div className="settings-icon"><BookMarked/></div>
    <h2>Dictionaries</h2>
    <p>{meta.hint}</p>
    <div className="dict-tabs" role="tablist" aria-label="Dictionary categories">
      {dictionaryMeta.map(item => <button key={item.key} role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'active' : ''} onClick={() => { setTab(item.key); setNewName(''); setDrafts({}) }}>{item.label}</button>)}
    </div>
    {tab === 'demographics' && <div className="demo-kinds">{demographicKinds.map(kind => <button key={kind.id} className={demoKind === kind.id ? 'active' : ''} onClick={() => setDemoKind(kind.id)}>{kind.label}</button>)}</div>}
    <div className="dict-list">
      {visible.map(item => {
        const used = dictionaryUsage(data, tab, item.id)
        return <div className={`dict-row ${item.active ? '' : 'inactive'}`} key={item.id}>
          <input aria-label={`Name for ${item.name}`} value={drafts[item.id] ?? item.name} onChange={e => setDrafts(current => ({ ...current, [item.id]: e.target.value }))} onBlur={e => commitName(item.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}/>
          <small>{used ? `${used} in use` : 'Unused'}</small>
          <button type="button" className="secondary compact" onClick={() => toggle(item.id, !item.active)}>{item.active ? 'Deactivate' : 'Activate'}</button>
          <button type="button" className="icon-button" aria-label={`Remove ${item.name}`} disabled={!canRemoveDictionaryItem(data, tab, item.id)} onClick={() => remove(item.id)}><Trash2 size={16}/></button>
        </div>
      })}
      {!visible.length && <div className="empty-mini">No values in this list yet.</div>}
    </div>
    <form className="dict-add" onSubmit={e => { e.preventDefault(); add() }}>
      <input aria-label={`Add ${meta.label.toLowerCase()}`} placeholder={`Add ${meta.label.toLowerCase().replace(/s$/, '')}`} value={newName} onChange={e => setNewName(e.target.value)}/>
      <button className="primary compact" type="submit"><Plus size={16}/> Add</button>
    </form>
  </article>
}

function addNamedValue(setData: React.Dispatch<React.SetStateAction<AppData>>, key: Exclude<DictionaryKey, 'demographics'>, name: string) {
  let id = ''
  setData(current => {
    const created = findOrCreateNamed(current.dictionaries[key], name)
    id = created.id
    return { ...current, dictionaries: { ...current.dictionaries, [key]: created.items } }
  })
  return id
}

function DictionarySelect({ items, value, onChange, onCreate, allowEmpty, emptyLabel = 'None', labelledBy }: {
  items: DictionaryItem[], value: string, onChange: (id: string) => void, onCreate?: (name: string) => void,
  allowEmpty?: boolean, emptyLabel?: string, labelledBy?: string
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const create = () => {
    if (!name.trim() || !onCreate) return
    onCreate(name.trim())
    setName(''); setAdding(false)
  }
  return <div className="dict-select">
    <select aria-labelledby={labelledBy} value={value} onChange={e => onChange(e.target.value)}>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {activeItems(items, value).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    {onCreate && !adding && <button type="button" className="secondary compact" onClick={() => setAdding(true)}>Add</button>}
    {adding && <>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="New value" autoFocus onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create() } }}/>
      <button type="button" className="primary compact" onClick={create}>Save</button>
      <button type="button" className="secondary compact" onClick={() => setAdding(false)}>Cancel</button>
    </>}
  </div>
}

function ActivityDialog({ activity, data, setData, close, save, remove }: { activity: Activity, data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>>, close: () => void, save: (a: Activity) => void, remove: (id: string) => void }) {
  const [form, setForm] = useState(activity)
  const update = <K extends keyof Activity>(key: K, value: Activity[K]) => setForm(current => ({ ...current, [key]: value }))
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!form.date || !form.activityTypeId || form.durationMinutes <= 0) return; save({ ...form, durationMinutes: Math.round(form.durationMinutes) }) }
  const toggleTag = (id: string) => update('tagIds', form.tagIds.includes(id) ? form.tagIds.filter(tag => tag !== id) : [...form.tagIds, id])
  return <div className="modal-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) close() }}><form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="activity-title"><div className="modal-head"><div><span className="kicker">{activity.id ? 'EDIT RECORD' : 'NEW RECORD'}</span><h2 id="activity-title">{activity.id ? 'Edit activity' : 'Log your time'}</h2></div><button type="button" className="icon-button" onClick={close}><X/></button></div>
    <div className="form-grid">
      <label>Date<input required type="date" value={form.date} onChange={e => update('date', e.target.value)}/></label>
      <label>Start time<input type="time" value={form.startTime} onChange={e => update('startTime', e.target.value)}/></label>
      <label>Duration (minutes)<input required min="1" step="1" type="number" value={form.durationMinutes} onChange={e => update('durationMinutes', Number(e.target.value))}/><small>{formatDuration(Math.round(form.durationMinutes) || 0)} · {((Math.round(form.durationMinutes) || 0) / 60).toFixed(2)} hours</small></label>
      <label>Status<select value={form.status} onChange={e => update('status', e.target.value as ActivityStatus)}>{['scheduled','unconfirmed','confirmed','approved','rejected'].map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="full">Activity type<select value={form.activityTypeId} onChange={e => { const id = e.target.value; const type = data.activityTypes.find(t => t.id === id); setForm(current => ({ ...current, activityTypeId: id, durationMinutes: current.id ? current.durationMinutes : type?.defaultDuration ?? current.durationMinutes })) }}>{data.activityTypes.filter(t => t.active).map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
      <label className="full">Experience<select value={form.experienceId} onChange={e => { const experience = data.experiences.find(item => item.id === e.target.value); setForm(current => ({ ...current, experienceId: e.target.value, termId: current.termId || experience?.termId || '', setting: experience?.setting || current.setting })) }}>{data.experiences.filter(x => x.active).map(x => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
      <div className="field"><span id="supervisor-label">Supervisor</span><DictionarySelect labelledBy="supervisor-label" items={data.dictionaries.supervisors} value={form.supervisorId} allowEmpty emptyLabel="None" onChange={id => update('supervisorId', id)} onCreate={name => update('supervisorId', addNamedValue(setData, 'supervisors', name))}/></div>
      <div className="field"><span id="term-label">Term</span><DictionarySelect labelledBy="term-label" items={data.dictionaries.terms} value={form.termId} allowEmpty emptyLabel="None" onChange={id => update('termId', id)} onCreate={name => update('termId', addNamedValue(setData, 'terms', name))}/></div>
      <label>Anonymous client<input value={form.client} onChange={e => update('client', e.target.value)} placeholder="e.g. Client 014"/><small>Never enter a client’s real name.</small></label>
      <div className="field full"><span>Tags</span>
        <div className="chip-row">
          {selectableItems(data.dictionaries.tags, form.tagIds).map(item =>
            <button type="button" key={item.id} className={`chip ${form.tagIds.includes(item.id) ? 'on' : ''}`} onClick={() => toggleTag(item.id)}>{item.name}</button>)}
          <AddChip onCreate={name => toggleTag(addNamedValue(setData, 'tags', name))}/>
        </div>
      </div>
      <label className="full">Notes<textarea rows={3} value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="A short, useful note…"/></label>
    </div>
    <div className="modal-actions">{activity.id && <button type="button" className="danger-text" onClick={() => remove(activity.id)}><Trash2 size={17}/> Delete</button>}<span/><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" type="submit">Save activity</button></div>
  </form></div>
}

function AddChip({ onCreate }: { onCreate: (name: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const create = () => { if (!name.trim()) return; onCreate(name.trim()); setName(''); setAdding(false) }
  if (!adding) return <button type="button" className="chip add" onClick={() => setAdding(true)}><Plus size={14}/> Add tag</button>
  return <span className="chip-add"><input value={name} onChange={e => setName(e.target.value)} placeholder="New tag" autoFocus onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create() } }}/><button type="button" className="primary compact" onClick={create}>Save</button></span>
}

export default App
