import App from './App'
import { decideRoute } from './auth/access'
import { AuthProvider, navigate, useAuth, usePath } from './auth/AuthProvider'
import { AuthCallbackPage, AuthErrorPage, ConfirmEmailPage, ForgotPasswordPage, InvitePage, LoginPage, RegisterPage, ResetPasswordPage, SetPasswordPage, SuspendedPage } from './auth/pages'
import { WorkspaceProvider } from './workspace/WorkspaceProvider'

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
  if (decision === 'password') return <SetPasswordPage />
  if (decision === 'forbidden') return <div className="auth-screen"><div className="auth-card"><h1>Not allowed</h1><p>You do not have permission to access this page.</p><button className="primary" onClick={() => navigate('/')}>Back to dashboard</button></div></div>
  return <WorkspaceProvider>
    <App section={decision === 'admin' ? 'admin' : decision === 'account' ? 'account' : undefined} />
  </WorkspaceProvider>
}

export default function Root() {
  return <AuthProvider><Gate /></AuthProvider>
}
