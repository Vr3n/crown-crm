import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { TooltipProvider } from '@/components/ui/tooltip'

function OnboardingGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const location = useLocation()
  const profile = useQuery({
    queryKey: ['company', 'profile'],
    queryFn: () => window.api.identity.company(),
    staleTime: 30_000
  })

  if (profile.data && !profile.data.numberingSetupAt) {
    return <Navigate to="/setup/numbering" replace />
  }
  if (
    profile.data?.numberingSetupAt &&
    !profile.data.onboardingCompletedAt &&
    location.pathname === '/'
  ) {
    return <Navigate to="/setup/tour" replace />
  }
  return <>{children}</>
}

/**
 * The authenticated shell: an ink navigation rail, a thin top bar, and a
 * scrollable content column. Pages animate in gently on route change.
 */
export function AppLayout(): React.JSX.Element {
  const location = useLocation()
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div key={location.pathname} className="page-in">
              <OnboardingGate>
                <Outlet />
              </OnboardingGate>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
