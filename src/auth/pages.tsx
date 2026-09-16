import { useEffect, useState } from 'react'
import { KeyRound, LogOut, Mail, Trash2, UserCircle } from 'lucide-react'
import { functionErrorBody, GENERIC_AUTH_ERROR, GENERIC_INVITE_RESPONSE, passwordProblem } from './access'
import { invitationStatusLabel } from './invitations'
import { navigate, useAuth } from './AuthProvider'
import { getSupabase } from '../repository/supabase'
import { supabaseUrl, supabaseAnonKey } from '../config'
import { safeInternalPath } from './origin'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

const params = () => new URLSearchParams(window.location.search)

function AuthLayout({ title, copy, children }: { title: string, copy: string, children?: React.ReactNode }) {
  return (
    <div className="grid min-h-svh place-items-center bg-background p-6">
      <Card className="w-full max-w-[440px] p-7">
        <form className="flex flex-col gap-3" onSubmit={e => e.preventDefault()}>
          <div className="mb-1 flex items-center gap-2.5">
            <img className="size-[39px] rounded-xl object-cover" src="/favicon.svg" width={39} height={39} alt=""/>
            <strong className="font-serif text-lg">the Hours of Pee</strong>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">INVITATION ONLY</span>
          <h1 className="m-0 font-serif text-[32px] font-semibold leading-tight">{title}</h1>
          <p className="m-0 text-[13px] text-muted-foreground">{copy}</p>
          {children}
        </form>
      </Card>
    </div>
  )
}

export function AuthCallbackPage() {
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const url = new URL(window.location.href)
      const next = safeInternalPath(url.searchParams.get('next'), '/')
      const authError = url.searchParams.get('error_description') ?? url.searchParams.get('error')
      if (authError) {
        setError('This confirmation or reset link is invalid or expired.')
        return
      }
      try {
        const supabase = getSupabase()
        const code = url.searchParams.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(window.location.href)
          if (exchangeError && !cancelled) {
            setError('This confirmation or reset link is invalid or expired.')
            return
          }
        } else {
          await supabase.auth.getSession()
        }
        if (!cancelled) navigate(next)
      } catch {
        if (!cancelled) setError('This confirmation or reset link is invalid or expired.')
      }
    }
    void run()
    return () => { cancelled = true }
  }, [])
  if (error) {
    return <AuthLayout title="Link expired" copy={error}>
      <Button onClick={() => navigate('/login')}>Go to sign in</Button>
    </AuthLayout>
  }
  return <AuthLayout title="Signing you in" copy="Please wait while we finish confirming your account." />
}

export function LoginPage() {
  const { signIn, session, profile } = useAuth()
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('')
  useEffect(() => {
    if (session?.emailConfirmed && profile?.status === 'active') navigate('/')
  }, [session, profile])
  return <AuthLayout title="Sign in" copy="Use the email address you were invited with.">
    <div className="grid gap-1.5"><Label htmlFor="login-email">Email</Label><Input id="login-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}/></div>
    <div className="grid gap-1.5"><Label htmlFor="login-password">Password</Label><Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></div>
    {error && <Alert variant="destructive">{error}</Alert>}
    <Button onClick={async () => {
      const next = await signIn(email, password)
      if (next) setError(next)
      else navigate('/')
    }}>Sign in</Button>
    <div className="flex justify-between"><Button className="h-auto p-0 text-xs" variant="link" type="button" onClick={() => navigate('/forgot-password')}>Forgot password</Button></div>
  </AuthLayout>
}

export function InvitePage() {
  const email = params().get('email') ?? ''
  const token = params().get('token') ?? ''
  return <AuthLayout title="Accept invitation" copy="Create a password to activate this invitation. Confirm your email before signing in.">
    <p className="text-xs text-muted-foreground">{email || 'Open the invitation link from your email.'}</p>
    <Button disabled={!email || !token} onClick={() => navigate(`/register?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`)}>Continue to registration</Button>
  </AuthLayout>
}

export function RegisterPage() {
  const email = params().get('email') ?? ''
  const token = params().get('token') ?? ''
  const [password, setPassword] = useState(''); const [displayName, setDisplayName] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState('')
  const submit = async () => {
    setError(''); setMessage('')
    const response = await fetch(`${supabaseUrl}/functions/v1/register-with-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
      body: JSON.stringify({ email, password, token, displayName }),
    })
    const body = await response.json().catch(() => ({})) as { ok?: boolean, message?: string, reason?: string }
    if (!response.ok || !body.ok) {
      if (body.reason === 'expired') setError('This invitation has expired. Ask an administrator for a new invitation.')
      else setError(GENERIC_INVITE_RESPONSE)
    }
    else { setMessage(body.message ?? 'Check your email to confirm the account, then sign in.'); navigate('/confirm-email') }
  }
  return <AuthLayout title="Create your account" copy="Invitation-only registration. Never store identifying client details in this workspace.">
    <div className="grid gap-1.5"><Label htmlFor="register-email">Email</Label><Input id="register-email" value={email} readOnly/></div>
    <div className="grid gap-1.5"><Label htmlFor="register-name">Display name</Label><Input id="register-name" value={displayName} onChange={e => setDisplayName(e.target.value)}/></div>
    <div className="grid gap-1.5"><Label htmlFor="register-password">Password</Label><Input id="register-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></div>
    {error && <Alert variant="destructive">{error}</Alert>}
    {message && <p className="text-xs text-muted-foreground">{message}</p>}
    <Button onClick={() => void submit()}>Create account</Button>
  </AuthLayout>
}

export function ConfirmEmailPage() {
  return <AuthLayout title="Confirm your email" copy="Check your inbox, then return here to sign in.">
    <Button onClick={() => navigate('/login')}>Go to sign in</Button>
  </AuthLayout>
}

export function ForgotPasswordPage() {
  const { requestReset } = useAuth()
  const [email, setEmail] = useState(''); const [message, setMessage] = useState('')
  return <AuthLayout title="Reset password" copy="If an account exists for that address, a reset email will be sent.">
    <div className="grid gap-1.5"><Label htmlFor="forgot-email">Email</Label><Input id="forgot-email" type="email" value={email} onChange={e => setEmail(e.target.value)}/></div>
    {message && <p className="text-xs text-muted-foreground">{message}</p>}
    <Button onClick={async () => { await requestReset(email); setMessage('If an account exists, check your email.') }}>Send reset link</Button>
  </AuthLayout>
}

export function ResetPasswordPage() {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState(''); const [error, setError] = useState('')
  return <AuthLayout title="Choose a new password" copy="This device must have opened the reset link from your email.">
    <div className="grid gap-1.5"><Label htmlFor="reset-password">New password</Label><Input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></div>
    {error && <Alert variant="destructive">{error}</Alert>}
    <Button onClick={async () => { const next = await updatePassword(password); if (next) setError(next); else navigate('/login') }}>Update password</Button>
  </AuthLayout>
}

export function SetPasswordPage() {
  const { completeFirstPassword, session, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    const problem = passwordProblem(password, confirm)
    if (problem) { setError(problem); return }
    setError(''); setSaving(true)
    const next = await completeFirstPassword(password)
    setSaving(false)
    if (next) setError(next)
    else navigate('/')
  }
  return <AuthLayout title="Choose your password" copy="You signed in with a one-time password. Set your own password to finish setting up this account.">
    <p className="text-xs text-muted-foreground">{session?.email}</p>
    <div className="grid gap-1.5"><Label htmlFor="set-password">New password</Label><Input id="set-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></div>
    <div className="grid gap-1.5"><Label htmlFor="set-confirm">Confirm password</Label><Input id="set-confirm" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/></div>
    {error && <Alert variant="destructive">{error}</Alert>}
    <Button disabled={saving} onClick={() => void submit()}>{saving ? 'Saving…' : 'Save password and continue'}</Button>
    <div className="flex justify-between"><Button className="h-auto p-0 text-xs" variant="link" type="button" onClick={() => void signOut()}>Sign out</Button></div>
  </AuthLayout>
}

export function SuspendedPage() {
  const { signOut } = useAuth()
  return <AuthLayout title="Account suspended" copy="You do not have permission to access this page.">
    <p className="text-xs text-muted-foreground">This account cannot query or change application data. Contact an administrator.</p>
    <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
  </AuthLayout>
}

export function AuthErrorPage() {
  const { errorMessage, signOut } = useAuth()
  return <AuthLayout title="Unable to continue" copy={errorMessage ?? 'Unable to restore your session. Check your connection and try again.'}>
    <Button onClick={() => { void signOut(); navigate('/login') }}>Go to sign in</Button>
  </AuthLayout>
}

export function AccountPage() {
  const { session, profile, updatePassword, updateDisplayName, deleteAccount, signOut } = useAuth()
  const [name, setName] = useState(profile?.displayName ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { if (!message) return; const id = window.setTimeout(() => setMessage(''), 2600); return () => clearTimeout(id) }, [message])
  const changePassword = async () => {
    const problem = passwordProblem(password, confirm)
    if (problem) { setPasswordError(problem); return }
    setPasswordError('')
    const next = await updatePassword(password)
    if (next) { setPasswordError(next); return }
    setPassword(''); setConfirm(''); setMessage('Password updated')
  }
  return <section className="mx-auto max-w-[1420px] px-4 py-6 sm:px-6 sm:py-10 lg:px-[4.2vw] lg:pb-[70px]">
    <div className="page-heading mb-6 md:mb-8">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">YOUR ACCOUNT</span>
      <h1 className="mt-2 font-serif text-[clamp(1.75rem,4vw,3.375rem)] font-semibold leading-[0.95] tracking-tight">Account &amp; security</h1>
      <p className="mt-2.5 m-0 text-sm text-muted-foreground">Manage sign-in, password, and the private copy of your data.</p>
    </div>
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
      <Card className="min-h-[245px]">
        <CardHeader>
          <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground"><UserCircle/></div>
          <CardTitle className="mt-3">Profile</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">Signed in as {session?.email}{profile?.role === 'admin' ? ' · administrator' : ''}.</p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="account-name">Display name</Label><Input id="account-name" value={name} onChange={e => setName(e.target.value)}/></div>
          <div><Button size="sm" onClick={() => void updateDisplayName(name).then(() => setMessage('Name saved'))}>Save name</Button></div>
        </CardContent>
      </Card>
      <Card className="min-h-[245px]">
        <CardHeader>
          <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground"><KeyRound/></div>
          <CardTitle className="mt-3">Password</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">Use at least 8 characters. You stay signed in on this device after changing it.</p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="account-password">New password</Label><Input id="account-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></div>
          <div className="grid gap-1.5"><Label htmlFor="account-confirm">Confirm password</Label><Input id="account-confirm" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/></div>
          {passwordError && <Alert variant="destructive">{passwordError}</Alert>}
          <div><Button variant="outline" size="sm" disabled={!password} onClick={() => void changePassword()}>Change password</Button></div>
        </CardContent>
      </Card>
      <Card className="min-h-[245px]">
        <CardHeader>
          <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground"><LogOut/></div>
          <CardTitle className="mt-3">Session</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">Sign out of this browser. Your data stays in your private account.</p>
        </CardHeader>
        <CardContent><Button variant="outline" onClick={() => void signOut().then(() => navigate('/login'))}>Sign out</Button></CardContent>
      </Card>
      <Card className="min-h-[245px] border-destructive/30">
        <CardHeader>
          <div className="grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive"><Trash2/></div>
          <CardTitle className="mt-3">Delete account</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">Permanently delete your login and application rows. This cannot be undone.</p>
        </CardHeader>
        <CardContent><Button variant="destructive" onClick={async () => { if (prompt('Type DELETE to remove this account.') !== 'DELETE') return; await deleteAccount(); navigate('/login') }}>Delete my account</Button></CardContent>
      </Card>
    </div>
    {message && <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-xs text-primary-foreground shadow-lg" role="status">{message}</div>}
  </section>
}

type InvitationRow = {
  id: string
  email: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}

type PersonRow = { id: string, email: string, role: string, status: string, must_change_password: boolean }

const inviteStatus = (row: InvitationRow) =>
  invitationStatusLabel({ acceptedAt: row.accepted_at, revokedAt: row.revoked_at, expiresAt: row.expires_at })

export function AdminPage() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<PersonRow[]>([])
  const [invites, setInvites] = useState<InvitationRow[]>([])
  const load = async () => {
    const supabase = getSupabase()
    const { data: profiles } = await supabase.from('profiles').select('id, email, role, status, must_change_password').order('email')
    const { data: invitations } = await supabase.from('invitations').select('id, email, expires_at, accepted_at, revoked_at').order('created_at', { ascending: false })
    setUsers((profiles ?? []) as PersonRow[]); setInvites((invitations ?? []) as InvitationRow[]); setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const call = async (body: Record<string, unknown>, key: string) => {
    setBusy(key); setMessage(''); setFailed(false)
    const { data, error } = await getSupabase().functions.invoke('create-invite', { body })
    let result = data as { ok?: boolean, emailed?: boolean, message?: string } | null
    if (error) result = await functionErrorBody(error) ?? result
    setBusy('')
    if (error || !result?.ok) {
      setFailed(true)
      setMessage(result?.message ?? GENERIC_AUTH_ERROR)
    } else {
      setFailed(false)
      setMessage(result.message ?? 'Invitation sent.')
    }
    await load()
  }
  const invite = async (action: 'create' | 'replace', target: string, invitationId?: string) => {
    if (!target.includes('@')) { setFailed(true); setMessage('Enter a valid email address.'); return }
    await call({ email: target, action, invitationId }, `${action}:${invitationId ?? target}`)
    if (action === 'create') setEmail('')
  }
  const revoke = async (invitationId: string) => {
    if (!confirm('Revoke this invitation? The one-time password stops working.')) return
    await call({ action: 'revoke', invitationId }, `revoke:${invitationId}`)
  }
  const act = async (userId: string, action: string) => {
    if (action === 'delete' && !confirm('Delete this user and all of their data? This cannot be undone.')) return
    setBusy(`${action}:${userId}`)
    const { error } = await getSupabase().functions.invoke('admin-user', { body: { userId, action } })
    setBusy('')
    setFailed(Boolean(error))
    setMessage(error ? GENERIC_AUTH_ERROR : 'User updated.')
    await load()
  }
  return <section className="mx-auto max-w-[1420px] px-4 py-6 sm:px-6 sm:py-10 lg:px-[4.2vw] lg:pb-[70px]">
    <div className="page-heading mb-6 md:mb-8">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">ADMINISTRATION</span>
      <h1 className="mt-2 font-serif text-[clamp(1.75rem,4vw,3.375rem)] font-semibold leading-[0.95] tracking-tight">Users &amp; invitations</h1>
      <p className="mt-2.5 m-0 text-sm text-muted-foreground">Invite people by email. Each person only ever sees their own private data.</p>
    </div>
    <Card className="mb-3.5">
      <CardHeader>
        <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground"><Mail/></div>
        <CardTitle className="mt-3">Invite someone</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">We email a one-time password. On first sign-in they must choose their own password before the workspace opens.</p>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={e => { e.preventDefault(); void invite('create', email.trim().toLowerCase()) }}>
          <Label className="sr-only" htmlFor="invite-email">Email address to invite</Label>
          <Input id="invite-email" type="email" placeholder="person@example.com" value={email} onChange={e => setEmail(e.target.value)}/>
          <Button className="shrink-0" size="sm" type="submit" disabled={!email.trim() || busy.startsWith('create')}>{busy.startsWith('create') ? 'Sending…' : 'Send invitation'}</Button>
        </form>
        {message && <p className={failed ? 'mt-3 text-sm text-destructive' : 'mt-3 text-sm text-muted-foreground'} role="status">{message}</p>}
      </CardContent>
    </Card>
    <Card className="mb-3.5 overflow-hidden p-0">
      <CardHeader className="flex-row items-start justify-between space-y-0 p-5 pb-0">
        <div><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">ACCESS</span><CardTitle className="mt-1">People</CardTitle></div>
        <Badge variant="secondary">{users.length}</Badge>
      </CardHeader>
      {loading ? <p className="px-5 py-6 text-xs text-muted-foreground">Loading people…</p> : users.length ? <Table>
        <TableHeader>
          <TableRow><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Password</TableHead><TableHead/></TableRow>
        </TableHeader>
        <TableBody>{users.map(user => <TableRow key={user.id}>
          <TableCell>{user.email}{user.id === session?.userId && <small className="mt-0.5 block text-[9px] text-muted-foreground">You</small>}</TableCell>
          <TableCell>{user.role}</TableCell>
          <TableCell><Badge variant={user.status === 'active' ? 'secondary' : 'destructive'}>{user.status}</Badge></TableCell>
          <TableCell>{user.must_change_password ? 'One-time password' : 'Set by user'}</TableCell>
          <TableCell>
            {user.id === session?.userId ? <small>—</small> : <div className="flex flex-wrap gap-1.5">
              {user.status === 'active'
                ? <Button variant="outline" size="sm" disabled={busy === `suspend:${user.id}`} onClick={() => void act(user.id, 'suspend')}>Suspend</Button>
                : <Button variant="outline" size="sm" disabled={busy === `reactivate:${user.id}`} onClick={() => void act(user.id, 'reactivate')}>Reactivate</Button>}
              <Button variant="outline" size="sm" disabled={busy === `replace:${user.email}`} onClick={() => void invite('replace', user.email)}>Reset password</Button>
              <Button variant="ghost" size="sm" className="text-destructive" disabled={busy === `delete:${user.id}`} onClick={() => void act(user.id, 'delete')}>Delete</Button>
            </div>}
          </TableCell>
        </TableRow>)}</TableBody>
      </Table> : <p className="px-5 py-6 text-xs text-muted-foreground">No accounts yet.</p>}
    </Card>
    <Card className="overflow-hidden p-0">
      <CardHeader className="flex-row items-start justify-between space-y-0 p-5 pb-0">
        <div><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">AUDIT</span><CardTitle className="mt-1">Invitations</CardTitle></div>
        <Badge variant="secondary">{invites.length}</Badge>
      </CardHeader>
      {loading ? <p className="px-5 py-6 text-xs text-muted-foreground">Loading invitations…</p> : invites.length ? <Table>
        <TableHeader>
          <TableRow><TableHead>Email</TableHead><TableHead>Expires</TableHead><TableHead>Status</TableHead><TableHead/></TableRow>
        </TableHeader>
        <TableBody>{invites.map(row => <TableRow key={row.id}>
          <TableCell>{row.email}</TableCell>
          <TableCell>{new Date(row.expires_at).toLocaleString()}</TableCell>
          <TableCell>{inviteStatus(row)}</TableCell>
          <TableCell>{!row.accepted_at && !row.revoked_at && <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" disabled={busy === `replace:${row.id}`} onClick={() => void invite('replace', row.email, row.id)}>Resend</Button>
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy === `revoke:${row.id}`} onClick={() => void revoke(row.id)}>Revoke</Button>
          </div>}</TableCell>
        </TableRow>)}</TableBody>
      </Table> : <p className="px-5 py-6 text-xs text-muted-foreground">No invitations sent yet.</p>}
    </Card>
  </section>
}
