import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity as ActivityIcon, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, Database, Download, FileBarChart, LayoutDashboard, LogOut, Menu, MoreHorizontal,
  Plus, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Upload, UserCircle, Users, X,
} from 'lucide-react'
import {
  categoryMinutes, formatHours, groupMinutes, hoursFromMinutes,
  inDateRange, minutesFromHours, sumMinutes, totalMinutes,
} from './calculations'
import { download, exportJson, isValidBackup, migrate, resetData, toCsv } from './data'
import { useAuth, navigate } from './auth/AuthProvider'
import { AccountPage, AdminPage } from './auth/pages'
import { countLabels, entityCounts } from './migration'
import { useWorkspace } from './workspace/WorkspaceProvider'
import {
  activeItems, canRemoveActivityType, canRemoveDictionaryItem, dictionaryMeta, dictionaryUsage,
  findOrCreateNamed, itemName, removeItem, renameItem, setItemActive,
} from './dictionaries'
import type { Activity, ActivityCategory, ActivityType, AppData, DictionaryItem, DictionaryKey } from './types'

type Page = 'dashboard' | 'calendar' | 'activities' | 'reports' | 'settings'
export type Section = 'admin' | 'account'

const today = () => new Date().toLocaleDateString('en-CA')
const uid = () => crypto.randomUUID()
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = {}) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', options)
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const startOfWeek = (date: Date) => { const copy = new Date(date); const day = (copy.getDay() + 6) % 7; copy.setDate(copy.getDate() - day); return copy }
const iso = (date: Date) => date.toLocaleDateString('en-CA')
const typeOf = (data: AppData, id: string) => data.activityTypes.find(type => type.id === id)
const typeName = (data: AppData, id: string) => typeOf(data, id)?.name ?? 'Activity'

const emptyActivity = (data: AppData, date = today()): Activity => {
  const type = data.activityTypes.find(item => item.active) ?? data.activityTypes[0]
  return {
    id: '', date, durationMinutes: type?.defaultMinutes ?? 60, activityTypeId: type?.id ?? '',
    supervisorId: '', notes: '', createdAt: '', updatedAt: '',
  }
}

function SaveBanner() {
  const { status, retry, kind } = useWorkspace()
  // "Saved" is reassurance, not a permanent state, so it fades out instead of holding a bar on every page.
  const [showSaved, setShowSaved] = useState(false)
  useEffect(() => {
    if (status !== 'saved') return
    setShowSaved(true)
    const id = window.setTimeout(() => setShowSaved(false), 2400)
    return () => clearTimeout(id)
  }, [status])
  if (kind === 'local') return null
  if (status === 'saved') return showSaved ? <div className="sync-banner saved" role="status">Online and saved</div> : null
  if (status === 'saving') return <div className="sync-banner" role="status">Saving…</div>
  if (status === 'offline') return <div className="sync-banner warn" role="status">Your changes could not be saved. Check your connection and try again.</div>
  if (status === 'expired') return <div className="sync-banner warn" role="status">Your session expired. Please sign in again. <button className="text-button" onClick={() => navigate('/login')}>Sign in</button></div>
  return <div className="sync-banner warn" role="status">Your changes could not be saved. Check your connection and try again. <button className="text-button" onClick={retry}>Retry</button></div>
}

function MigrationModal() {
  const { migration, resolveMigration } = useWorkspace()
  if (!migration) return null
  const counts = entityCounts(migration.local)
  return <div className="modal-layer"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="migrate-title">
    <h2 id="migrate-title">Upload local data?</h2>
    <p>This browser has a local workspace. Upload adds missing records only and never overwrites rows in your account.</p>
    <ul className="migrate-counts">
      {countLabels.map(({ key, label }) => <li key={key}>{label}: {counts[key]}</li>)}
    </ul>
    <div className="modal-actions">
      <button className="primary" onClick={() => void resolveMigration('upload')}>Upload local data</button>
      <button className="secondary" onClick={() => void resolveMigration('keep')}>Keep local data only</button>
      <button className="danger-text" onClick={() => void resolveMigration('cancel')}>Cancel</button>
    </div>
  </div></div>
}

function App({ section }: { section?: Section }) {
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
    setEditing(null); setToast(activity.id ? 'Hours updated' : 'Hours logged')
  }
  const removeActivity = (id: string) => {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    setData(current => ({ ...current, activities: current.activities.filter(item => item.id !== id) }))
    setEditing(null); setToast('Entry deleted')
  }

  const nav = [
    ['dashboard', LayoutDashboard, 'Overview'], ['calendar', CalendarDays, 'Calendar'],
    ['activities', Clock3, 'Hours'], ['reports', FileBarChart, 'Reports'], ['settings', Settings, 'Settings'],
  ] as const

  const goDashboard = () => { setPage('dashboard'); setNavOpen(false); if (section) navigate('/') }
  const openPage = (next: Page) => { setPage(next); setNavOpen(false); if (section) navigate('/') }
  const openSection = (path: string) => { setNavOpen(false); navigate(path) }
  const currentLabel = section === 'admin' ? 'Users & invitations'
    : section === 'account' ? 'Account & security'
    : nav.find(([id]) => id === page)?.[2] ?? 'Overview'
  const atDashboard = !section && page === 'dashboard'

  return <div className="app-shell">
    <aside className={`sidebar ${navOpen ? 'open' : ''}`} id="app-sidebar">
      <button type="button" className="brand" onClick={goDashboard} aria-label="the Hours of Pee — go to overview">
        <div className="brand-mark">HP</div><div><strong>the Hours of Pee</strong><span>personal hours tracker</span></div>
      </button>
      <nav aria-label="Main navigation">
        <span className="nav-label">Workspace</span>
        {nav.map(([id, Icon, label]) => <button key={id} type="button" aria-current={!section && page === id ? 'page' : undefined} className={!section && page === id ? 'active' : ''} onClick={() => openPage(id)}><Icon size={19}/><span>{label}</span></button>)}
        {remote && <>
          <span className="nav-label">Your account</span>
          <button type="button" aria-current={section === 'account' ? 'page' : undefined} className={section === 'account' ? 'active' : ''} onClick={() => openSection('/account')}><UserCircle size={19}/><span>Account</span></button>
          {profile?.role === 'admin' && <button type="button" aria-current={section === 'admin' ? 'page' : undefined} className={section === 'admin' ? 'active' : ''} onClick={() => openSection('/admin')}><ShieldCheck size={19}/><span>Admin</span></button>}
          <button type="button" className="nav-signout" onClick={() => void signOut().then(() => navigate('/login'))}><LogOut size={19}/><span>Sign out</span></button>
        </>}
      </nav>
      <div className="privacy-note"><Sparkles size={17}/><div><strong>{kind === 'remote' ? 'Private account' : 'Local & private'}</strong><span>{kind === 'remote' ? 'Your hours are isolated by account and only visible to you.' : 'Your data never leaves this browser.'}</span></div></div>
    </aside>
    {navOpen && <button className="backdrop" aria-label="Close menu" onClick={() => setNavOpen(false)}/>}
    <main>
      <header className="topbar">
        <button className="icon-button menu-button" aria-label="Open navigation" aria-controls="app-sidebar" aria-expanded={navOpen} onClick={() => setNavOpen(true)}><Menu size={21}/></button>
        <div className="crumbs">
          {atDashboard
            ? <span className="eyebrow">PERSONAL WORKSPACE</span>
            : <><button type="button" className="crumb-home" onClick={goDashboard}><LayoutDashboard size={15}/><span>Dashboard</span></button><ChevronRight size={14} aria-hidden/><span className="crumb-current">{currentLabel}</span></>}
        </div>
        <button className="primary compact" onClick={() => openNew()}><Plus size={18}/> Log hours</button>
      </header>
      <SaveBanner />
      {section === 'admin' ? <AdminPage/> : section === 'account' ? <AccountPage/> : <>
        {page === 'dashboard' && <Dashboard data={data} openNew={openNew} edit={setEditing} go={setPage}/>}
        {page === 'calendar' && <Calendar data={data} openNew={openNew} edit={setEditing}/>}
        {page === 'activities' && <Activities data={data} setData={setData} edit={setEditing} openNew={openNew} notify={setToast}/>}
        {page === 'reports' && <Reports data={data}/>}
        {page === 'settings' && <SettingsPage data={data} setData={setData} notify={setToast}/>}
      </>}
    </main>
    <MigrationModal />
    {editing && <ActivityDialog activity={editing} data={data} setData={setData} close={() => setEditing(null)} save={saveActivity} remove={removeActivity} openSettings={() => { setEditing(null); openPage('settings') }}/>}
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
  </div>
}

function PageHeading({ kicker, title, copy, action }: { kicker: string, title: string, copy: string, action?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="kicker">{kicker}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>
}

function Dashboard({ data, openNew, edit, go }: { data: AppData, openNew: () => void, edit: (a: Activity) => void, go: (p: Page) => void }) {
  const now = new Date(); const weekStart = startOfWeek(now); const month = monthKey(now)
  const activities = data.activities
  const todayMinutes = sumMinutes(activities, a => a.date === today())
  const weekMinutes = sumMinutes(activities, a => inDateRange(a.date, iso(weekStart), today()))
  const monthMinutes = sumMinutes(activities, a => a.date.startsWith(month))
  const total = totalMinutes(activities)
  const byCategory = categoryMinutes(activities, data.activityTypes)
  const recent = [...activities].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
  const weekBars = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(weekStart); start.setDate(start.getDate() - (7 - index) * 7)
    const end = new Date(start); end.setDate(end.getDate() + 6)
    return { label: dateLabel(iso(start), { month: 'short', day: 'numeric' }), minutes: sumMinutes(activities, a => inDateRange(a.date, iso(start), iso(end))) }
  })
  const maxWeek = Math.max(...weekBars.map(bar => bar.minutes), 1)
  const directShare = total ? (byCategory.direct ?? 0) / total * 100 : 0

  return <section className="page">
    {/* The log button lives in the topbar on every page, so page headings never repeat it. */}
    <PageHeading kicker="Your progress" title="Your hours at a glance." copy="A calm view of the time you have logged."/>
    <div className="metric-grid">
      <Metric label="Today" value={formatHours(todayMinutes)} hint={dateLabel(today(), { day: 'numeric', month: 'long' })} tone="sage"/>
      <Metric label="This week" value={formatHours(weekMinutes)} hint={`Since ${dateLabel(iso(weekStart), { day: 'numeric', month: 'short' })}`} tone="clay"/>
      <Metric label="This month" value={formatHours(monthMinutes)} hint={now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} tone="blue"/>
      <Metric label="All-time total" value={formatHours(total)} hint={`${activities.length} ${activities.length === 1 ? 'entry' : 'entries'}`} tone="gold"/>
    </div>
    <div className="dashboard-grid">
      <article className="panel span-2">
        <div className="panel-head"><div><span className="kicker">8 WEEK VIEW</span><h2>Hours over time</h2></div><span className="legend"><i/> Hours logged</span></div>
        <div className="bar-chart" role="img" aria-label="Hours logged over the last eight weeks">
          {weekBars.map((bar, index) => <div className="bar-column" key={index}><span className="bar-value">{bar.minutes ? hoursFromMinutes(bar.minutes) : ''}</span><div className="bar" style={{ height: `${Math.max(4, bar.minutes / maxWeek * 100)}%` }}/><small>{bar.label}</small></div>)}
        </div>
      </article>
      <article className="panel">
        <div className="panel-head"><div><span className="kicker">BREAKDOWN</span><h2>Direct & indirect</h2></div></div>
        <div className="donut-row">
          <div className="donut" style={{ background: `conic-gradient(#42564b 0 ${directShare}%, #b56f53 0)` }}><div><strong>{formatHours(total)}</strong><span>total</span></div></div>
          <div className="donut-legend">
            <div><i className="dot d0"/><span>Direct</span><strong>{formatHours(byCategory.direct ?? 0)}</strong></div>
            <div><i className="dot d1"/><span>Indirect</span><strong>{formatHours(byCategory.indirect ?? 0)}</strong></div>
          </div>
        </div>
      </article>
      <article className="panel full recent-panel">
        <div className="panel-head"><div><span className="kicker">LATEST</span><h2>Recent entries</h2></div><button className="text-button" onClick={() => go('activities')}>View all <ChevronRight size={16}/></button></div>
        {recent.length
          ? <ActivityRows activities={recent} data={data} edit={edit}/>
          : <div className="empty"><Clock3 size={28}/><strong>No hours logged yet</strong><span>Add your first entry and it will show up here.</span><button className="primary" onClick={openNew}><Plus size={17}/> Log hours</button></div>}
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
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(day.getDate() + index); return day })
  const selectedItems = data.activities.filter(a => a.date === selected).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const selectedDate = new Date(`${selected}T12:00:00`)
  const selectedWeek = startOfWeek(selectedDate)
  const selectedWeekEnd = new Date(selectedWeek); selectedWeekEnd.setDate(selectedWeekEnd.getDate() + 6)
  const selectedMonth = monthKey(selectedDate)
  return <section className="page">
    <PageHeading kicker="Plan & review" title="Calendar" copy="Pick a day to see or add the hours you worked."/>
    <div className="calendar-layout">
      <article className="panel calendar-panel">
        <div className="calendar-toolbar"><div><button className="secondary" onClick={() => { setCursor(new Date()); setSelected(today()) }}>Today</button><button className="icon-button" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft/></button><button className="icon-button" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight/></button></div><h2>{cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2></div>
        <div className="calendar-grid weekday-row">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid month-grid">{days.map(day => {
          const dayIso = iso(day)
          const items = data.activities.filter(a => a.date === dayIso)
          return <button key={dayIso} aria-label={`${dateLabel(dayIso, { day: 'numeric', month: 'long' })}, ${formatHours(sumMinutes(items))}`} className={`${day.getMonth() !== cursor.getMonth() ? 'muted' : ''} ${dayIso === selected ? 'selected' : ''} ${dayIso === today() ? 'today' : ''}`} onClick={() => setSelected(dayIso)}>
            <span>{day.getDate()}</span>
            <div>{items.slice(0, 3).map(a => <i key={a.id} style={{ background: typeOf(data, a.activityTypeId)?.color }}/>)}</div>
            {items.length > 3 && <small>+{items.length - 3}</small>}
          </button>
        })}</div>
      </article>
      <aside className="panel day-panel">
        <span className="kicker">SELECTED DAY</span><h2>{dateLabel(selected, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
        <div className="day-totals">
          <div><span>Day</span><strong>{formatHours(sumMinutes(selectedItems))}</strong></div>
          <div><span>Week</span><strong>{formatHours(sumMinutes(data.activities, a => inDateRange(a.date, iso(selectedWeek), iso(selectedWeekEnd))))}</strong></div>
          <div><span>Month</span><strong>{formatHours(sumMinutes(data.activities, a => a.date.startsWith(selectedMonth)))}</strong></div>
        </div>
        <div className="day-list">{selectedItems.length
          ? selectedItems.map(a => <button key={a.id} onClick={() => edit(a)} style={{ borderLeftColor: typeOf(data, a.activityTypeId)?.color }}><strong>{typeName(data, a.activityTypeId)}</strong><small>{formatHours(a.durationMinutes)}{a.notes ? ` · ${a.notes}` : ''}</small></button>)
          : <div className="empty"><CalendarDays size={28}/><strong>Nothing logged</strong><span>This day is wide open.</span></div>}
        </div>
        <button className="primary full-width" onClick={() => openNew(selected)}><Plus size={16}/> Log hours on {dateLabel(selected, { day: 'numeric', month: 'short' })}</button>
      </aside>
    </div>
  </section>
}

function Activities({ data, setData, edit, openNew, notify }: { data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>>, edit: (a: Activity) => void, openNew: () => void, notify: (message: string) => void }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const visible = useMemo(() => data.activities.filter(a => {
    const haystack = `${typeName(data, a.activityTypeId)} ${itemName(data.dictionaries.supervisors, a.supervisorId)} ${a.notes} ${a.date}`
    return (typeFilter === 'all' || a.activityTypeId === typeFilter) && haystack.toLowerCase().includes(query.toLowerCase())
  }).sort((a, b) => b.date.localeCompare(a.date)), [data, query, typeFilter])
  const bulkDelete = () => {
    if (!confirm(`Delete ${selected.length} selected ${selected.length === 1 ? 'entry' : 'entries'}?`)) return
    setData(current => ({ ...current, activities: current.activities.filter(a => !selected.includes(a.id)) }))
    setSelected([]); notify('Entries deleted')
  }
  return <section className="page">
    <PageHeading kicker="Your records" title="Hours" copy={`${visible.length} ${visible.length === 1 ? 'entry' : 'entries'} · ${formatHours(sumMinutes(visible))} shown`}/>
    <article className="panel table-panel">
      <div className="filterbar">
        <label className="search"><Search size={18}/><input aria-label="Search hours" placeholder="Search notes, type, supervisor…" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <label className="select-wrap"><SlidersHorizontal size={17}/><select aria-label="Filter by activity type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="all">All activity types</option>{data.activityTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
        <button className="secondary" onClick={() => download('hours-of-pee-hours.csv', toCsv(data, visible), 'text/csv')}><Download size={17}/> Export</button>
      </div>
      {selected.length > 0 && <div className="bulkbar"><strong>{selected.length} selected</strong><button className="danger-text" onClick={bulkDelete}><Trash2 size={16}/> Delete</button></div>}
      <div className="table-scroll"><table>
        <thead><tr><th><input type="checkbox" aria-label="Select all" checked={visible.length > 0 && visible.every(a => selected.includes(a.id))} onChange={e => setSelected(e.target.checked ? visible.map(a => a.id) : [])}/></th><th>Date</th><th>Activity type</th><th>Supervisor</th><th>Hours</th><th>Notes</th><th/></tr></thead>
        <tbody>{visible.map(a => <tr key={a.id}>
          <td><input type="checkbox" aria-label={`Select entry on ${a.date}`} checked={selected.includes(a.id)} onChange={e => setSelected(current => e.target.checked ? [...current, a.id] : current.filter(id => id !== a.id))}/></td>
          <td><strong>{dateLabel(a.date, { day: '2-digit', month: 'short', year: 'numeric' })}</strong></td>
          <td><span className="type-cell"><i style={{ background: typeOf(data, a.activityTypeId)?.color }}/>{typeName(data, a.activityTypeId)}</span></td>
          <td>{itemName(data.dictionaries.supervisors, a.supervisorId, '—')}</td>
          <td><strong>{formatHours(a.durationMinutes)}</strong></td>
          <td className="notes-cell">{a.notes || '—'}</td>
          <td><button className="icon-button" aria-label={`Edit entry on ${a.date}`} onClick={() => edit(a)}><MoreHorizontal size={19}/></button></td>
        </tr>)}</tbody>
      </table></div>
      {!visible.length && <div className="empty"><Search size={30}/><strong>Nothing to show</strong><span>{data.activities.length ? 'Try changing the search or filter.' : 'Log your first hours to see them here.'}</span>{!data.activities.length && <button className="primary" onClick={openNew}><Plus size={17}/> Log hours</button>}</div>}
    </article>
  </section>
}

function ActivityRows({ activities, data, edit }: { activities: Activity[], data: AppData, edit: (a: Activity) => void }) {
  return <div className="activity-rows">{activities.map(a => <button key={a.id} onClick={() => edit(a)}>
    <span className="date-tile"><strong>{dateLabel(a.date, { day: '2-digit' })}</strong><small>{dateLabel(a.date, { month: 'short' })}</small></span>
    <i style={{ background: typeOf(data, a.activityTypeId)?.color }}/>
    <span className="grow"><strong>{typeName(data, a.activityTypeId)}</strong><small>{[itemName(data.dictionaries.supervisors, a.supervisorId), a.notes].filter(Boolean).join(' · ') || 'No notes'}</small></span>
    <strong>{formatHours(a.durationMinutes)}</strong><ChevronRight size={17}/>
  </button>)}</div>
}

function Reports({ data }: { data: AppData }) {
  const dates = data.activities.map(a => a.date).sort()
  const [from, setFrom] = useState(dates[0] ?? today())
  const [to, setTo] = useState(today())
  const [typeFilter, setTypeFilter] = useState('all')
  const filtered = data.activities
    .filter(a => inDateRange(a.date, from, to) && (typeFilter === 'all' || a.activityTypeId === typeFilter))
    .sort((a, b) => a.date.localeCompare(b.date))
  const byType = groupMinutes(filtered, a => typeName(data, a.activityTypeId))
  const bySupervisor = groupMinutes(filtered, a => itemName(data.dictionaries.supervisors, a.supervisorId, 'Unassigned'))
  return <section className="page report-page">
    <PageHeading kicker="Review & export" title="Reports" copy="Create a clear, printable record of the hours you logged." action={<div className="button-row"><button className="secondary" onClick={() => download('hours-of-pee-report.csv', toCsv(data, filtered), 'text/csv')}><Download size={17}/> CSV</button><button className="primary" onClick={() => print()}><FileBarChart size={17}/> Print / PDF</button></div>}/>
    <article className="panel report-filters">
      <label>From<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}/></label>
      <label>To<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}/></label>
      <label>Activity type<select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="all">All activity types</option>{data.activityTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
    </article>
    <article className="panel printable-report">
      <div className="report-title"><div><span className="kicker">HOURS SUMMARY</span><h2>Hours record</h2><p>{dateLabel(from, { day: 'numeric', month: 'long', year: 'numeric' })} — {dateLabel(to, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div><div className="report-total"><span>Total logged</span><strong>{formatHours(sumMinutes(filtered))}</strong><small>{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</small></div></div>
      <div className="report-breakdown"><ReportGroup title="By activity type" values={byType}/><ReportGroup title="By supervisor" values={bySupervisor}/></div>
      <div className="report-details"><h3>Entry details</h3><table>
        <thead><tr><th>Date</th><th>Activity type</th><th>Supervisor</th><th>Hours</th></tr></thead>
        <tbody>{filtered.map(a => <tr key={a.id}>
          <td>{dateLabel(a.date, { day: '2-digit', month: 'short', year: 'numeric' })}</td>
          <td>{typeName(data, a.activityTypeId)}{a.notes && <small>{a.notes}</small>}</td>
          <td>{itemName(data.dictionaries.supervisors, a.supervisorId, '—')}</td>
          <td>{formatHours(a.durationMinutes)}</td>
        </tr>)}</tbody>
      </table>
      {!filtered.length && <div className="empty-mini">No hours in this date range.</div>}</div>
      <div className="signature"><span>Signature</span><i/><span>Date</span><i/></div>
    </article>
  </section>
}

function ReportGroup({ title, values }: { title: string, values: Record<string, number> }) {
  const max = Math.max(...Object.values(values), 1)
  return <div><h3>{title}</h3>{Object.entries(values).sort((a, b) => b[1] - a[1]).map(([label, minutes]) => <div className="report-bar" key={label}><div><span>{label}</span><strong>{formatHours(minutes)}</strong></div><i><b style={{ width: `${minutes / max * 100}%` }}/></i></div>)}</div>
}

function SettingsPage({ data, setData, notify }: { data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>>, notify: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const { recordAudit } = useWorkspace()
  const backup = async () => {
    download(`hours-of-pee-backup-${today()}.json`, exportJson(data), 'application/json')
    await recordAudit('data_export')
  }
  const restore = async (file?: File) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      if (!isValidBackup(parsed)) throw new Error('Invalid backup')
      const next = migrate(parsed)
      if (!confirm(`Restore ${next.activities.length} entries? This replaces your current data.`)) return
      setData(next); await recordAudit('data_import'); notify('Backup restored')
    } catch { alert('This file is not a valid the Hours of Pee backup.') }
  }
  const reset = () => { if (prompt('Type DELETE to reset all data in this workspace.') !== 'DELETE') return; setData(resetData()); notify('Workspace reset') }
  return <section className="page">
    <PageHeading kicker="Your workspace" title="Settings & data" copy="Manage activity types, supervisors, backups, and privacy."/>
    <div className="settings-grid">
      <article className="panel settings-card"><div className="settings-icon"><Database/></div><h2>Backup & restore</h2><p>Save a complete, versioned copy of your hours, or bring a backup back in. Hours are exported in decimal hours.</p>
        <div className="button-row">
          <button className="primary" onClick={() => void backup()}><Download size={17}/> JSON</button>
          <button className="secondary" onClick={() => { download('hours-of-pee-hours.csv', toCsv(data), 'text/csv'); void recordAudit('data_export') }}>CSV</button>
          <button className="secondary" onClick={() => input.current?.click()}><Upload size={17}/> Restore</button>
          <input ref={input} hidden type="file" accept="application/json" onChange={e => restore(e.target.files?.[0])}/>
        </div>
      </article>
      <article className="panel settings-card privacy-card"><div className="settings-icon"><Users/></div><h2>Privacy by design</h2><p>Keep notes free of names, addresses, medical record numbers, or any other identifying details.</p>
        <div className="privacy-lines"><span><Check/> Your rows are visible only to you</span><span><Check/> No analytics or tracking</span><span><Check/> Export or delete at any time</span></div>
      </article>
      <ActivityTypeManager data={data} setData={setData} notify={notify}/>
      <DictionaryManager data={data} setData={setData} notify={notify}/>
      <article className="panel settings-card danger-card"><div className="settings-icon"><Trash2/></div><h2>Reset workspace</h2><p>Remove every entry and start over. Download a backup first if you may need this data.</p><button className="danger" onClick={reset}>Delete all data</button></article>
    </div>
  </section>
}

function ActivityTypeManager({ data, setData, notify }: { data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>>, notify: (message: string) => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ActivityCategory>('direct')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const updateType = (id: string, patch: Partial<ActivityType>) =>
    setData(current => ({ ...current, activityTypes: current.activityTypes.map(type => type.id === id ? { ...type, ...patch } : type) }))
  const commitName = (id: string, value: string) => {
    const trimmed = value.trim()
    if (trimmed) updateType(id, { name: trimmed })
    setDrafts(current => { const next = { ...current }; delete next[id]; return next })
  }
  const add = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (data.activityTypes.some(type => type.name.toLowerCase() === trimmed.toLowerCase())) { notify('That activity type already exists'); return }
    setData(current => ({ ...current, activityTypes: [...current.activityTypes, {
      id: uid(), name: trimmed, color: category === 'direct' ? '#42564b' : '#a05d42',
      defaultMinutes: 60, category, active: true,
    }] }))
    setName(''); notify('Activity type added')
  }
  const remove = (id: string) => {
    if (!canRemoveActivityType(data, id)) return
    if (!confirm('Remove this activity type?')) return
    setData(current => ({ ...current, activityTypes: current.activityTypes.filter(type => type.id !== id) }))
    notify('Activity type removed')
  }
  return <article className="panel settings-card dictionary-card">
    <div className="settings-icon"><ActivityIcon/></div>
    <h2>Activity types</h2>
    <p>The choices in the “Log hours” dropdown. Direct hours are time with clients; indirect hours cover everything else.</p>
    <div className="dict-list">
      {data.activityTypes.map(type => <div className={`dict-row type-row ${type.active ? '' : 'inactive'}`} key={type.id}>
        <i className="type-swatch" style={{ background: type.color }}/>
        <input aria-label={`Name for ${type.name}`} value={drafts[type.id] ?? type.name} onChange={e => setDrafts(current => ({ ...current, [type.id]: e.target.value }))} onBlur={e => commitName(type.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}/>
        <select aria-label={`Category for ${type.name}`} value={type.category} onChange={e => updateType(type.id, { category: e.target.value as ActivityCategory })}>
          <option value="direct">Direct hours</option>
          <option value="indirect">Indirect hours</option>
        </select>
        <button type="button" className="secondary compact" onClick={() => updateType(type.id, { active: !type.active })}>{type.active ? 'Hide' : 'Show'}</button>
        <button type="button" className="icon-button" aria-label={`Remove ${type.name}`} disabled={!canRemoveActivityType(data, type.id)} onClick={() => remove(type.id)}><Trash2 size={16}/></button>
      </div>)}
    </div>
    <form className="dict-add" onSubmit={add}>
      <input aria-label="Add activity type" placeholder="Add activity type" value={name} onChange={e => setName(e.target.value)}/>
      <select aria-label="Category for the new activity type" value={category} onChange={e => setCategory(e.target.value as ActivityCategory)}>
        <option value="direct">Direct</option>
        <option value="indirect">Indirect</option>
      </select>
      <button className="primary compact" type="submit"><Plus size={16}/> Add</button>
    </form>
  </article>
}

function DictionaryManager({ data, setData, notify }: { data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>>, notify: (message: string) => void }) {
  const key: DictionaryKey = 'supervisors'
  const [newName, setNewName] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const meta = dictionaryMeta.find(item => item.key === key)!
  const items = data.dictionaries[key]

  const setItems = (next: (items: DictionaryItem[]) => DictionaryItem[]) =>
    setData(current => ({ ...current, dictionaries: { ...current.dictionaries, [key]: next(current.dictionaries[key]) } }))

  const commitName = (id: string, name: string) => {
    const trimmed = name.trim()
    if (trimmed) setItems(list => renameItem(list, id, trimmed))
    setDrafts(current => { const next = { ...current }; delete next[id]; return next })
  }

  const add = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    if (items.some(item => item.name.toLowerCase() === trimmed.toLowerCase())) { notify('That supervisor already exists'); return }
    setItems(list => findOrCreateNamed(list, trimmed).items)
    setNewName(''); notify('Supervisor added')
  }

  const remove = (id: string) => {
    if (!canRemoveDictionaryItem(data, key, id)) return
    if (!confirm('Remove this supervisor?')) return
    setItems(list => removeItem(list, id))
    notify('Supervisor removed')
  }

  return <article className="panel settings-card dictionary-card">
    <div className="settings-icon"><Users/></div>
    <h2>{meta.label}</h2>
    <p>{meta.hint}</p>
    <div className="dict-list">
      {items.map(item => {
        const used = dictionaryUsage(data, key, item.id)
        return <div className={`dict-row ${item.active ? '' : 'inactive'}`} key={item.id}>
          <input aria-label={`Name for ${item.name}`} value={drafts[item.id] ?? item.name} onChange={e => setDrafts(current => ({ ...current, [item.id]: e.target.value }))} onBlur={e => commitName(item.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}/>
          <small>{used ? `${used} in use` : 'Unused'}</small>
          <button type="button" className="secondary compact" onClick={() => setItems(list => setItemActive(list, item.id, !item.active))}>{item.active ? 'Hide' : 'Show'}</button>
          <button type="button" className="icon-button" aria-label={`Remove ${item.name}`} disabled={!canRemoveDictionaryItem(data, key, item.id)} onClick={() => remove(item.id)}><Trash2 size={16}/></button>
        </div>
      })}
      {!items.length && <div className="empty-mini">No supervisors yet. Add one to attach it to your hours.</div>}
    </div>
    <form className="dict-add" onSubmit={add}>
      <input aria-label="Add supervisor" placeholder="Add supervisor" value={newName} onChange={e => setNewName(e.target.value)}/>
      <button className="primary compact" type="submit"><Plus size={16}/> Add</button>
    </form>
  </article>
}

function SupervisorSelect({ items, value, onChange, onCreate, labelledBy }: {
  items: DictionaryItem[], value: string, onChange: (id: string) => void, onCreate: (name: string) => void, labelledBy: string
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const create = () => {
    if (!name.trim()) return
    onCreate(name.trim())
    setName(''); setAdding(false)
  }
  return <div className="dict-select">
    <select aria-labelledby={labelledBy} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">None</option>
      {activeItems(items, value).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    {!adding && <button type="button" className="secondary compact" onClick={() => setAdding(true)}>Add</button>}
    {adding && <>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Supervisor name" autoFocus onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create() } }}/>
      <button type="button" className="primary compact" onClick={create}>Save</button>
      <button type="button" className="secondary compact" onClick={() => setAdding(false)}>Cancel</button>
    </>}
  </div>
}

const QUICK_HOURS = [0.5, 1, 1.5, 2, 3, 4, 8]

function ActivityDialog({ activity, data, setData, close, save, remove, openSettings }: {
  activity: Activity, data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>>,
  close: () => void, save: (activity: Activity) => void, remove: (id: string) => void, openSettings: () => void,
}) {
  const [date, setDate] = useState(activity.date || today())
  const [hours, setHours] = useState(String(hoursFromMinutes(activity.durationMinutes)))
  const [activityTypeId, setActivityTypeId] = useState(activity.activityTypeId)
  const [supervisorId, setSupervisorId] = useState(activity.supervisorId)
  const [notes, setNotes] = useState(activity.notes)
  const [error, setError] = useState('')
  const selectableTypes = activeItems(data.activityTypes, activityTypeId)
  const numericHours = Number(hours)

  const problem = () => {
    if (!date) return 'Choose the date you worked.'
    if (!selectableTypes.length) return 'Add an activity type in Settings before logging hours.'
    if (!activityTypeId) return 'Choose an activity type.'
    if (!Number.isFinite(numericHours) || numericHours <= 0) return 'Enter how many hours you worked, for example 1.5.'
    if (numericHours > 24) return 'A single entry cannot be longer than 24 hours.'
    return ''
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const found = problem()
    setError(found)
    if (found) return
    save({ ...activity, date, durationMinutes: minutesFromHours(numericHours), activityTypeId, supervisorId, notes: notes.trim() })
  }

  const addSupervisor = (name: string) => {
    let created = ''
    setData(current => {
      const next = findOrCreateNamed(current.dictionaries.supervisors, name)
      created = next.id
      return { ...current, dictionaries: { ...current.dictionaries, supervisors: next.items } }
    })
    setSupervisorId(created)
  }

  return <div className="modal-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
    <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="activity-title">
      <div className="modal-head">
        <div><span className="kicker">{activity.id ? 'EDIT ENTRY' : 'NEW ENTRY'}</span><h2 id="activity-title">{activity.id ? 'Edit hours' : 'Log your hours'}</h2></div>
        <button type="button" className="icon-button" aria-label="Close" onClick={close}><X/></button>
      </div>
      <div className="form-grid">
        <label>Date<input type="date" value={date} onChange={e => { setDate(e.target.value); setError('') }}/></label>
        <label>Hours
          {/* Validation lives in problem() so people get a sentence they can act on, not a browser tooltip. */}
          <input aria-label="Hours" type="number" inputMode="decimal" step="any" value={hours} onChange={e => { setHours(e.target.value); setError('') }}/>
          <small>Decimals are fine — 1.5 means one and a half hours.</small>
        </label>
        <div className="field full"><span>Quick pick</span>
          <div className="hour-chips">{QUICK_HOURS.map(value => <button type="button" key={value} className={`chip ${numericHours === value ? 'on' : ''}`} onClick={() => { setHours(String(value)); setError('') }}>{value} h</button>)}</div>
        </div>
        <label className="full">Activity type
          <select value={activityTypeId} onChange={e => { setActivityTypeId(e.target.value); setError('') }}>
            <option value="">Choose a type…</option>
            {selectableTypes.map(type => <option value={type.id} key={type.id}>{type.name}</option>)}
          </select>
        </label>
        <div className="field full"><span id="supervisor-label">Supervisor (optional)</span>
          <SupervisorSelect labelledBy="supervisor-label" items={data.dictionaries.supervisors} value={supervisorId} onChange={setSupervisorId} onCreate={addSupervisor}/>
        </div>
        <label className="full">Notes<textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="A short, useful note…"/></label>
      </div>
      {error && <p className="form-error" role="alert">{error}{error.includes('Settings') && <> <button type="button" className="text-button" onClick={openSettings}>Open settings</button></>}</p>}
      <div className="modal-actions">
        {activity.id && <button type="button" className="danger-text" onClick={() => remove(activity.id)}><Trash2 size={17}/> Delete</button>}
        <span/>
        <button type="button" className="secondary" onClick={close}>Cancel</button>
        <button className="primary" type="submit">{activity.id ? 'Save changes' : 'Save entry'}</button>
      </div>
    </form>
  </div>
}

export default App
