import App from './App'
import { decideRoute } from './auth/access'
import { AuthProvider, navigate, useAuth, usePath } from './auth/AuthProvider'
import { AuthCallbackPage, AuthErrorPage, ConfirmEmailPage, ForgotPasswordPage, InvitePage, LoginPage, RegisterPage, ResetPasswordPage, SetPasswordPage, SuspendedPage } from './auth/pages'
import { WorkspaceProvider } from './workspace/WorkspaceProvider'
import { Button } from './components/ui/button'
import { Card } from './components/ui/card'

function Gate() {
  const path = usePath()
  const { remote, loading, status, session, profile } = useAuth()
  if (loading || status === 'loading') {
    return (
      <div className="grid min-h-svh place-items-center p-6">
        <Card className="w-full max-w-md p-8">
          <p className="text-sm text-muted-foreground">Restoring your session…</p>
        </Card>
      </div>
    )
  }
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
  if (decision === 'forbidden') {
    return (
      <div className="grid min-h-svh place-items-center p-6">
        <Card className="flex w-full max-w-md flex-col gap-3 p-8">
          <h1 className="font-serif text-2xl font-semibold">Not allowed</h1>
          <p className="text-sm text-muted-foreground">You do not have permission to access this page.</p>
          <Button onClick={() => navigate('/')}>Back to dashboard</Button>
        </Card>
      </div>
    )
  }
  return <WorkspaceProvider>
    <App section={decision === 'admin' ? 'admin' : decision === 'account' ? 'account' : undefined} />
  </WorkspaceProvider>
}

export default function Root() {
  return <AuthProvider><Gate /></AuthProvider>
}
