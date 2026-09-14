import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Database,
  Download, FileBarChart, LayoutDashboard, LogOut, Menu, MoreHorizontal, Plus,
  Settings, ShieldCheck, Sparkles, Trash2, Upload, UserCircle, Users, X,
} from 'lucide-react'
import {
  categoryMinutes, formatHours, formatHoursFixed, hoursFromMinutes,
  inDateRange, minutesFromHours, parseHours, sumMinutes, totalMinutes,
} from './calculations'
import { download, exportJson, isValidBackup, migrate, resetData, toCsv } from './data'
import { useAuth, navigate } from './auth/AuthProvider'
import { AccountPage, AdminPage } from './auth/pages'
import { countLabels, entityCounts } from './migration'
import { useWorkspace } from './workspace/WorkspaceProvider'
import {
  activeItems, canRemoveDictionaryItem, canRemovePlacement, dictionaryUsage,
  emptyPlacement, findOrCreateNamed, firstKindId, itemName, kindsFor,
  placementName, placementOf, removeItem, renameItem, resolveKindId, setItemActive,
} from './dictionaries'
import type { Activity, ActivityCategory, AppData, DictionaryItem, Placement } from './types'

type Page = 'dashboard' | 'calendar' | 'placements' | 'reports' | 'settings'
export type Section = 'admin' | 'account'

const today = () => new Date().toLocaleDateString('en-CA')
const uid = () => crypto.randomUUID()
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = {}) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', options)
const longDate = (date: string) => dateLabel(date, { day: 'numeric', month: 'long', year: 'numeric' })
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const startOfWeek = (date: Date) => { const copy = new Date(date); const day = (copy.getDay() + 6) % 7; copy.setDate(copy.getDate() - day); return copy }
const iso = (date: Date) => date.toLocaleDateString('en-CA')
const typeOf = (data: AppData, id: string) => data.activityTypes.find(type => type.id === resolveKindId(id, data.activityTypes))
const typeName = (data: AppData, id: string) => typeOf(data, id)?.name ?? 'Activity'
const typeCategory = (data: AppData, id: string) => typeOf(data, id)?.category ?? 'indirect'
const shiftDate = (date: string, days: number) => {
  const next = new Date(`${date || today()}T12:00:00`)
  next.setDate(next.getDate() + days)
  return iso(next)
}
const rangeLabel = (start: string, end: string) => {
  if (!start && !end) return ''
  return `${start ? dateLabel(start, { day: '2-digit', month: 'short', year: 'numeric' }) : 'Start'} — ${end ? dateLabel(end, { day: '2-digit', month: 'short', year: 'numeric' }) : 'present'}`
}

const emptyActivity = (data: AppData, date = today()): Activity => {
  const placement = data.placements.find(item => item.active) ?? data.placements[0]
  const typeId = firstKindId('direct')
  return {
    id: '', date, durationMinutes: 60, activityTypeId: typeId,
    placementId: placement?.id ?? '', supervisorId: placement?.supervisorId ?? '', notes: '', createdAt: '', updatedAt: '',
  }
}

function SaveBanner() {
  const { status, retry, kind, lastError } = useWorkspace()
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
  return <div className="sync-banner warn" role="status">{lastError || 'Your changes could not be saved. Check your connection and try again.'} <button className="text-button" onClick={retry}>Retry</button></div>
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
  const { data, setData, commit, kind } = useWorkspace()
  const { remote, profile, signOut } = useAuth()
  const [page, setPage] = useState<Page>('dashboard')
  const [navOpen, setNavOpen] = useState(false)
  const [editing, setEditing] = useState<Activity | null>(null)
  const [reportPlacement, setReportPlacement] = useState('all')
  const [toast, setToast] = useState('')

  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 2600); return () => clearTimeout(id) }, [toast])

  const openNew = (date?: string) => setEditing(emptyActivity(data, date))
  const saveActivity = async (activity: Activity) => {
    const now = new Date().toISOString()
    const placement = placementOf(data.placements, activity.placementId)
    const nextActivity = { ...activity, supervisorId: activity.supervisorId || placement?.supervisorId || '' }
    const next: AppData = { ...data, activities: activity.id
      ? data.activities.map(item => item.id === activity.id ? { ...nextActivity, updatedAt: now } : item)
      : [{ ...nextActivity, id: uid(), createdAt: now, updatedAt: now }, ...data.activities],
    }
    const error = await commit(next)
    if (error) return error
    setEditing(null); setToast(activity.id ? 'Hours updated' : 'Hours logged')
    return null
  }
  const removeActivity = async (id: string) => {
    if (!confirm('Delete this entry? This cannot be undone.')) return null
    const error = await commit({ ...data, activities: data.activities.filter(item => item.id !== id) })
    if (error) return error
    setEditing(null); setToast('Entry deleted')
    return null
  }

  const nav = [
    ['dashboard', LayoutDashboard, 'Overview'], ['calendar', CalendarDays, 'Calendar'],
    ['placements', Briefcase, 'Placement'], ['reports', FileBarChart, 'Reports'], ['settings', Settings, 'Settings'],
  ] as const

  const goDashboard = () => { setPage('dashboard'); setNavOpen(false); if (section) navigate('/') }
  const openPage = (next: Page) => { setPage(next); setNavOpen(false); if (section) navigate('/') }
  const openSection = (path: string) => { setNavOpen(false); navigate(path) }
  const goReports = (placementId = 'all') => { setReportPlacement(placementId); openPage('reports') }
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
        {page === 'placements' && <Placements data={data} setData={setData} edit={setEditing} openNew={openNew} notify={setToast} goReports={goReports}/>}
        {page === 'reports' && <Reports data={data} generatedFor={profile?.displayName || profile?.email || 'Trainee'} placementId={reportPlacement} setPlacementId={setReportPlacement}/>}
        {page === 'settings' && <SettingsPage data={data} setData={setData} notify={setToast}/>}
      </>}
    </main>
    <MigrationModal />
    {editing && <ActivityDialog activity={editing} data={data} close={() => setEditing(null)} save={saveActivity} remove={removeActivity} openPlacements={() => { setEditing(null); openPage('placements') }}/>}
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
        <div className="panel-head"><div><span className="kicker">LATEST</span><h2>Recent entries</h2></div><button className="text-button" onClick={() => go('placements')}>View placements <ChevronRight size={16}/></button></div>
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
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(gridStart.getDate() + index); return day })
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

function Placements({ data, setData, edit, openNew, notify, goReports }: {
  data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>>,
  edit: (a: Activity) => void, openNew: () => void, notify: (message: string) => void,
  goReports: (placementId?: string) => void,
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Placement | null>(null)
  const selected = data.placements.find(item => item.id === selectedId)
  const hoursFor = (id: string) => data.activities.filter(item => item.placementId === id)

  const savePlacement = (placement: Placement) => {
    const next = placement.id
      ? data.placements.map(item => item.id === placement.id ? placement : item)
      : [...data.placements, { ...placement, id: uid() }]
    setData({ ...data, placements: next })
    setDraft(null)
    notify(placement.id ? 'Placement updated' : 'Placement added')
  }

  if (selected) {
    const rows = hoursFor(selected.id).sort((a, b) => b.date.localeCompare(a.date))
    const split = categoryMinutes(rows, data.activityTypes)
    return <section className="page">
      <PageHeading
        kicker="Job / site"
        title={selected.name}
        copy={[selected.site, itemName(data.dictionaries.supervisors, selected.supervisorId), rangeLabel(selected.startDate, selected.endDate)].filter(Boolean).join(' · ') || 'Hours logged against this placement.'}
        action={<div className="button-row">
          <button className="secondary" onClick={() => setSelectedId(null)}><ChevronLeft size={16}/> All placements</button>
          <button className="secondary" onClick={() => goReports(selected.id)}><FileBarChart size={17}/> Report</button>
          <button className="secondary" onClick={() => download(`hours-${selected.name.replace(/\s+/g, '-').toLowerCase()}.csv`, toCsv(data, rows), 'text/csv')}><Download size={17}/> CSV</button>
          <button className="primary compact" onClick={() => setDraft(selected)}>Edit</button>
        </div>}
      />
      <div className="metric-grid placement-metrics">
        <Metric label="Direct" value={formatHours(split.direct ?? 0)} hint="Time with clients" tone="sage"/>
        <Metric label="Indirect" value={formatHours(split.indirect ?? 0)} hint="Everything else" tone="clay"/>
        <Metric label="Total" value={formatHours(sumMinutes(rows))} hint={`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`} tone="gold"/>
      </div>
      <article className="panel table-panel">
        <div className="filterbar"><strong className="table-title">Hours at this site</strong></div>
        <HoursTable activities={rows} data={data} edit={edit}/>
        {!rows.length && <div className="empty"><Clock3 size={30}/><strong>No hours here yet</strong><span>Log time against this placement to separate it from your other jobs.</span><button className="primary" onClick={openNew}><Plus size={17}/> Log hours</button></div>}
      </article>
      {draft && <PlacementDialog placement={draft} data={data} setData={setData} close={() => setDraft(null)} save={savePlacement}/>}
    </section>
  }

  return <section className="page">
    <PageHeading kicker="Jobs & sites" title="Placement" copy="Separate hours by the job or site they belong to, then export a report for each one." action={<button className="primary compact" onClick={() => setDraft(emptyPlacement())}><Plus size={17}/> Add placement</button>}/>
    {data.placements.length
      ? <div className="placement-grid">{data.placements.map(placement => {
        const rows = hoursFor(placement.id)
        const split = categoryMinutes(rows, data.activityTypes)
        return <article className={`panel placement-card ${placement.active ? '' : 'inactive'}`} key={placement.id}>
          <div className="placement-card-head">
            <div><span className="kicker">{placement.active ? 'ACTIVE' : 'HIDDEN'}</span><h2>{placement.name}</h2></div>
            <button className="icon-button" aria-label={`Edit ${placement.name}`} onClick={() => setDraft(placement)}><MoreHorizontal size={19}/></button>
          </div>
          <p>{[placement.site, itemName(data.dictionaries.supervisors, placement.supervisorId), rangeLabel(placement.startDate, placement.endDate)].filter(Boolean).join(' · ') || 'No site details yet.'}</p>
          <div className="placement-hours">
            <div><span>Direct</span><strong>{formatHoursFixed(split.direct ?? 0)}</strong></div>
            <div><span>Indirect</span><strong>{formatHoursFixed(split.indirect ?? 0)}</strong></div>
            <div><span>Total</span><strong>{formatHoursFixed(sumMinutes(rows))}</strong></div>
          </div>
          <div className="button-row">
            <button className="primary compact" onClick={() => setSelectedId(placement.id)}>View hours</button>
            <button className="secondary compact" onClick={() => goReports(placement.id)}>Export report</button>
          </div>
        </article>
      })}</div>
      : <article className="panel"><div className="empty"><Briefcase size={30}/><strong>No placements yet</strong><span>Add each job or site so you can sort and export hours separately.</span><button className="primary" onClick={() => setDraft(emptyPlacement())}><Plus size={17}/> Add placement</button></div></article>}
    <SupervisorManager data={data} setData={setData} notify={notify}/>
    {draft && <PlacementDialog placement={draft} data={data} setData={setData} close={() => setDraft(null)} save={savePlacement} remove={placement => {
      if (!canRemovePlacement(data, placement.id)) { notify('Move or delete the hours on this placement first.'); return }
      if (!confirm('Remove this placement?')) return
      setData(current => ({ ...current, placements: current.placements.filter(item => item.id !== placement.id) }))
      setDraft(null); notify('Placement removed')
    }}/>}
  </section>
}

function HoursTable({ activities, data, edit }: { activities: Activity[], data: AppData, edit: (a: Activity) => void }) {
  if (!activities.length) return null
  return <div className="table-scroll"><table>
    <thead><tr><th>Date</th><th>Activity</th><th>Hours</th><th>Notes</th><th/></tr></thead>
    <tbody>{activities.map(a => <tr key={a.id}>
      <td><strong>{dateLabel(a.date, { day: '2-digit', month: 'short', year: 'numeric' })}</strong></td>
      <td><span className="type-cell"><i style={{ background: typeOf(data, a.activityTypeId)?.color }}/><span>{typeName(data, a.activityTypeId)}<small>{typeCategory(data, a.activityTypeId) === 'direct' ? 'Direct' : 'Indirect'}</small></span></span></td>
      <td><strong>{formatHours(a.durationMinutes)}</strong></td>
      <td className="notes-cell">{a.notes || '—'}</td>
      <td><button className="icon-button" aria-label={`Edit entry on ${a.date}`} onClick={() => edit(a)}><MoreHorizontal size={19}/></button></td>
    </tr>)}</tbody>
  </table></div>
}

function PlacementDialog({ placement, data, setData, close, save, remove }: {
  placement: Placement, data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>>,
  close: () => void, save: (placement: Placement) => void, remove?: (placement: Placement) => void,
}) {
  const [name, setName] = useState(placement.name)
  const [site, setSite] = useState(placement.site)
  const [supervisorId, setSupervisorId] = useState(placement.supervisorId)
  const [startDate, setStartDate] = useState(placement.startDate)
  const [endDate, setEndDate] = useState(placement.endDate)
  const [active, setActive] = useState(placement.active)
  const [error, setError] = useState('')

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) { setError('Give this placement a name, for example the job or course title.'); return }
    save({ ...placement, name: name.trim(), site: site.trim(), supervisorId, startDate, endDate, active })
  }

  return <div className="modal-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
    <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="placement-title">
      <div className="modal-head">
        <div><span className="kicker">{placement.id ? 'EDIT PLACEMENT' : 'NEW PLACEMENT'}</span><h2 id="placement-title">{placement.id ? 'Edit placement' : 'Add a placement'}</h2></div>
        <button type="button" className="icon-button" aria-label="Close" onClick={close}><X/></button>
      </div>
      <div className="form-grid">
        <label className="full">Placement name<input value={name} onChange={e => { setName(e.target.value); setError('') }} placeholder="e.g. 2025–2026 Practicum"/></label>
        <label className="full">Job / site<input value={site} onChange={e => setSite(e.target.value)} placeholder="e.g. Riverbank Psychotherapy"/></label>
        <div className="field full"><span id="placement-supervisor">Supervisor</span>
          <SupervisorSelect labelledBy="placement-supervisor" items={data.dictionaries.supervisors} value={supervisorId} onChange={setSupervisorId} onCreate={name => {
            const next = findOrCreateNamed(data.dictionaries.supervisors, name)
            setData(current => ({ ...current, dictionaries: { ...current.dictionaries, supervisors: next.items } }))
            setSupervisorId(next.id)
          }}/>
        </div>
        <label>Start date<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}/></label>
        <label>End date<input type="date" value={endDate} min={startDate || undefined} onChange={e => setEndDate(e.target.value)}/></label>
        <label className="full checkbox-row"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/> Show this placement when logging hours</label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        {placement.id && remove && <button type="button" className="danger-text" onClick={() => remove(placement)}><Trash2 size={17}/> Delete</button>}
        <span/>
        <button type="button" className="secondary" onClick={close}>Cancel</button>
        <button className="primary" type="submit">{placement.id ? 'Save placement' : 'Add placement'}</button>
      </div>
    </form>
  </div>
}

function SupervisorManager({ data, setData, notify }: { data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>>, notify: (message: string) => void }) {
  const [newName, setNewName] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const items = data.dictionaries.supervisors
  const setItems = (next: (items: DictionaryItem[]) => DictionaryItem[]) =>
    setData(current => ({ ...current, dictionaries: { ...current.dictionaries, supervisors: next(current.dictionaries.supervisors) } }))

  const add = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    if (items.some(item => item.name.toLowerCase() === trimmed.toLowerCase())) { notify('That supervisor already exists'); return }
    setItems(list => findOrCreateNamed(list, trimmed).items)
    setNewName(''); notify('Supervisor added')
  }

  const remove = (id: string) => {
    if (!canRemoveDictionaryItem(data, 'supervisors', id)) return
    if (!confirm('Remove this supervisor?')) return
    setItems(list => removeItem(list, id))
    notify('Supervisor removed')
  }

  return <article className="panel settings-card dictionary-card supervisor-panel">
    <div className="settings-icon"><Users/></div>
    <h2>Supervisors</h2>
    <p>Add supervisors here, then attach them to a placement. They are not added while logging hours.</p>
    <div className="dict-list">
      {items.map(item => {
        const used = dictionaryUsage(data, 'supervisors', item.id)
        return <div className={`dict-row ${item.active ? '' : 'inactive'}`} key={item.id}>
          <input aria-label={`Name for ${item.name}`} value={drafts[item.id] ?? item.name} onChange={e => setDrafts(current => ({ ...current, [item.id]: e.target.value }))} onBlur={e => {
            const trimmed = e.target.value.trim()
            if (trimmed) setItems(list => renameItem(list, item.id, trimmed))
            setDrafts(current => { const next = { ...current }; delete next[item.id]; return next })
          }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}/>
          <small>{used ? `${used} in use` : 'Unused'}</small>
          <button type="button" className="secondary compact" onClick={() => setItems(list => setItemActive(list, item.id, !item.active))}>{item.active ? 'Hide' : 'Show'}</button>
          <button type="button" className="icon-button" aria-label={`Remove ${item.name}`} disabled={!canRemoveDictionaryItem(data, 'supervisors', item.id)} onClick={() => remove(item.id)}><Trash2 size={16}/></button>
        </div>
      })}
      {!items.length && <div className="empty-mini">No supervisors yet. Add one and attach it to a placement.</div>}
    </div>
    <form className="dict-add" onSubmit={add}>
      <input aria-label="Add supervisor" placeholder="Add supervisor" value={newName} onChange={e => setNewName(e.target.value)}/>
      <button className="primary compact" type="submit"><Plus size={16}/> Add</button>
    </form>
  </article>
}

function ActivityRows({ activities, data, edit }: { activities: Activity[], data: AppData, edit: (a: Activity) => void }) {
  return <div className="activity-rows">{activities.map(a => <button key={a.id} onClick={() => edit(a)}>
    <span className="date-tile"><strong>{dateLabel(a.date, { day: '2-digit' })}</strong><small>{dateLabel(a.date, { month: 'short' })}</small></span>
    <i style={{ background: typeOf(data, a.activityTypeId)?.color }}/>
    <span className="grow"><strong>{typeName(data, a.activityTypeId)}</strong><small>{[placementName(data.placements, a.placementId, ''), a.notes].filter(Boolean).join(' · ') || 'No notes'}</small></span>
    <strong>{formatHours(a.durationMinutes)}</strong><ChevronRight size={17}/>
  </button>)}</div>
}

function Reports({ data, generatedFor, placementId, setPlacementId }: {
  data: AppData, generatedFor: string, placementId: string, setPlacementId: (id: string) => void,
}) {
  const dates = data.activities.map(a => a.date).sort()
  const [from, setFrom] = useState(dates[0] ?? today())
  const [to, setTo] = useState(today())
  const filtered = data.activities
    .filter(a => inDateRange(a.date, from, to) && (placementId === 'all' || a.placementId === placementId))
    .sort((a, b) => a.date.localeCompare(b.date))
  const placements = placementId === 'all' ? data.placements : data.placements.filter(item => item.id === placementId)
  const generatedOn = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const printReport = () => window.print()

  return <section className="page report-page">
    <PageHeading kicker="Review & export" title="Reports" copy="A readable activity summary you can print or save as a PDF." action={<div className="button-row no-print"><button className="secondary" onClick={() => download('hours-of-pee-report.csv', toCsv(data, filtered), 'text/csv')}><Download size={17}/> CSV</button><button className="primary" onClick={printReport}><FileBarChart size={17}/> Print / PDF</button></div>}/>
    <article className="panel report-filters no-print">
      <label>From<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}/></label>
      <label>To<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}/></label>
      <label>Placement<select value={placementId} onChange={e => setPlacementId(e.target.value)}><option value="all">All placements</option>{data.placements.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </article>
    <article className="panel summary-report">
      <header className="summary-head">
        <h1>Activity Summary</h1>
        <p className="summary-lede">This report includes logged hours only.</p>
        <p className="summary-meta">Generated for {generatedFor} on {generatedOn}.</p>
        <p className="summary-range">Date range: {longDate(from)} to {longDate(to)}{placementId !== 'all' ? ` · ${placementName(data.placements, placementId)}` : ''}</p>
      </header>

      <h2>Hours by Placement</h2>
      <table className="summary-table">
        <thead><tr><th>Placement</th><th className="num">Direct</th><th className="num">Indirect</th><th className="num">Total</th></tr></thead>
        <tbody>
          {(placements.length ? placements : [{ id: '', name: 'Unassigned', site: '', supervisorId: '', startDate: '', endDate: '', active: true }]).map(placement => {
            const rows = filtered.filter(item => (placement.id ? item.placementId === placement.id : !item.placementId))
            if (!rows.length && placement.id) return null
            const split = categoryMinutes(rows, data.activityTypes)
            return <tr key={placement.id || 'none'}>
              <td className="placement-cell">
                <strong>{placement.name}</strong>
                {placement.site && <small>at {placement.site}</small>}
                {rangeLabel(placement.startDate, placement.endDate) && <small>{rangeLabel(placement.startDate, placement.endDate)}</small>}
              </td>
              <td className="num">{formatHoursFixed(split.direct ?? 0)}</td>
              <td className="num">{formatHoursFixed(split.indirect ?? 0)}</td>
              <td className="num">{formatHoursFixed(sumMinutes(rows))}</td>
            </tr>
          })}
          {filtered.some(item => !item.placementId) && placements.every(item => item.id) && (() => {
            const rows = filtered.filter(item => !item.placementId)
            const split = categoryMinutes(rows, data.activityTypes)
            return <tr key="unassigned">
              <td className="placement-cell"><strong>Unassigned</strong><small>No placement selected</small></td>
              <td className="num">{formatHoursFixed(split.direct ?? 0)}</td>
              <td className="num">{formatHoursFixed(split.indirect ?? 0)}</td>
              <td className="num">{formatHoursFixed(sumMinutes(rows))}</td>
            </tr>
          })()}
        </tbody>
        <tfoot><tr>
          <td>Totals</td>
          <td className="num">{formatHoursFixed(categoryMinutes(filtered, data.activityTypes).direct ?? 0)}</td>
          <td className="num">{formatHoursFixed(categoryMinutes(filtered, data.activityTypes).indirect ?? 0)}</td>
          <td className="num">{formatHoursFixed(sumMinutes(filtered))}</td>
        </tr></tfoot>
      </table>

      <h2>Hours by Type</h2>
      <div className="type-columns">
        {(['direct', 'indirect'] as const).map(category => {
          const kinds = kindsFor(category)
          const rows = kinds.map(kind => ({ kind, minutes: sumMinutes(filtered, item => item.activityTypeId === kind.id) }))
          const total = rows.reduce((sum, row) => sum + row.minutes, 0)
          return <div key={category}>
            <table className="summary-table">
              <thead><tr><th>{category === 'direct' ? 'Direct' : 'Indirect'}</th><th className="num">Hours</th></tr></thead>
              <tbody>
                {rows.filter(row => row.minutes > 0).map(row => <tr key={row.kind.id}><td>{row.kind.name}</td><td className="num">{formatHoursFixed(row.minutes)}</td></tr>)}
                {!rows.some(row => row.minutes > 0) && <tr><td colSpan={2}>No {category} hours in this range.</td></tr>}
              </tbody>
              <tfoot><tr><td>Total</td><td className="num">{formatHoursFixed(total)}</td></tr></tfoot>
            </table>
          </div>
        })}
      </div>

      <div className="sign-block">
        <div className="sign-row"><div><div className="sign-line"/><span>Trainee signature</span></div><div><div className="sign-line"/><span>Date</span></div></div>
        <div className="sign-row"><div><div className="sign-line"/><span>Printed name</span></div><div/></div>
        <div className="sign-row"><div><div className="sign-line"/><span>Supervisor signature</span></div><div><div className="sign-line"/><span>Date</span></div></div>
        <div className="sign-row"><div><div className="sign-line"/><span>Printed name</span></div><div/></div>
        <div className="sign-row"><div><div className="sign-line"/><span>Program verification signature</span></div><div><div className="sign-line"/><span>Date</span></div></div>
        <div className="sign-row"><div><div className="sign-line"/><span>Printed name</span></div><div><div className="sign-line"/><span>Title / Position</span></div></div>
      </div>
    </article>
  </section>
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
    <PageHeading kicker="Your workspace" title="Settings & data" copy="Backups, privacy, and a clean reset. Supervisors live on the Placement page."/>
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
      <article className="panel settings-card"><div className="settings-icon"><Briefcase/></div><h2>Activity types</h2><p>Direct and indirect hours use a fixed list. You cannot add custom types. Manage jobs, sites, and supervisors on the Placement page.</p></article>
      <article className="panel settings-card danger-card"><div className="settings-icon"><Trash2/></div><h2>Reset workspace</h2><p>Remove every entry and start over. Download a backup first if you may need this data.</p><button className="danger" onClick={reset}>Delete all data</button></article>
    </div>
  </section>
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

function ActivityDialog({ activity, data, close, save, remove, openPlacements }: {
  activity: Activity, data: AppData, close: () => void,
  save: (activity: Activity) => Promise<string | null>,
  remove: (id: string) => Promise<string | null>, openPlacements: () => void,
}) {
  const initialType = typeOf(data, activity.activityTypeId)
  const [date, setDate] = useState(activity.date || today())
  const [hours, setHours] = useState(String(hoursFromMinutes(activity.durationMinutes) || 1))
  const [category, setCategory] = useState<ActivityCategory>(initialType?.category ?? 'direct')
  const [activityTypeId, setActivityTypeId] = useState(initialType?.id ?? firstKindId('direct'))
  const [placementId, setPlacementId] = useState(activity.placementId)
  const [notes, setNotes] = useState(activity.notes)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const parsedHours = parseHours(hours)
  const kindOptions = kindsFor(category)
  const placements = activeItems(data.placements, placementId)
  const selectedPlacement = placementOf(data.placements, placementId)

  const chooseCategory = (next: ActivityCategory) => {
    setCategory(next)
    if (typeCategory(data, activityTypeId) !== next) setActivityTypeId(firstKindId(next))
    setError('')
  }

  const problem = () => {
    if (!date) return 'Choose the date you worked.'
    if (!placements.length) return 'Add a placement before logging hours.'
    if (!placementId) return 'Choose the placement these hours belong to.'
    if (!activityTypeId) return `Choose a ${category} activity.`
    if (parsedHours === null) return 'Enter how many hours you worked, for example 1.5.'
    if (parsedHours > 24) return 'A single entry cannot be longer than 24 hours.'
    return ''
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const found = problem()
    setError(found)
    if (found) return
    setSaving(true)
    const next = await save({
      ...activity, date, durationMinutes: minutesFromHours(parsedHours!), activityTypeId,
      placementId, supervisorId: selectedPlacement?.supervisorId ?? '', notes: notes.trim(),
    })
    setSaving(false)
    if (next) setError(next)
  }

  return <div className="modal-layer" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !saving) close() }}>
    <form className="modal" onSubmit={e => void submit(e)} role="dialog" aria-modal="true" aria-labelledby="activity-title">
      <div className="modal-head">
        <div><span className="kicker">{activity.id ? 'EDIT ENTRY' : 'NEW ENTRY'}</span><h2 id="activity-title">{activity.id ? 'Edit hours' : 'Log your hours'}</h2></div>
        <button type="button" className="icon-button" aria-label="Close" disabled={saving} onClick={close}><X/></button>
      </div>
      <div className="form-grid">
        <label className="full">Date
          <input type="date" value={date} onChange={e => { setDate(e.target.value); setError('') }}/>
          <div className="hour-chips date-chips">
            <button type="button" className={`chip ${date === today() ? 'on' : ''}`} onClick={() => { setDate(today()); setError('') }}>Today</button>
            <button type="button" className="chip" onClick={() => { setDate(shiftDate(date || today(), -1)); setError('') }}>Previous day</button>
            <button type="button" className="chip" onClick={() => { setDate(shiftDate(date || today(), 1)); setError('') }}>Next day</button>
          </div>
        </label>
        <label className="full">Hours
          <input aria-label="Hours" type="text" inputMode="decimal" value={hours} onChange={e => { setHours(e.target.value); setError('') }}/>
          <small>Use decimal hours — 1.5 is one and a half hours.</small>
        </label>
        <div className="field full"><span>Quick pick</span>
          <div className="hour-chips">{QUICK_HOURS.map(value => <button type="button" key={value} className={`chip ${parsedHours === value ? 'on' : ''}`} onClick={() => { setHours(String(value)); setError('') }}>{value} h</button>)}</div>
        </div>
        <label className="full">Placement
          <select aria-label="Placement" value={placementId} onChange={e => { setPlacementId(e.target.value); setError('') }}>
            <option value="">{placements.length ? 'Choose a placement' : 'Add a placement first'}</option>
            {placements.map(item => <option key={item.id} value={item.id}>{item.name}{item.site ? ` · ${item.site}` : ''}</option>)}
          </select>
          {selectedPlacement?.supervisorId && <small>Supervisor: {itemName(data.dictionaries.supervisors, selectedPlacement.supervisorId)}</small>}
        </label>
        <div className="field full"><span>Activity type</span>
          <div className="type-choice" role="radiogroup" aria-label="Activity type">
            {(['direct', 'indirect'] as const).map(next => {
              const selected = category === next
              return <button type="button" key={next} role="radio" aria-checked={selected} className={`type-choice-btn ${selected ? 'on' : ''}`} onClick={() => chooseCategory(next)}>
                <i style={{ background: next === 'direct' ? '#42564b' : '#a05d42' }}/>
                <strong>{next === 'direct' ? 'Direct hours' : 'Indirect hours'}</strong>
                <small>{next === 'direct' ? 'Time with clients' : 'Everything else'}</small>
              </button>
            })}
          </div>
        </div>
        <label className="full">{category === 'direct' ? 'Direct activity' : 'Indirect activity'}
          <select aria-label={category === 'direct' ? 'Direct activity' : 'Indirect activity'} value={activityTypeId} onChange={e => { setActivityTypeId(e.target.value); setError('') }}>
            {kindOptions.map(kind => <option key={kind.id} value={kind.id}>{kind.name}</option>)}
          </select>
        </label>
        <label className="full">Notes<textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="A short, useful note…"/></label>
      </div>
      {error && <p className="form-error" role="alert">{error}{error.includes('placement') && <> <button type="button" className="text-button" onClick={openPlacements}>Open Placement</button></>}</p>}
      <div className="modal-actions">
        {activity.id && <button type="button" className="danger-text" disabled={saving} onClick={() => void remove(activity.id).then(next => { if (next) setError(next) })}><Trash2 size={17}/> Delete</button>}
        <span/>
        <button type="button" className="secondary" disabled={saving} onClick={close}>Cancel</button>
        <button className="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : activity.id ? 'Save changes' : 'Save entry'}</button>
      </div>
    </form>
  </div>
}

export default App
