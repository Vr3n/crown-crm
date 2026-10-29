import { HashRouter } from 'react-router-dom'
import { AppRoutes } from './AppRoutes'
import { AuthGate } from './components/auth/AuthGate'
import { LicenseGate } from './features/license/components/license-gate'
import { SessionProvider } from './context/session-context'
import {
  useIdentityStatus,
  useIdentitySession,
  useLogout,
  useCommitSession
} from './lib/identity-queries'

function App(): React.JSX.Element {
  const statusQuery = useIdentityStatus()
  const authenticated = statusQuery.data === 'AUTHENTICATED'
  const sessionQuery = useIdentitySession(authenticated)
  const logout = useLogout()
  const commitSession = useCommitSession()

  const session = authenticated ? (sessionQuery.data ?? null) : null
  // Status and session are two round trips. While the session is in flight the
  // machine is already authenticated, so showing the login form here is a flash
  // of the wrong screen. Hold the boot splash until the session resolves.
  const bootPending = statusQuery.isPending || (authenticated && sessionQuery.isPending)

  if (session) {
    return (
      <LicenseGate>
        <SessionProvider value={session} onSignOut={() => void logout.mutate()}>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </SessionProvider>
      </LicenseGate>
    )
  }

  return (
    <LicenseGate>
      <AuthGate
        status={statusQuery.data}
        bootPending={bootPending}
        onAuthenticated={commitSession}
      />
    </LicenseGate>
  )
}

export default App
