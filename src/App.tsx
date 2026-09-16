import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Database,
  Download, FileBarChart, LayoutDashboard, LogOut, Menu, MoreHorizontal, Plus,
  Settings, ShieldCheck, Sparkles, Trash2, Upload, UserCircle, Users, X,
} from 'lucide-react'
import {
  categoryMinutes, formatHours, formatHoursFixed, hoursFromMinutes,
  inDateRange, minutesFromHours, parseHours, sumMinutes, totalMinutes,
} from './calculations'
import { download, exportJson, isValidBackup, migrate, resetData } from './data'
import { useAuth, navigate } from './auth/AuthProvider'
import { AccountPage, AdminPage } from './auth/pages'
import { countLabels, entityCounts } from './migration'
import { useWorkspace } from './workspace/WorkspaceProvider'
import {
  activeItems, canRemoveDictionaryItem, canRemovePlacement, dictionaryUsage,
  emptyPlacement, findOrCreateNamed, firstKindId, itemName, kindsFor,
  placementName, placementOf, removeItem, renameItem, resolveKindId, setItemActive,
  activitySelectLabel, CATEGORY_ORDER, categoryLabel, categoryMeta,
} from './dictionaries'
import type { Activity, ActivityCategory, AppData, DictionaryItem, Placement } from './types'
import {
  activitiesForLog, buildTimeLogCsv, downloadTimeLog, fileSlug, listReportLogs,
  prettyDateRange, printTimeLog, reportTitle, resolveTraineeName, timeLogFileBase,
  writeTraineeName, type ReportLog,
} from './report'
import { cn } from './lib/utils'
import { Alert } from './components/ui/alert'
import { Button } from './components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Checkbox } from './components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { NativeSelect } from './components/ui/native-select'
import { Sheet, SheetContent, SheetTitle } from './components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table'
import { Textarea } from './components/ui/textarea'

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
  const last = data.activities[0]
  const lastType = last ? typeOf(data, last.activityTypeId) : undefined
  const lastPlacement = last ? placementOf(data.placements, last.placementId) : undefined
  const placement = lastPlacement ?? data.placements.find(item => item.active) ?? data.placements[0]
  return {
    id: '', date, durationMinutes: last?.durationMinutes ?? 60,
    activityTypeId: lastType?.id ?? firstKindId('direct'),
    placementId: placement?.id ?? '', supervisorId: placement?.supervisorId ?? '', notes: '', createdAt: '', updatedAt: '',
  }
}

const kickerClass = 'text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground'
const navBtn = (active: boolean) => cn(
  'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-sidebar-foreground transition-colors hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground',
  active && 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm',
)

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
  const banner = (message: React.ReactNode, warn = false) => (
    <div className={cn('sticky top-[70px] z-20 px-[4.2vw] py-2 text-xs font-bold no-print', warn ? 'bg-destructive/20 text-foreground' : 'bg-accent text-accent-foreground')} role="status">
      {message}
    </div>
  )
  if (status === 'saved') return showSaved ? banner('Online and saved') : null
  if (status === 'saving') return banner('Saving…')
  if (status === 'offline') return banner('Your changes could not be saved. Check your connection and try again.', true)
  if (status === 'expired') return banner(<>Your session expired. Please sign in again. <Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate('/login')}>Sign in</Button></>, true)
  return banner(<>{lastError || 'Your changes could not be saved. Check your connection and try again.'} <Button variant="link" className="h-auto p-0 text-xs" onClick={retry}>Retry</Button></>, true)
}

function MigrationModal() {
  const { migration, resolveMigration } = useWorkspace()
  if (!migration) return null
  const counts = entityCounts(migration.local)
  return (
    <Dialog open>
      <DialogContent showClose={false} className="sm:max-w-lg" onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle id="migrate-title">Upload local data?</DialogTitle>
          <DialogDescription>This browser has a local workspace. Upload adds missing records only and never overwrites rows in your account.</DialogDescription>
        </DialogHeader>
        <ul className="text-sm leading-7">
          {countLabels.map(({ key, label }) => <li key={key}>{label}: {counts[key]}</li>)}
        </ul>
        <DialogFooter className="justify-end">
          <Button onClick={() => void resolveMigration('upload')}>Upload local data</Button>
          <Button variant="outline" onClick={() => void resolveMigration('keep')}>Keep local data only</Button>
          <Button variant="ghost" className="text-destructive" onClick={() => void resolveMigration('cancel')}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function App({ section }: { section?: Section }) {
  const { data, setData, commit, kind } = useWorkspace()
  const { remote, profile, signOut, updateDisplayName } = useAuth()
  const [page, setPage] = useState<Page>('dashboard')
  const [navOpen, setNavOpen] = useState(false)
  const [editing, setEditing] = useState<Activity | null>(null)
  const [reportLogKey, setReportLogKey] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 2600); return () => clearTimeout(id) }, [toast])

  const openNew = (date?: string) => setEditing(emptyActivity(data, date))
  const saveActivity = async (entries: Activity[]) => {
    const now = new Date().toISOString()
    let activities = data.activities
    for (const activity of entries) {
      const placement = placementOf(data.placements, activity.placementId)
      const nextActivity = { ...activity, supervisorId: activity.supervisorId || placement?.supervisorId || '' }
      activities = nextActivity.id
        ? activities.map(item => item.id === nextActivity.id ? { ...nextActivity, updatedAt: now } : item)
        : [{ ...nextActivity, id: uid(), createdAt: now, updatedAt: now }, ...activities]
    }
    const error = await commit({ ...data, activities })
    if (error) return error
    setEditing(null)
    const count = entries.length
    setToast(entries[0]?.id && count === 1 ? 'Hours updated' : count > 1 ? `${count} entries logged` : 'Hours logged')
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
  const goReports = (placementId?: string) => {
    const logs = listReportLogs(data)
    const match = (placementId ? logs.find(log => log.placementId === placementId) : undefined) ?? logs[0]
    setReportLogKey(match?.key ?? '')
    openPage('reports')
  }
  const currentLabel = section === 'admin' ? 'Users & invitations'
    : section === 'account' ? 'Account & security'
    : nav.find(([id]) => id === page)?.[2] ?? 'Overview'
  const atDashboard = !section && page === 'dashboard'

  const sidebar = (
    <>
      <button type="button" className="mb-2 flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/70" onClick={goDashboard} aria-label="the Hours of Pee — go to overview">
        <img className="size-[39px] shrink-0 rounded-xl object-cover" src="/favicon.svg" width={39} height={39} alt=""/>
        <div className="min-w-0">
          <strong className="block font-serif text-lg leading-tight tracking-tight">the Hours of Pee</strong>
          <span className="mt-0.5 block text-[10px] tracking-wide text-muted-foreground">personal hours tracker</span>
        </div>
      </button>
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-0.5">
        <span className={cn(kickerClass, 'px-3 pb-1 pt-3')}>Workspace</span>
        {nav.map(([id, Icon, label]) => (
          <button key={id} type="button" aria-current={!section && page === id ? 'page' : undefined} className={navBtn(!section && page === id)} onClick={() => openPage(id)}>
            <Icon size={19}/><span className="truncate">{label}</span>
          </button>
        ))}
        {remote && <>
          <span className={cn(kickerClass, 'px-3 pb-1 pt-3')}>Your account</span>
          <button type="button" aria-current={section === 'account' ? 'page' : undefined} className={navBtn(section === 'account')} onClick={() => openSection('/account')}><UserCircle size={19}/><span>Account</span></button>
          {profile?.role === 'admin' && <button type="button" aria-current={section === 'admin' ? 'page' : undefined} className={navBtn(section === 'admin')} onClick={() => openSection('/admin')}><ShieldCheck size={19}/><span>Admin</span></button>}
          <button type="button" className={navBtn(false)} onClick={() => void signOut().then(() => navigate('/login'))}><LogOut size={19}/><span>Sign out</span></button>
        </>}
      </nav>
      <div className="mt-auto flex gap-2.5 rounded-xl bg-accent p-3 text-accent-foreground">
        <Sparkles size={17} className="mt-0.5 shrink-0"/>
        <div>
          <strong className="block text-xs">{kind === 'remote' ? 'Private account' : 'Local & private'}</strong>
          <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">{kind === 'remote' ? 'Your hours are isolated by account and only visible to you.' : 'Your data never leaves this browser.'}</span>
        </div>
      </div>
    </>
  )

  return <div className="min-h-svh">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col gap-2 overflow-y-auto border-r border-sidebar-border bg-sidebar p-4 no-print lg:flex" id="app-sidebar">
      {sidebar}
    </aside>
    <Sheet open={navOpen} onOpenChange={setNavOpen}>
      <SheetContent side="left" className="gap-2 overflow-y-auto p-4 pt-12 lg:hidden">
        <SheetTitle className="sr-only">Main navigation</SheetTitle>
        {sidebar}
      </SheetContent>
    </Sheet>
    <main className="min-h-svh lg:ml-[248px]">
      <header className="sticky top-0 z-10 flex min-h-[70px] items-center justify-between gap-3 border-b bg-background/85 px-4 backdrop-blur-md no-print sm:px-6 lg:px-[4.2vw]">
        <Button className="lg:hidden" variant="ghost" size="icon" aria-label="Open navigation" aria-controls="app-sidebar" aria-expanded={navOpen} onClick={() => setNavOpen(true)}><Menu size={21}/></Button>
        <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          {atDashboard
            ? <span className={cn(kickerClass, 'max-sm:hidden')}>PERSONAL WORKSPACE</span>
            : <>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={goDashboard}><LayoutDashboard size={15}/><span className="max-sm:hidden">Dashboard</span></Button>
              <ChevronRight size={14} aria-hidden className="shrink-0"/>
              <span className="truncate text-xs font-bold text-foreground">{currentLabel}</span>
            </>}
        </div>
        <Button className="shrink-0" size="sm" onClick={() => openNew()}><Plus size={18}/> Log hours</Button>
      </header>
      <SaveBanner />
      {section === 'admin' ? <AdminPage/> : section === 'account' ? <AccountPage/> : <>
        {page === 'dashboard' && <Dashboard data={data} openNew={openNew} edit={setEditing} go={setPage}/>}
        {page === 'calendar' && <Calendar data={data} openNew={openNew} edit={setEditing}/>}
        {page === 'placements' && <Placements data={data} setData={setData} edit={setEditing} openNew={openNew} notify={setToast} goReports={goReports}/>}
        {page === 'reports' && <Reports data={data} traineeName={resolveTraineeName(profile?.displayName)} logKey={reportLogKey} setLogKey={setReportLogKey} saveName={name => {
          writeTraineeName(name)
          if (remote) void updateDisplayName(name)
        }}/>}
        {page === 'settings' && <SettingsPage data={data} setData={setData} notify={setToast}/>}
      </>}
    </main>
    <MigrationModal />
    {editing && <ActivityDialog activity={editing} data={data} close={() => setEditing(null)} save={saveActivity} remove={removeActivity} openPlacements={() => { setEditing(null); openPage('placements') }}/>}
    {toast && <div className="fixed bottom-4 right-4 z-50 flex max-w-[min(360px,calc(100vw-32px))] items-center gap-2 rounded-lg bg-primary px-4 py-3 text-xs text-primary-foreground shadow-lg max-sm:inset-x-4 max-sm:right-auto" role="status"><Check size={17}/>{toast}</div>}
  </div>
}

function PageHeading({ kicker, title, copy, action }: { kicker: string, title: string, copy: string, action?: React.ReactNode }) {
  return (
    <div className="page-heading mb-6 flex flex-col items-start justify-between gap-4 md:mb-8 md:flex-row md:items-end">
      <div className="min-w-0">
        <span className={kickerClass}>{kicker}</span>
        <h1 className="mt-2 font-serif text-[clamp(1.75rem,4vw,3.375rem)] font-semibold leading-[0.95] tracking-tight">{title}</h1>
        <p className="mt-2.5 m-0 text-sm text-muted-foreground">{copy}</p>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">{action}</div>}
    </div>
  )
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
  const directPct = total ? (byCategory.direct ?? 0) / total * 100 : 0
  const indirectPct = total ? (byCategory.indirect ?? 0) / total * 100 : 0

  return <section className="mx-auto max-w-[1420px] px-4 py-6 sm:px-6 sm:py-10 lg:px-[4.2vw] lg:pb-[70px]">
    <PageHeading kicker="Your progress" title="Your hours at a glance." copy="A calm view of the time you have logged."/>
    <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Today" value={formatHours(todayMinutes)} hint={dateLabel(today(), { day: 'numeric', month: 'long' })} tone="sage"/>
      <Metric label="This week" value={formatHours(weekMinutes)} hint={`Since ${dateLabel(iso(weekStart), { day: 'numeric', month: 'short' })}`} tone="clay"/>
      <Metric label="This month" value={formatHours(monthMinutes)} hint={now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} tone="mint"/>
      <Metric label="All-time total" value={formatHours(total)} hint={`${activities.length} ${activities.length === 1 ? 'entry' : 'entries'}`} tone="cream"/>
    </div>
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div><span className={kickerClass}>8 WEEK VIEW</span><CardTitle className="mt-1">Hours over time</CardTitle></div>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><i className="size-2 rounded-full bg-primary"/> Hours logged</span>
        </CardHeader>
        <CardContent>
          <div className="flex h-[205px] items-end gap-3 border-b pt-5" style={{ background: 'repeating-linear-gradient(to bottom, transparent 0, transparent 49px, var(--border) 50px)' }} role="img" aria-label="Hours logged over the last eight weeks">
            {weekBars.map((bar, index) => (
              <div className="relative flex h-full flex-1 flex-col items-center justify-end" key={index}>
                <span className="mb-1 text-[9px] text-muted-foreground">{bar.minutes ? hoursFromMinutes(bar.minutes) : ''}</span>
                <div className="w-[min(34px,60%)] min-h-1 rounded-t bg-primary transition-all duration-300" style={{ height: `${Math.max(4, bar.minutes / maxWeek * 100)}%` }}/>
                <small className="py-2 text-[9px] text-muted-foreground">{bar.label}</small>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><span className={kickerClass}>BREAKDOWN</span><CardTitle className="mt-1">By category</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-5">
            <div className="relative grid size-[145px] shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${categoryMeta.direct.color} 0 ${directPct}%, ${categoryMeta.indirect.color} 0 ${directPct + indirectPct}%, ${categoryMeta.supervision.color} 0)` }}>
              <div className="absolute inset-5 rounded-full bg-card"/>
              <div className="z-10 text-center"><strong className="block font-serif text-xl">{formatHours(total)}</strong><span className="text-[9px] uppercase tracking-widest text-muted-foreground">total</span></div>
            </div>
            <div className="w-full min-w-0">
              {CATEGORY_ORDER.map(category => (
                <div key={category} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-2 text-[11px] last:border-0">
                  <i className="size-1.5 rounded-full" style={{ background: categoryMeta[category].color }}/>
                  <span className="truncate">{categoryLabel(category)}</span>
                  <strong className="whitespace-nowrap tabular-nums">{formatHours(byCategory[category] ?? 0)}</strong>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="col-span-full">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div><span className={kickerClass}>LATEST</span><CardTitle className="mt-1">Recent entries</CardTitle></div>
          <Button variant="link" className="h-auto p-0 text-xs" onClick={() => go('placements')}>View placements <ChevronRight size={16}/></Button>
        </CardHeader>
        <CardContent>
          {recent.length
            ? <ActivityRows activities={recent} data={data} edit={edit}/>
            : <EmptyState icon={Clock3} title="No hours logged yet" copy="Add your first entry and it will show up here." action={<Button onClick={openNew}><Plus size={17}/> Log hours</Button>}/>}
        </CardContent>
      </Card>
    </div>
  </section>
}

function Metric({ label, value, hint, tone }: { label: string, value: string, hint: string, tone: 'sage' | 'clay' | 'mint' | 'cream' }) {
  const tones = {
    sage: 'bg-primary text-primary-foreground',
    clay: 'bg-peach text-foreground',
    mint: 'bg-secondary text-secondary-foreground',
    cream: 'border border-border bg-background text-foreground',
  }
  return (
    <Card className={cn('relative flex min-h-[124px] flex-col overflow-hidden p-5 shadow-none md:min-h-[152px]', tones[tone])}>
      <span className="text-xs font-semibold opacity-80">{label}</span>
      <strong className="mt-3 block font-serif text-[28px] font-semibold tracking-tight md:mt-4 md:text-[33px]">{value}</strong>
      <small className="mt-auto pt-4 text-[10px] opacity-70">{hint}</small>
    </Card>
  )
}

function EmptyState({ icon: Icon, title, copy, action }: { icon: React.ComponentType<{ size?: number }>, title: string, copy: string, action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center text-muted-foreground">
      <Icon size={28}/>
      <strong className="mt-3 font-serif text-lg font-semibold text-foreground/80">{title}</strong>
      <span className="mt-1 text-xs">{copy}</span>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
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
  return <section className="mx-auto max-w-[1420px] px-4 py-6 sm:px-6 sm:py-10 lg:px-[4.2vw] lg:pb-[70px]">
    <PageHeading kicker="Plan & review" title="Calendar" copy="Pick a day to see or add the hours you worked."/>
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,2.1fr)_minmax(260px,.9fr)]">
      <Card className="min-w-0 overflow-x-auto p-0">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 sm:px-5">
          <div className="flex items-center gap-1">
            <Button variant="outline" className="max-sm:hidden" onClick={() => { setCursor(new Date()); setSelected(today()) }}>Today</Button>
            <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft/></Button>
            <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight/></Button>
          </div>
          <h2 className="font-serif text-lg font-semibold sm:text-[22px]">{cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
        </div>
        <div className="grid grid-cols-7">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => <span className="border-b px-1 py-3 text-center text-[9px] font-bold tracking-wider text-muted-foreground" key={day}>{day}</span>)}</div>
        <div className="grid grid-cols-7">{days.map(day => {
          const dayIso = iso(day)
          const items = data.activities.filter(a => a.date === dayIso)
          return <button key={dayIso} aria-label={`${dateLabel(dayIso, { day: 'numeric', month: 'long' })}, ${formatHours(sumMinutes(items))}`} className={cn('relative h-[58px] border-b border-r p-1.5 text-left text-sm last:border-r-0 hover:bg-muted/60 sm:h-[88px] sm:p-2.5 [&:nth-child(7n)]:border-r-0', day.getMonth() !== cursor.getMonth() && 'text-muted-foreground/50', dayIso === selected && 'bg-accent shadow-[inset_0_0_0_2px_var(--primary)]', dayIso === today() && '[&>span]:grid [&>span]:size-6 [&>span]:place-items-center [&>span]:rounded-full [&>span]:bg-primary [&>span]:text-primary-foreground')} onClick={() => setSelected(dayIso)}>
            <span>{day.getDate()}</span>
            <div className="mt-2 flex gap-1 sm:mt-5">{items.slice(0, 3).map(a => <i key={a.id} className="size-1.5 rounded-full" style={{ background: typeOf(data, a.activityTypeId)?.color }}/>)}</div>
            {items.length > 3 && <small className="text-[8px] text-muted-foreground">+{items.length - 3}</small>}
          </button>
        })}</div>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <span className={kickerClass}>SELECTED DAY</span>
          <CardTitle className="mt-1 text-xl sm:text-2xl">{dateLabel(selected, { weekday: 'long', month: 'long', day: 'numeric' })}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-lg bg-muted p-2.5"><span className="block text-[8px] uppercase text-muted-foreground">Day</span><strong className="mt-1 block font-serif text-[15px]">{formatHours(sumMinutes(selectedItems))}</strong></div>
            <div className="rounded-lg bg-muted p-2.5"><span className="block text-[8px] uppercase text-muted-foreground">Week</span><strong className="mt-1 block font-serif text-[15px]">{formatHours(sumMinutes(data.activities, a => inDateRange(a.date, iso(selectedWeek), iso(selectedWeekEnd))))}</strong></div>
            <div className="rounded-lg bg-muted p-2.5"><span className="block text-[8px] uppercase text-muted-foreground">Month</span><strong className="mt-1 block font-serif text-[15px]">{formatHours(sumMinutes(data.activities, a => a.date.startsWith(selectedMonth)))}</strong></div>
          </div>
          <div className="mt-5">
            {selectedItems.length
              ? selectedItems.map(a => (
                <button key={a.id} className="mb-2 flex w-full flex-col rounded-r-lg bg-muted py-3 pl-3 pr-2 text-left" style={{ borderLeft: `4px solid ${typeOf(data, a.activityTypeId)?.color}` }} onClick={() => edit(a)}>
                  <strong className="text-xs">{typeName(data, a.activityTypeId)}</strong>
                  <small className="text-[9px] text-muted-foreground">{formatHours(a.durationMinutes)}{a.notes ? ` · ${a.notes}` : ''}</small>
                </button>
              ))
              : <EmptyState icon={CalendarDays} title="Nothing logged" copy="This day is wide open."/>}
          </div>
          <Button className="mt-3.5 w-full" onClick={() => openNew(selected)}><Plus size={16}/> Log hours on {dateLabel(selected, { day: 'numeric', month: 'short' })}</Button>
        </CardContent>
      </Card>
    </div>
  </section>
}

function exportLogsAsCsv(data: AppData, logs: ReportLog[], traineeName: string) {
  logs.forEach((log, index) => {
    const rows = activitiesForLog(data, log).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    const dates = rows.map(item => item.date)
    const from = dates[0] ?? today()
    const to = dates.at(-1) ?? today()
    const base = timeLogFileBase(traineeName, from, to)
    const fileBase = logs.length > 1 ? `${base}_${fileSlug(log.placementName)}` : base
    window.setTimeout(() => {
      downloadTimeLog(fileBase, buildTimeLogCsv(data, rows, {
        traineeName, placementName: log.placementName, supervisorName: log.supervisorName, site: log.site, from, to,
      }))
    }, index * 160)
  })
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
    return <section className="mx-auto max-w-[1420px] px-4 py-6 sm:px-6 sm:py-10 lg:px-[4.2vw] lg:pb-[70px]">
      <PageHeading
        kicker="Job / site"
        title={selected.name}
        copy={[selected.site, itemName(data.dictionaries.supervisors, selected.supervisorId), rangeLabel(selected.startDate, selected.endDate)].filter(Boolean).join(' · ') || 'Hours logged against this placement.'}
        action={<div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSelectedId(null)}><ChevronLeft size={16}/> All placements</Button>
          <Button variant="outline" onClick={() => goReports(selected.id)}><FileBarChart size={17}/> Report</Button>
          <Button variant="outline" onClick={() => exportLogsAsCsv(data, listReportLogs(data).filter(log => log.placementId === selected.id), resolveTraineeName())}><Download size={17}/> CSV</Button>
          <Button size="sm" onClick={() => setDraft(selected)}>Edit</Button>
        </div>}
      />
      <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Direct" value={formatHours(split.direct ?? 0)} hint={categoryMeta.direct.hint} tone="sage"/>
        <Metric label="Indirect" value={formatHours(split.indirect ?? 0)} hint={categoryMeta.indirect.hint} tone="clay"/>
        <Metric label="Supervision" value={formatHours(split.supervision ?? 0)} hint={categoryMeta.supervision.hint} tone="mint"/>
        <Metric label="Total" value={formatHours(sumMinutes(rows))} hint={`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`} tone="cream"/>
      </div>
      <Card className="overflow-hidden p-0">
        <div className="border-b px-4 py-4"><strong className="text-sm">Hours at this site</strong></div>
        <HoursTable activities={rows} data={data} edit={edit}/>
        {!rows.length && <EmptyState icon={Clock3} title="No hours here yet" copy="Log time against this placement to separate it from your other jobs." action={<Button onClick={openNew}><Plus size={17}/> Log hours</Button>}/>}
      </Card>
      {draft && <PlacementDialog placement={draft} data={data} setData={setData} close={() => setDraft(null)} save={savePlacement}/>}
    </section>
  }

  return <section className="mx-auto max-w-[1420px] px-4 py-6 sm:px-6 sm:py-10 lg:px-[4.2vw] lg:pb-[70px]">
    <PageHeading kicker="Jobs & sites" title="Placement" copy="Separate hours by the job or site they belong to, then export a report for each one." action={<Button size="sm" onClick={() => setDraft(emptyPlacement())}><Plus size={17}/> Add placement</Button>}/>
    {data.placements.length
      ? <div className="mb-4 grid grid-cols-1 gap-3.5 lg:grid-cols-2">{data.placements.map(placement => {
        const rows = hoursFor(placement.id)
        const split = categoryMinutes(rows, data.activityTypes)
        return <Card className={cn(!placement.active && 'opacity-70')} key={placement.id}>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div><span className={kickerClass}>{placement.active ? 'ACTIVE' : 'HIDDEN'}</span><CardTitle className="mt-1">{placement.name}</CardTitle></div>
            <Button variant="ghost" size="icon" aria-label={`Edit ${placement.name}`} onClick={() => setDraft(placement)}><MoreHorizontal size={19}/></Button>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{[placement.site, itemName(data.dictionaries.supervisors, placement.supervisorId), rangeLabel(placement.startDate, placement.endDate)].filter(Boolean).join(' · ') || 'No site details yet.'}</p>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-muted p-2.5"><span className="block text-[8px] uppercase tracking-wide text-muted-foreground">Direct</span><strong className="mt-1 block font-serif text-lg">{formatHoursFixed(split.direct ?? 0)}</strong></div>
              <div className="rounded-lg bg-muted p-2.5"><span className="block text-[8px] uppercase tracking-wide text-muted-foreground">Indirect</span><strong className="mt-1 block font-serif text-lg">{formatHoursFixed(split.indirect ?? 0)}</strong></div>
              <div className="rounded-lg bg-muted p-2.5"><span className="block text-[8px] uppercase tracking-wide text-muted-foreground">Supervision</span><strong className="mt-1 block font-serif text-lg">{formatHoursFixed(split.supervision ?? 0)}</strong></div>
              <div className="rounded-lg bg-muted p-2.5"><span className="block text-[8px] uppercase tracking-wide text-muted-foreground">Total</span><strong className="mt-1 block font-serif text-lg">{formatHoursFixed(sumMinutes(rows))}</strong></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setSelectedId(placement.id)}>View hours</Button>
              <Button variant="outline" size="sm" onClick={() => goReports(placement.id)}>Export report</Button>
            </div>
          </CardContent>
        </Card>
      })}</div>
      : <Card><EmptyState icon={Briefcase} title="No placements yet" copy="Add each job or site so you can sort and export hours separately." action={<Button onClick={() => setDraft(emptyPlacement())}><Plus size={17}/> Add placement</Button>}/></Card>}
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
  return <Table>
    <TableHeader>
      <TableRow><TableHead>Date</TableHead><TableHead>Activity</TableHead><TableHead>Hours</TableHead><TableHead className="hidden md:table-cell">Notes</TableHead><TableHead/></TableRow>
    </TableHeader>
    <TableBody>{activities.map(a => <TableRow key={a.id}>
      <TableCell><strong>{dateLabel(a.date, { day: '2-digit', month: 'short', year: 'numeric' })}</strong></TableCell>
      <TableCell>
        <span className="flex items-center gap-2">
          <i className="h-6 w-1.5 rounded" style={{ background: typeOf(data, a.activityTypeId)?.color }}/>
          <span>{typeName(data, a.activityTypeId)}<small className="mt-0.5 block text-[9px] text-muted-foreground">{categoryLabel(typeCategory(data, a.activityTypeId))}</small></span>
        </span>
      </TableCell>
      <TableCell><strong>{formatHours(a.durationMinutes)}</strong></TableCell>
      <TableCell className="hidden max-w-[180px] truncate text-muted-foreground md:table-cell">{a.notes || '—'}</TableCell>
      <TableCell><Button variant="ghost" size="icon" aria-label={`Edit entry on ${a.date}`} onClick={() => edit(a)}><MoreHorizontal size={19}/></Button></TableCell>
    </TableRow>)}</TableBody>
  </Table>
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

  return (
    <Dialog open onOpenChange={next => { if (!next) close() }}>
      <DialogContent showClose={false} className="gap-0 p-0 sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col">
          <div className="flex items-start justify-between gap-3 border-b p-5">
            <DialogHeader>
              <span className={kickerClass}>{placement.id ? 'EDIT PLACEMENT' : 'NEW PLACEMENT'}</span>
              <DialogTitle id="placement-title">{placement.id ? 'Edit placement' : 'Add a placement'}</DialogTitle>
            </DialogHeader>
            <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={close}><X/></Button>
          </div>
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="placement-name">Placement name</Label><Input id="placement-name" value={name} onChange={e => { setName(e.target.value); setError('') }} placeholder="e.g. 2025–2026 Practicum"/></div>
            <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="placement-site">Job / site</Label><Input id="placement-site" value={site} onChange={e => setSite(e.target.value)} placeholder="e.g. Riverbank Psychotherapy"/></div>
            <div className="grid gap-1.5 sm:col-span-2">
              <span className={kickerClass} id="placement-supervisor">Supervisor</span>
              <SupervisorSelect labelledBy="placement-supervisor" items={data.dictionaries.supervisors} value={supervisorId} onChange={setSupervisorId} onCreate={name => {
                const next = findOrCreateNamed(data.dictionaries.supervisors, name)
                setData(current => ({ ...current, dictionaries: { ...current.dictionaries, supervisors: next.items } }))
                setSupervisorId(next.id)
              }}/>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="placement-start">Start date</Label><Input id="placement-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)}/></div>
            <div className="grid gap-1.5"><Label htmlFor="placement-end">End date</Label><Input id="placement-end" type="date" value={endDate} min={startDate || undefined} onChange={e => setEndDate(e.target.value)}/></div>
            <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
              <Checkbox checked={active} onCheckedChange={value => setActive(Boolean(value))}/>
              Show this placement when logging hours
            </label>
          </div>
          {error && <Alert variant="destructive" className="mx-5 mb-2">{error}</Alert>}
          <DialogFooter className="p-5 pt-3">
            {placement.id && remove && <Button type="button" variant="ghost" className="mr-auto text-destructive" onClick={() => remove(placement)}><Trash2 size={17}/> Delete</Button>}
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit">{placement.id ? 'Save placement' : 'Add placement'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
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

  return <Card>
    <CardHeader>
      <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground"><Users/></div>
      <CardTitle className="mt-3">Supervisors</CardTitle>
      <p className="text-xs leading-relaxed text-muted-foreground">Add supervisors here, then attach them to a placement. They are not added while logging hours.</p>
    </CardHeader>
    <CardContent>
      <div className="overflow-hidden rounded-xl border">
        {items.map(item => {
          const used = dictionaryUsage(data, 'supervisors', item.id)
          return <div className={cn('grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-t px-2.5 py-2 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_72px_auto_36px]', !item.active && 'opacity-60')} key={item.id}>
            <Input aria-label={`Name for ${item.name}`} className="border-transparent bg-transparent shadow-none focus-visible:border-input focus-visible:bg-background" value={drafts[item.id] ?? item.name} onChange={e => setDrafts(current => ({ ...current, [item.id]: e.target.value }))} onBlur={e => {
              const trimmed = e.target.value.trim()
              if (trimmed) setItems(list => renameItem(list, item.id, trimmed))
              setDrafts(current => { const next = { ...current }; delete next[item.id]; return next })
            }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}/>
            <small className="hidden text-right text-[9px] text-muted-foreground sm:block">{used ? `${used} in use` : 'Unused'}</small>
            <Button type="button" variant="outline" size="sm" onClick={() => setItems(list => setItemActive(list, item.id, !item.active))}>{item.active ? 'Hide' : 'Show'}</Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.name}`} disabled={!canRemoveDictionaryItem(data, 'supervisors', item.id)} onClick={() => remove(item.id)}><Trash2 size={16}/></Button>
          </div>
        })}
        {!items.length && <div className="px-3 py-8 text-center text-xs text-muted-foreground">No supervisors yet. Add one and attach it to a placement.</div>}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={add}>
        <Input aria-label="Add supervisor" placeholder="Add supervisor" value={newName} onChange={e => setNewName(e.target.value)}/>
        <Button size="sm" type="submit"><Plus size={16}/> Add</Button>
      </form>
    </CardContent>
  </Card>
}

function ActivityRows({ activities, data, edit }: { activities: Activity[], data: AppData, edit: (a: Activity) => void }) {
  return <div>{activities.map(a => (
    <button key={a.id} className="flex w-full items-center gap-3.5 border-b py-2.5 text-left last:border-0 hover:bg-muted/40" onClick={() => edit(a)}>
      <span className="hidden w-9 text-center sm:block"><strong className="block font-serif text-lg">{dateLabel(a.date, { day: '2-digit' })}</strong><small className="text-[9px] text-muted-foreground">{dateLabel(a.date, { month: 'short' })}</small></span>
      <i className="h-9 w-1.5 rounded" style={{ background: typeOf(data, a.activityTypeId)?.color }}/>
      <span className="min-w-0 flex-1"><strong className="block text-xs">{typeName(data, a.activityTypeId)}</strong><small className="text-[9px] text-muted-foreground">{[placementName(data.placements, a.placementId, ''), a.notes].filter(Boolean).join(' · ') || 'No notes'}</small></span>
      <strong className="text-xs">{formatHours(a.durationMinutes)}</strong><ChevronRight size={17} className="shrink-0 text-muted-foreground"/>
    </button>
  ))}</div>
}

function Reports({ data, traineeName, logKey, setLogKey, saveName }: {
  data: AppData, traineeName: string, logKey: string, setLogKey: (key: string) => void, saveName: (name: string) => void,
}) {
  const logs = useMemo(() => listReportLogs(data), [data])
  const log = logs.find(item => item.key === logKey) ?? logs[0]
  const logActivities = useMemo(() => activitiesForLog(data, log), [data, log])
  const span = useMemo(() => {
    const dates = logActivities.map(item => item.date).sort()
    return { from: dates[0] ?? today(), to: dates[dates.length - 1] ?? today() }
  }, [logActivities])
  const [from, setFrom] = useState(span.from)
  const [to, setTo] = useState(span.to)
  const [name, setName] = useState(traineeName)

  useLayoutEffect(() => {
    if (log && log.key !== logKey) setLogKey(log.key)
  }, [log, logKey, setLogKey])

  useLayoutEffect(() => {
    setFrom(span.from)
    setTo(span.to)
  }, [log?.key])

  useLayoutEffect(() => {
    setFrom(current => !current || current > span.from ? span.from : current)
    setTo(current => !current || current < span.to ? span.to : current)
  }, [span.from, span.to])

  const filtered = useMemo(() =>
    logActivities.filter(item => inDateRange(item.date, from, to)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)),
  [logActivities, from, to])
  const split = useMemo(() => categoryMinutes(filtered, data.activityTypes), [filtered, data.activityTypes])
  const fileBase = timeLogFileBase(name, from, to)
  const csv = useMemo(() => log ? buildTimeLogCsv(data, filtered, {
    traineeName: name, placementName: log.placementName, supervisorName: log.supervisorName, site: log.site, from, to,
  }) : '', [data, filtered, log, name, from, to])

  return <section className="report-page mx-auto max-w-[1420px] px-4 py-6 sm:px-6 sm:py-10 lg:px-[4.2vw] lg:pb-[70px]">
    <PageHeading kicker="Review & export" title="Reports" copy="One time log per placement and supervisor. Export a CSV or print a PDF with matching names." action={<div className="flex flex-wrap gap-2 no-print">
      <Button variant="outline" disabled={!log} onClick={() => downloadTimeLog(fileBase, csv)}><Download size={17}/> CSV</Button>
      <Button disabled={!log} onClick={() => printTimeLog(fileBase)}><FileBarChart size={17}/> Print / PDF</Button>
    </div>}/>
    <Card className="mb-3.5 no-print">
      <CardContent className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="grid gap-1.5"><Label htmlFor="report-name">Your name</Label><Input id="report-name" value={name} onChange={e => setName(e.target.value)} onBlur={e => saveName(e.target.value)} placeholder="Your name for the header"/></div>
        <div className="grid gap-1.5 sm:col-span-2 xl:col-span-1"><Label htmlFor="report-log">Placement & supervisor</Label>
          <NativeSelect id="report-log" aria-label="Placement and supervisor" value={log?.key ?? ''} onChange={e => setLogKey(e.target.value)}>
            {logs.map(item => <option key={item.key} value={item.key}>{item.placementName} · {item.supervisorName}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5"><Label htmlFor="report-from">From</Label><Input id="report-from" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}/></div>
        <div className="grid gap-1.5"><Label htmlFor="report-to">To</Label><Input id="report-to" type="date" value={to} min={from} onChange={e => setTo(e.target.value)}/></div>
      </CardContent>
    </Card>
    <Card className="summary-report overflow-hidden p-0">
      <header className="summary-head">
        <h1>{reportTitle(name)}</h1>
        <p className="summary-meta">Placement: {log?.placementName || 'Unassigned'}</p>
        <p className="summary-meta">Supervisor: {log?.supervisorName || 'No supervisor'}</p>
        <p className="summary-meta">Date range: {prettyDateRange(from, to)}</p>
      </header>

      <h2>Hours summary</h2>
      <div className="summary-scroll">
        <table className="summary-table">
          <thead><tr><th>Direct</th><th className="num">Indirect</th><th className="num">Supervision</th><th className="num">Total</th></tr></thead>
          <tbody>
            <tr>
              <td className="num">{formatHoursFixed(split.direct ?? 0)}</td>
              <td className="num">{formatHoursFixed(split.indirect ?? 0)}</td>
              <td className="num">{formatHoursFixed(split.supervision ?? 0)}</td>
              <td className="num">{formatHoursFixed(sumMinutes(filtered))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Hours log</h2>
      <div className="summary-scroll">
        <table className="summary-table">
          <thead><tr><th>Date</th><th className="num">Hours</th><th>Category</th><th>Activity</th><th>Notes</th></tr></thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id}>
                <td>{longDate(item.date)}</td>
                <td className="num">{formatHoursFixed(item.durationMinutes)}</td>
                <td>{categoryLabel(typeCategory(data, item.activityTypeId))}</td>
                <td>{typeName(data, item.activityTypeId)}</td>
                <td>{item.notes || '—'}</td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={5}>No hours in this range for this placement and supervisor.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Hours by Type</h2>
      <div className="type-columns">
        {CATEGORY_ORDER.map(category => {
          const kinds = kindsFor(category)
          const rows = kinds.map(kind => ({ kind, minutes: sumMinutes(filtered, item => item.activityTypeId === kind.id) }))
          const total = rows.reduce((sum, row) => sum + row.minutes, 0)
          return <div key={category} className="summary-scroll">
            <table className="summary-table">
              <thead><tr><th>{categoryLabel(category)}</th><th className="num">Hours</th></tr></thead>
              <tbody>
                {rows.filter(row => row.minutes > 0).map(row => <tr key={row.kind.id}><td>{row.kind.name}</td><td className="num">{formatHoursFixed(row.minutes)}</td></tr>)}
                {!rows.some(row => row.minutes > 0) && <tr><td colSpan={2}>No {categoryLabel(category).toLowerCase()} hours in this range.</td></tr>}
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
    </Card>
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
  return <section className="mx-auto max-w-[1420px] px-4 py-6 sm:px-6 sm:py-10 lg:px-[4.2vw] lg:pb-[70px]">
    <PageHeading kicker="Your workspace" title="Settings & data" copy="Backups, privacy, and a clean reset. Supervisors live on the Placement page."/>
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
      <Card className="min-h-[245px]">
        <CardHeader>
          <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground"><Database/></div>
          <CardTitle className="mt-3">Backup & restore</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">Save a complete, versioned copy of your hours, or bring a backup back in. Hours are exported in decimal hours.</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => void backup()}><Download size={17}/> JSON</Button>
          <Button variant="outline" onClick={() => { exportLogsAsCsv(data, listReportLogs(data), resolveTraineeName()); void recordAudit('data_export') }}>CSV</Button>
          <Button variant="outline" onClick={() => input.current?.click()}><Upload size={17}/> Restore</Button>
          <input ref={input} hidden type="file" accept="application/json" onChange={e => restore(e.target.files?.[0])}/>
        </CardContent>
      </Card>
      <Card className="min-h-[245px] bg-accent/60">
        <CardHeader>
          <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground"><Users/></div>
          <CardTitle className="mt-3">Privacy by design</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">Keep notes free of names, addresses, medical record numbers, or any other identifying details.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5 text-xs">
          <span className="flex items-center gap-2"><Check className="size-4 text-primary"/> Your rows are visible only to you</span>
          <span className="flex items-center gap-2"><Check className="size-4 text-primary"/> No analytics or tracking</span>
          <span className="flex items-center gap-2"><Check className="size-4 text-primary"/> Export or delete at any time</span>
        </CardContent>
      </Card>
      <Card className="min-h-[245px]">
        <CardHeader>
          <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground"><Briefcase/></div>
          <CardTitle className="mt-3">Activity types</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">Direct, indirect, and supervision hours use a fixed list. You cannot add custom types. Manage jobs, sites, and supervisors on the Placement page.</p>
        </CardHeader>
      </Card>
      <Card className="min-h-[245px] border-destructive/30">
        <CardHeader>
          <div className="grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive"><Trash2/></div>
          <CardTitle className="mt-3">Reset workspace</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">Remove every entry and start over. Download a backup first if you may need this data.</p>
        </CardHeader>
        <CardContent><Button variant="destructive" onClick={reset}>Delete all data</Button></CardContent>
      </Card>
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
  return <div className="flex flex-wrap items-center gap-2">
    <NativeSelect className="min-w-[140px] flex-1" aria-labelledby={labelledBy} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">None</option>
      {activeItems(items, value).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </NativeSelect>
    {!adding && <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>Add</Button>}
    {adding && <>
      <Input className="min-w-[140px] flex-1" value={name} onChange={e => setName(e.target.value)} placeholder="Supervisor name" autoFocus onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create() } }}/>
      <Button type="button" size="sm" onClick={create}>Save</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
    </>}
  </div>
}

const QUICK_HOURS = [0.5, 1, 1.5, 2, 3, 4, 8]

type Draft = { key: string, activity: Activity, hours: string }

function ActivityDialog({ activity, data, close, save, remove, openPlacements }: {
  activity: Activity, data: AppData, close: () => void,
  save: (entries: Activity[]) => Promise<string | null>,
  remove: (id: string) => Promise<string | null>, openPlacements: () => void,
}) {
  const [drafts, setDrafts] = useState<Draft[]>([{
    key: activity.id || uid(),
    activity,
    hours: String(hoursFromMinutes(activity.durationMinutes) || 1),
  }])
  const [selectedKey, setSelectedKey] = useState(drafts[0].key)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const selected = drafts.find(item => item.key === selectedKey) ?? drafts[0]
  const category = typeOf(data, selected.activity.activityTypeId)?.category ?? 'direct'
  const kindOptions = kindsFor(category)
  const placements = activeItems(data.placements, selected.activity.placementId)
  const selectedPlacement = placementOf(data.placements, selected.activity.placementId)
  const parsedHours = parseHours(selected.hours)
  const editingSaved = Boolean(selected.activity.id)
  const batch = drafts.length > 1

  const patch = (next: Partial<Activity> & { hours?: string }) => {
    setError('')
    const { hours: hoursPatch, ...activityPatch } = next
    setDrafts(current => current.map(item => {
      if (item.key !== selectedKey) return item
      const hours = hoursPatch ?? item.hours
      const parsed = parseHours(hours)
      return {
        ...item,
        hours,
        activity: {
          ...item.activity,
          ...activityPatch,
          durationMinutes: parsed === null ? item.activity.durationMinutes : minutesFromHours(parsed),
        },
      }
    }))
  }

  const chooseCategory = (next: ActivityCategory) => {
    const typeId = typeCategory(data, selected.activity.activityTypeId) === next
      ? selected.activity.activityTypeId
      : firstKindId(next)
    patch({ activityTypeId: typeId })
  }

  const draftProblem = (draft: Draft) => {
    if (!draft.activity.date) return 'Choose the date you worked.'
    if (!data.placements.length) return 'Add a placement before logging hours.'
    if (!draft.activity.placementId) return 'Choose the placement these hours belong to.'
    if (!draft.activity.activityTypeId) return 'Choose a Direct, Indirect, or Supervision activity.'
    const hours = parseHours(draft.hours)
    if (hours === null) return 'Enter how many hours you worked, for example 1.5.'
    if (hours > 24) return 'A single entry cannot be longer than 24 hours.'
    return ''
  }

  const addAnother = () => {
    const copy: Draft = {
      key: uid(),
      hours: selected.hours,
      activity: { ...selected.activity, id: '', supervisorId: selectedPlacement?.supervisorId ?? selected.activity.supervisorId },
    }
    setDrafts(current => [...current, copy])
    setSelectedKey(copy.key)
    setError('')
    requestAnimationFrame(() => scrollerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  const dropDraft = (key: string) => {
    if (drafts.length === 1) return
    const next = drafts.filter(item => item.key !== key)
    setDrafts(next)
    if (selectedKey === key) setSelectedKey(next[0].key)
  }

  const submit = async () => {
    const invalid = drafts.find(item => draftProblem(item))
    if (invalid) {
      setSelectedKey(invalid.key)
      setError(draftProblem(invalid))
      return
    }
    setSaving(true)
    const entries = drafts.map(item => ({
      ...item.activity,
      durationMinutes: minutesFromHours(parseHours(item.hours)!),
      notes: item.activity.notes.trim(),
      supervisorId: placementOf(data.placements, item.activity.placementId)?.supervisorId || item.activity.supervisorId,
    }))
    const next = await save(entries)
    setSaving(false)
    if (next) setError(next)
  }

  return (
    <Dialog open onOpenChange={next => { if (!next && !saving) close() }}>
      <DialogContent
        showClose={false}
        className="flex w-[min(760px,100%)] max-h-[min(94vh,calc(100dvh-24px))] flex-col gap-0 overflow-hidden p-0 max-sm:overflow-hidden sm:max-w-[760px]"
        onPointerDownOutside={event => { if (saving) event.preventDefault() }}
        onEscapeKeyDown={event => { if (saving) event.preventDefault() }}
      >
        <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={e => { e.preventDefault(); void submit() }}>
          <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4 sm:p-5">
            <DialogHeader>
              <span className={kickerClass}>{editingSaved && !batch ? 'EDIT ENTRY' : batch ? 'NEW BATCH' : 'NEW ENTRY'}</span>
              <DialogTitle id="activity-title">{editingSaved && !batch ? 'Edit hours' : 'Log your hours'}</DialogTitle>
            </DialogHeader>
            <Button type="button" variant="ghost" size="icon" aria-label="Close" disabled={saving} onClick={close}><X/></Button>
          </div>
          <div ref={scrollerRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-5">
            {batch && (
              <Table
                aria-label="Entries to save"
                className="min-w-[420px] table-fixed"
                containerClassName="relative z-10 shrink-0 rounded-xl border bg-card"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[16%]">Date</TableHead>
                    <TableHead className="w-[12%]">Hours</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead className="hidden sm:table-cell">Placement</TableHead>
                    <TableHead className="hidden sm:table-cell">Notes</TableHead>
                    <TableHead className="w-10" aria-label="Remove"/>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map(draft => {
                    const on = draft.key === selectedKey
                    const pick = () => { setSelectedKey(draft.key); setError('') }
                    return <TableRow key={draft.key} className={cn('cursor-pointer', on && 'bg-accent')} aria-current={on ? 'true' : undefined} onClick={pick}>
                      <TableCell className="p-0"><button type="button" className="block w-full truncate p-2.5 text-left text-[11px] font-semibold" onClick={pick}>{dateLabel(draft.activity.date, { day: 'numeric', month: 'short' })}</button></TableCell>
                      <TableCell className="p-0"><button type="button" className="block w-full truncate p-2.5 text-left text-[11px] font-semibold" onClick={pick}>{draft.hours || '—'} h</button></TableCell>
                      <TableCell className="p-0"><button type="button" className="block w-full truncate p-2.5 text-left text-[11px] font-semibold" onClick={pick}>{typeName(data, draft.activity.activityTypeId)}</button></TableCell>
                      <TableCell className="hidden p-0 sm:table-cell"><button type="button" className="block w-full truncate p-2.5 text-left text-[11px] font-semibold" onClick={pick}>{placementName(data.placements, draft.activity.placementId, '—')}</button></TableCell>
                      <TableCell className="hidden p-0 sm:table-cell"><button type="button" className="block w-full truncate p-2.5 text-left text-[11px] font-semibold" onClick={pick}>{draft.activity.notes || '—'}</button></TableCell>
                      <TableCell className="p-1 text-center">{drafts.length > 1 && <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Remove this draft" onClick={event => { event.stopPropagation(); dropDraft(draft.key) }}><X size={15}/></Button>}</TableCell>
                    </TableRow>
                  })}
                </TableBody>
              </Table>
            )}
            <div className={cn(batch && 'relative rounded-xl border bg-muted/40 p-3 sm:p-4')}>
              {batch && <p className="mb-2.5 text-[11px] font-bold text-accent-foreground">Adjusting {dateLabel(selected.activity.date, { day: 'numeric', month: 'short' })} · {typeName(data, selected.activity.activityTypeId)}</p>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="activity-date">Date</Label>
                  <Input id="activity-date" type="date" aria-label="Date" value={selected.activity.date} onChange={e => patch({ date: e.target.value })}/>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="activity-hours">Hours</Label>
                  <Input id="activity-hours" aria-label="Hours" type="text" inputMode="decimal" value={selected.hours} onChange={e => patch({ hours: e.target.value })}/>
                  <small className="text-[11px] font-medium text-muted-foreground">Decimal hours, e.g. 1.5</small>
                </div>
                <div className="sm:col-span-2">
                  <span className="sr-only">Date shortcuts</span>
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" variant="outline" size="sm" className={cn('h-8 rounded-full', selected.activity.date === today() && 'border-primary bg-accent')} onClick={() => patch({ date: today() })}>Today</Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 rounded-full" onClick={() => patch({ date: shiftDate(selected.activity.date || today(), -1) })}>Previous day</Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 rounded-full" onClick={() => patch({ date: shiftDate(selected.activity.date || today(), 1) })}>Next day</Button>
                  </div>
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <span className={kickerClass}>Quick pick</span>
                  <div className="flex flex-wrap gap-1.5">{QUICK_HOURS.map(value => (
                    <Button type="button" key={value} variant="outline" size="sm" className={cn('h-8 rounded-full', parsedHours === value && 'border-primary bg-accent')} onClick={() => patch({ hours: String(value) })}>{value} h</Button>
                  ))}</div>
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="activity-placement">Placement</Label>
                  <NativeSelect id="activity-placement" aria-label="Placement" value={selected.activity.placementId} onChange={e => patch({ placementId: e.target.value, supervisorId: placementOf(data.placements, e.target.value)?.supervisorId ?? '' })}>
                    <option value="">{placements.length ? 'Choose a placement' : 'Add a placement first'}</option>
                    {placements.map(item => <option key={item.id} value={item.id}>{item.name}{item.site ? ` · ${item.site}` : ''}</option>)}
                  </NativeSelect>
                  {selectedPlacement?.supervisorId && <small className="text-[11px] font-medium text-muted-foreground">Supervisor: {itemName(data.dictionaries.supervisors, selectedPlacement.supervisorId)}</small>}
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <span className={kickerClass}>Activity type</span>
                  <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Activity type">
                    {CATEGORY_ORDER.map(next => {
                      const on = category === next
                      const meta = categoryMeta[next]
                      return <button type="button" key={next} role="radio" aria-checked={on} className={cn('flex min-w-0 flex-col items-start gap-0.5 rounded-xl border bg-card px-2 py-2.5 text-left transition-colors sm:px-2.5', on ? 'border-primary bg-accent ring-1 ring-primary' : 'border-input hover:bg-muted/50')} onClick={() => chooseCategory(next)}>
                        <i className="size-2.5 rounded-full" style={{ background: meta.color }}/>
                        <strong className="text-xs leading-tight">{meta.hoursLabel}</strong>
                        <small className="hidden text-[10px] leading-snug text-muted-foreground sm:block">{meta.hint}</small>
                      </button>
                    })}
                  </div>
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="activity-kind">{activitySelectLabel(category)}</Label>
                  <NativeSelect id="activity-kind" aria-label={activitySelectLabel(category)} value={selected.activity.activityTypeId} onChange={e => patch({ activityTypeId: e.target.value })}>
                    {kindOptions.map(kind => <option key={kind.id} value={kind.id}>{kind.name}</option>)}
                  </NativeSelect>
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="activity-notes">Notes</Label>
                  <Textarea id="activity-notes" aria-label="Notes" rows={batch ? 2 : 3} value={selected.activity.notes} onChange={e => patch({ notes: e.target.value })} placeholder="A short, useful note…"/>
                </div>
              </div>
            </div>
          </div>
          {error && <Alert variant="destructive" className="mx-4 mt-0 sm:mx-5">{error}{error.includes('placement') && <> <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={openPlacements}>Open Placement</Button></>}</Alert>}
          <DialogFooter className="mt-0 shrink-0 gap-2 p-4 sm:p-5">
            {editingSaved && !batch && <Button type="button" variant="ghost" className="text-destructive max-sm:w-full" disabled={saving} onClick={() => void remove(selected.activity.id).then(next => { if (next) setError(next) })}><Trash2 size={17}/> Delete</Button>}
            <Button type="button" variant="outline" className="max-sm:flex-1" disabled={saving} onClick={addAnother}><Plus size={16}/> Add another</Button>
            <span className="hidden flex-1 sm:block"/>
            <Button type="button" variant="outline" className="max-sm:flex-1" disabled={saving} onClick={close}>Cancel</Button>
            <Button className="max-sm:w-full" type="submit" disabled={saving}>{saving ? 'Saving…' : editingSaved && !batch ? 'Save changes' : drafts.length > 1 ? `Save ${drafts.length} entries` : 'Save entry'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default App
