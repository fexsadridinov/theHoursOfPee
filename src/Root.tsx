import App from './App'
import { decideRoute } from './auth/access'
import { AuthProvider, navigate, useAuth, usePath } from './auth/AuthProvider'
import { AccountPage, AdminPage, AuthCallbackPage, AuthErrorPage, ConfirmEmailPage, ForgotPasswordPage, InvitePage, LoginPage, RegisterPage, ResetPasswordPage, SuspendedPage } from './auth/pages'
import { useWorkspace, WorkspaceProvider } from './workspace/WorkspaceProvider'
import { entityCounts } from './migration'

function SaveBanner() {
  const { status, retry, kind } = useWorkspace()
  if (kind === 'local') return null
  if (status === 'saved') return <div className="sync-banner saved">Online and saved</div>
  if (status === 'saving') return <div className="sync-banner">Saving…</div>
  if (status === 'offline') return <div className="sync-banner warn">Your changes could not be saved. Check your connection and try again.</div>
  if (status === 'expired') return <div className="sync-banner warn">Your session expired. Please sign in again. <button className="text-button" onClick={() => navigate('/login')}>Sign in</button></div>
  return <div className="sync-banner warn">Your changes could not be saved. Check your connection and try again. <button className="text-button" onClick={retry}>Retry</button></div>
}

function MigrationModal() {
  const { migration, resolveMigration } = useWorkspace()
  if (!migration) return null
  const counts = entityCounts(migration.local)
  return <div className="modal-layer"><div className="modal" role="dialog" aria-labelledby="migrate-title">
    <h2 id="migrate-title">Upload local data?</h2>
    <p>This browser has a local workspace. Upload adds missing records only and never overwrites remote rows.</p>
    <ul className="migrate-counts">
      <li>Activities: {counts.activities}</li>
      <li>Experiences: {counts.experiences}</li>
      <li>Supervisors: {counts.supervisors}</li>
      <li>Clients (anonymous labels): {counts.clients}</li>
      <li>Activity types: {counts.activityTypes}</li>
      <li>Recurrence series: {counts.recurrenceSeries}</li>
      <li>Requirements: {counts.requirements}</li>
    </ul>
    <div className="modal-actions">
      <button className="primary" onClick={() => void resolveMigration('upload')}>Upload local data</button>
      <button className="secondary" onClick={() => void resolveMigration('keep')}>Keep local data only</button>
      <button className="danger-text" onClick={() => void resolveMigration('cancel')}>Cancel</button>
    </div>
  </div></div>
}

function Shell() {
  return <>
    <SaveBanner />
    <MigrationModal />
    <App />
  </>
}

function Gate() {
  const path = usePath()
  const { remote, loading, status, session, profile } = useAuth()
  if (loading || status === 'loading') return <div className="auth-screen"><div className="auth-card"><p>Restoring your session…</p></div></div>
  if (status === 'error') return <AuthErrorPage />
  const pathname = path.split('?')[0]
  if (pathname === '/auth/callback' || pathname === '/auth/confirm') return <AuthCallbackPage />
  const decision = decideRoute(path, session, profile, remote)
  if (decision === 'login') return <LoginPage />
  if (decision === 'public') {
    if (pathname === '/invite') return <InvitePage />
    if (pathname === '/register') return <RegisterPage />
    if (pathname === '/confirm-email') return <ConfirmEmailPage />
    if (pathname === '/forgot-password') return <ForgotPasswordPage />
    if (pathname === '/reset-password' || pathname === '/auth/reset-password') return <ResetPasswordPage />
    return <LoginPage />
  }
  if (decision === 'confirm') return <ConfirmEmailPage />
  if (decision === 'suspended' || status === 'suspended') return <SuspendedPage />
  if (decision === 'forbidden') return <div className="auth-screen"><div className="auth-card"><h1>Not allowed</h1><p>You do not have permission to access this page.</p><button className="primary" onClick={() => navigate('/')}>Back</button></div></div>
  return <WorkspaceProvider>
    {decision === 'admin' ? <><SaveBanner /><AdminPage /></> : decision === 'account' ? <><SaveBanner /><AccountPage /></> : <Shell />}
  </WorkspaceProvider>
}

export default function Root() {
  return <AuthProvider><Gate /></AuthProvider>
}
