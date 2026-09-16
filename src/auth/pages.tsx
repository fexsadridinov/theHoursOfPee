import { useEffect, useState } from 'react'
import { KeyRound, LogOut, Mail, Trash2, UserCircle } from 'lucide-react'
import { functionErrorBody, GENERIC_AUTH_ERROR, GENERIC_INVITE_RESPONSE, passwordProblem } from './access'
import { invitationStatusLabel } from './invitations'
import { navigate, useAuth } from './AuthProvider'
import { getSupabase } from '../repository/supabase'
import { supabaseUrl, supabaseAnonKey } from '../config'
import { safeInternalPath } from './origin'

const params = () => new URLSearchParams(window.location.search)

function AuthLayout({ title, copy, children }: { title: string, copy: string, children?: React.ReactNode }) {
  return <div className="auth-screen"><form className="auth-card" onSubmit={e => e.preventDefault()}>
    <div className="brand auth-brand"><img className="brand-mark" src="/favicon.svg" width={39} height={39} alt=""/><strong>the Hours of Pee</strong></div>
    <span className="kicker">INVITATION ONLY</span>
    <h1>{title}</h1>
    <p>{copy}</p>
    {children}
  </form></div>
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
      <button className="primary" onClick={() => navigate('/login')}>Go to sign in</button>
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
    <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}/></label>
    <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label>
    {error && <p className="auth-error">{error}</p>}
    <button className="primary" onClick={async () => {
      const next = await signIn(email, password)
      if (next) setError(next)
      else navigate('/')
    }}>Sign in</button>
    <div className="auth-links"><button className="text-button" type="button" onClick={() => navigate('/forgot-password')}>Forgot password</button></div>
  </AuthLayout>
}

export function InvitePage() {
  const email = params().get('email') ?? ''
  const token = params().get('token') ?? ''
  return <AuthLayout title="Accept invitation" copy="Create a password to activate this invitation. Confirm your email before signing in.">
    <p className="auth-note">{email || 'Open the invitation link from your email.'}</p>
    <button className="primary" disabled={!email || !token} onClick={() => navigate(`/register?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`)}>Continue to registration</button>
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
    <label>Email<input value={email} readOnly/></label>
    <label>Display name<input value={displayName} onChange={e => setDisplayName(e.target.value)}/></label>
    <label>Password<input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></label>
    {error && <p className="auth-error">{error}</p>}
    {message && <p className="auth-note">{message}</p>}
    <button className="primary" onClick={() => void submit()}>Create account</button>
  </AuthLayout>
}

export function ConfirmEmailPage() {
  return <AuthLayout title="Confirm your email" copy="Check your inbox, then return here to sign in.">
    <button className="primary" onClick={() => navigate('/login')}>Go to sign in</button>
  </AuthLayout>
}

export function ForgotPasswordPage() {
  const { requestReset } = useAuth()
  const [email, setEmail] = useState(''); const [message, setMessage] = useState('')
  return <AuthLayout title="Reset password" copy="If an account exists for that address, a reset email will be sent.">
    <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)}/></label>
    {message && <p className="auth-note">{message}</p>}
    <button className="primary" onClick={async () => { await requestReset(email); setMessage('If an account exists, check your email.') }}>Send reset link</button>
  </AuthLayout>
}

export function ResetPasswordPage() {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState(''); const [error, setError] = useState('')
  return <AuthLayout title="Choose a new password" copy="This device must have opened the reset link from your email.">
    <label>New password<input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></label>
    {error && <p className="auth-error">{error}</p>}
    <button className="primary" onClick={async () => { const next = await updatePassword(password); if (next) setError(next); else navigate('/login') }}>Update password</button>
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
    <p className="auth-note">{session?.email}</p>
    <label>New password<input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></label>
    <label>Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/></label>
    {error && <p className="auth-error">{error}</p>}
    <button className="primary" disabled={saving} onClick={() => void submit()}>{saving ? 'Saving…' : 'Save password and continue'}</button>
    <div className="auth-links"><button className="text-button" type="button" onClick={() => void signOut()}>Sign out</button></div>
  </AuthLayout>
}

export function SuspendedPage() {
  const { signOut } = useAuth()
  return <AuthLayout title="Account suspended" copy="You do not have permission to access this page.">
    <p className="auth-note">This account cannot query or change application data. Contact an administrator.</p>
    <button className="secondary" onClick={() => void signOut()}>Sign out</button>
  </AuthLayout>
}

export function AuthErrorPage() {
  const { errorMessage, signOut } = useAuth()
  return <AuthLayout title="Unable to continue" copy={errorMessage ?? 'Unable to restore your session. Check your connection and try again.'}>
    <button className="primary" onClick={() => { void signOut(); navigate('/login') }}>Go to sign in</button>
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
  return <section className="page">
    <div className="page-heading"><div><span className="kicker">YOUR ACCOUNT</span><h1>Account &amp; security</h1><p>Manage sign-in, password, and the private copy of your data.</p></div></div>
    <div className="settings-grid">
      <article className="panel settings-card">
        <div className="settings-icon"><UserCircle/></div>
        <h2>Profile</h2>
        <p>Signed in as {session?.email}{profile?.role === 'admin' ? ' · administrator' : ''}.</p>
        <label className="stacked-field">Display name<input value={name} onChange={e => setName(e.target.value)}/></label>
        <div className="button-row"><button className="primary compact" onClick={() => void updateDisplayName(name).then(() => setMessage('Name saved'))}>Save name</button></div>
      </article>
      <article className="panel settings-card">
        <div className="settings-icon"><KeyRound/></div>
        <h2>Password</h2>
        <p>Use at least 8 characters. You stay signed in on this device after changing it.</p>
        <label className="stacked-field">New password<input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></label>
        <label className="stacked-field">Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/></label>
        {passwordError && <p className="auth-error">{passwordError}</p>}
        <div className="button-row"><button className="secondary compact" disabled={!password} onClick={() => void changePassword()}>Change password</button></div>
      </article>
      <article className="panel settings-card">
        <div className="settings-icon"><LogOut/></div>
        <h2>Session</h2>
        <p>Sign out of this browser. Your data stays in your private account.</p>
        <div className="button-row"><button className="secondary" onClick={() => void signOut().then(() => navigate('/login'))}>Sign out</button></div>
      </article>
      <article className="panel settings-card danger-card">
        <div className="settings-icon"><Trash2/></div>
        <h2>Delete account</h2>
        <p>Permanently delete your login and application rows. This cannot be undone.</p>
        <div className="button-row"><button className="danger" onClick={async () => { if (prompt('Type DELETE to remove this account.') !== 'DELETE') return; await deleteAccount(); navigate('/login') }}>Delete my account</button></div>
      </article>
    </div>
    {message && <div className="toast" role="status">{message}</div>}
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
    // supabase-js drops the body on non-2xx replies, and the function explains what an admin must fix.
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
  return <section className="page">
    <div className="page-heading"><div><span className="kicker">ADMINISTRATION</span><h1>Users &amp; invitations</h1><p>Invite people by email. Each person only ever sees their own private data.</p></div></div>
    <article className="panel settings-card admin-invite">
      <div className="settings-icon"><Mail/></div>
      <h2>Invite someone</h2>
      <p>We email a one-time password. On first sign-in they must choose their own password before the workspace opens.</p>
      <form className="dict-add" onSubmit={e => { e.preventDefault(); void invite('create', email.trim().toLowerCase()) }}>
        <label className="sr-only" htmlFor="invite-email">Email address to invite</label>
        <input id="invite-email" type="email" placeholder="person@example.com" value={email} onChange={e => setEmail(e.target.value)}/>
        <button className="primary compact" type="submit" disabled={!email.trim() || busy.startsWith('create')}>{busy.startsWith('create') ? 'Sending…' : 'Send invitation'}</button>
      </form>
      {message && <p className={failed ? 'auth-error' : 'auth-note'} role="status">{message}</p>}
    </article>
    <article className="panel table-panel">
      <div className="panel-head"><div><span className="kicker">ACCESS</span><h2>People</h2></div><span className="count-badge">{users.length}</span></div>
      {loading ? <div className="empty-mini">Loading people…</div> : users.length ? <div className="table-scroll"><table>
        <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Password</th><th/></tr></thead>
        <tbody>{users.map(user => <tr key={user.id}>
          <td>{user.email}{user.id === session?.userId && <small>You</small>}</td>
          <td>{user.role}</td>
          <td><span className={`status ${user.status === 'active' ? 'confirmed' : 'rejected'}`}><i/>{user.status}</span></td>
          <td>{user.must_change_password ? 'One-time password' : 'Set by user'}</td>
          <td className="button-row">
            {user.id === session?.userId ? <small>—</small> : <>
              {user.status === 'active'
                ? <button className="secondary compact" disabled={busy === `suspend:${user.id}`} onClick={() => void act(user.id, 'suspend')}>Suspend</button>
                : <button className="secondary compact" disabled={busy === `reactivate:${user.id}`} onClick={() => void act(user.id, 'reactivate')}>Reactivate</button>}
              <button className="secondary compact" disabled={busy === `replace:${user.email}`} onClick={() => void invite('replace', user.email)}>Reset password</button>
              <button className="danger-text" disabled={busy === `delete:${user.id}`} onClick={() => void act(user.id, 'delete')}>Delete</button>
            </>}
          </td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-mini">No accounts yet.</div>}
    </article>
    <article className="panel table-panel">
      <div className="panel-head"><div><span className="kicker">AUDIT</span><h2>Invitations</h2></div><span className="count-badge">{invites.length}</span></div>
      {loading ? <div className="empty-mini">Loading invitations…</div> : invites.length ? <div className="table-scroll"><table>
        <thead><tr><th>Email</th><th>Expires</th><th>Status</th><th/></tr></thead>
        <tbody>{invites.map(row => <tr key={row.id}>
          <td>{row.email}</td>
          <td>{new Date(row.expires_at).toLocaleString()}</td>
          <td>{inviteStatus(row)}</td>
          <td className="button-row">{!row.accepted_at && !row.revoked_at && <>
            <button className="secondary compact" disabled={busy === `replace:${row.id}`} onClick={() => void invite('replace', row.email, row.id)}>Resend</button>
            <button className="danger-text" disabled={busy === `revoke:${row.id}`} onClick={() => void revoke(row.id)}>Revoke</button>
          </>}</td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-mini">No invitations sent yet.</div>}
    </article>
  </section>
}
