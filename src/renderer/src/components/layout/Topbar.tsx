import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Search, Sun, Moon, LogOut, UserRound, Command, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/context/session-context'
import { useTheme } from '@/lib/theme'
import { NAV_GROUPS } from '@/lib/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { initials } from '@/lib/validation'

function currentTitle(pathname: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.to === pathname) return item.label
    }
  }
  return 'Dashboard'
}

export function Topbar({ onOpenSearch }: { onOpenSearch: () => void }): React.JSX.Element {
  const location = useLocation()
  const session = useSession()
  const { theme, setTheme } = useTheme()
  const [signOutOpen, setSignOutOpen] = useState(false)

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      {/* Mobile brand mark — visible only when sidebar is hidden */}
      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Crown className="size-4" />
        </div>
        <span className="truncate font-heading text-sm font-semibold tracking-tight">
          {session.organizationName}
        </span>
      </div>

      <h1 className="hidden shrink-0 font-heading text-base font-semibold tracking-tight lg:block">
        {currentTitle(location.pathname)}
      </h1>

      <button
        type="button"
        onClick={onOpenSearch}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-left">Search people, invoices…</span>
        <kbd className="flex items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          <Command className="size-2.5" />K
        </kbd>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-accent"
              aria-label="Account menu"
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/10 font-heading text-sm font-semibold text-primary">
                  {initials(session.userFullName)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="truncate text-sm font-medium">{session.userFullName}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {session.roleName} · {session.organizationName}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <UserRound className="size-4" />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setSignOutOpen(true)}
              className={cn('text-destructive focus:text-destructive')}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <div className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <LogOut className="size-5" />
          </div>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">
              Sign out of {session.organizationName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You will need to log back in to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/20"
              onClick={() => void session.onSignOut()}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}
