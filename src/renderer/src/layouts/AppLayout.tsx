import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { CommandMenu } from '@/components/layout/command-menu'
import { TooltipProvider } from '@/components/ui/tooltip'

/**
 * The authenticated application shell: fixed rail, thin top bar, scrollable
 * content column (CSS Crème dashboard-shell anatomy). Every routed page renders
 * inside <Outlet/>.
 */
export function AppLayout(): React.JSX.Element {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenSearch={() => setSearchOpen(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
        <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </TooltipProvider>
  )
}
