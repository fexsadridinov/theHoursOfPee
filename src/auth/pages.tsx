import { useEffect, useState } from 'react'
import { GENERIC_AUTH_ERROR, GENERIC_INVITE_RESPONSE } from './access'
import { navigate, useAuth } from './AuthProvider'
import { getSupabase } from '../repository/supabase'
import { supabaseUrl, supabaseAnonKey } from '../config'

const params = () => new URLSearchParams(window.location.search)

function AuthLayout({ title, copy, children }: { title: string, copy: string, children: React.ReactNode }) {
  return <div className="auth-screen"><form className="auth-card" onSubmit={e => e.preventDefault()}>
    <div className="brand auth-brand"><div className="brand-mark">HP</div><strong>the Hours of Pee</strong></div>
    <span className="kicker">INVITATION ONLY</span>
    <h1>{title}</h1>
    <p>{copy}</p>
    {children}
  </form></div>
}

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('')
  return <AuthLayout title="Sign in" copy="Use the email address you were invited with.">
    <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}/></label>
    <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label>
    {error && <p className="auth-error">{error}</p>}
    <button className="primary" onClick={async () => setError(await signIn(email, password) ?? '')}>Sign in</button>
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
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body.ok) setError(GENERIC_INVITE_RESPONSE)
    else { setMessage(body.message); navigate('/confirm-email') }
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

export function SuspendedPage() {
  const { signOut } = useAuth()
  return <AuthLayout title="Account suspended" copy="This account cannot access application data. Contact an administrator.">
    <button className="secondary" onClick={() => void signOut()}>Sign out</button>
  </AuthLayout>
}

export function AccountPage() {
  const { session, profile, updatePassword, updateDisplayName, deleteAccount, signOut } = useAuth()
  const [name, setName] = useState(profile?.displayName ?? '')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  return <section className="page"><div className="page-heading"><div><span className="kicker">YOUR ACCOUNT</span><h1>Account & security</h1><p>Manage sign-in, password, and the private copy of your data.</p></div></div>
    <div className="settings-grid">
      <article className="panel settings-card"><h2>Profile</h2><p>{session?.email}</p><label>Display name<input value={name} onChange={e => setName(e.target.value)}/></label><button className="primary compact" onClick={() => void updateDisplayName(name).then(() => setMessage('Name saved'))}>Save name</button></article>
      <article className="panel settings-card"><h2>Password</h2><label>New password<input type="password" value={password} onChange={e => setPassword(e.target.value)}/></label><button className="secondary compact" onClick={async () => setMessage(await updatePassword(password) ?? 'Password updated')}>Change password</button></article>
      <article className="panel settings-card"><h2>Session</h2><p>Sign out of this browser. Your data stays in your private account.</p><button className="secondary" onClick={() => void signOut().then(() => navigate('/login'))}>Sign out</button></article>
      <article className="panel settings-card danger-card"><h2>Delete account</h2><p>Permanently delete your login and application rows. Type DELETE to confirm.</p><button className="danger" onClick={async () => { if (prompt('Type DELETE to remove this account.') !== 'DELETE') return; await deleteAccount(); navigate('/login') }}>Delete my account</button></article>
    </div>
    {message && <div className="toast">{message}</div>}
  </section>
}

export function AdminPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [users, setUsers] = useState<{ id: string, email: string, role: string, status: string }[]>([])
  const [invites, setInvites] = useState<{ email: string, expires_at: string, accepted_at: string | null }[]>([])
  const load = async () => {
    const supabase = getSupabase()
    const { data: profiles } = await supabase.from('profiles').select('id, email, role, status')
    const { data: invitations } = await supabase.from('invitations').select('email, expires_at, accepted_at').order('created_at', { ascending: false })
    setUsers(profiles ?? []); setInvites(invitations ?? [])
  }
  useEffect(() => { void load() }, [])
  const invite = async () => {
    const { data, error } = await getSupabase().functions.invoke('create-invite', { body: { email } })
    setMessage(error ? GENERIC_AUTH_ERROR : (data?.message ?? 'If that address can be invited, an email was sent.'))
    setEmail(''); void load()
  }
  const act = async (userId: string, action: string) => {
    if (action === 'delete' && !confirm('Delete this user and their data?')) return
    await getSupabase().functions.invoke('admin-user', { body: { userId, action } })
    void load()
  }
  return <section className="page"><div className="page-heading"><div><span className="kicker">ADMINISTRATION</span><h1>Users & invitations</h1><p>Invite people by email. Members only see their own private data.</p></div></div>
    <article className="panel settings-card"><h2>Send invitation</h2><div className="dict-add"><input type="email" placeholder="person@example.com" value={email} onChange={e => setEmail(e.target.value)}/><button className="primary compact" onClick={() => void invite()}>Invite</button></div>{message && <p className="auth-note">{message}</p>}</article>
    <article className="panel table-panel"><div className="panel-head"><h2>People</h2></div><div className="table-scroll"><table><thead><tr><th>Email</th><th>Role</th><th>Status</th><th/></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.email}</td><td>{user.role}</td><td>{user.status}</td><td className="button-row">{user.status === 'active' ? <button className="secondary compact" onClick={() => void act(user.id, 'suspend')}>Suspend</button> : <button className="secondary compact" onClick={() => void act(user.id, 'reactivate')}>Reactivate</button>}<button className="danger-text" onClick={() => void act(user.id, 'delete')}>Delete</button></td></tr>)}</tbody></table></div></article>
    <article className="panel table-panel"><div className="panel-head"><h2>Invitations</h2></div><div className="table-scroll"><table><thead><tr><th>Email</th><th>Expires</th><th>Accepted</th></tr></thead><tbody>{invites.map(invite => <tr key={invite.email + invite.expires_at}><td>{invite.email}</td><td>{new Date(invite.expires_at).toLocaleString()}</td><td>{invite.accepted_at ? 'Yes' : 'Pending'}</td></tr>)}</tbody></table></div></article>
  </section>
}
