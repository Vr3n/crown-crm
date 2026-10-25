import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Search, Sun, Moon, LogOut, UserRound, Command } from 'lucide-react'
import { useSession } from '@/context/session-context'
import { useTheme } from '@/lib/theme'
import { titleForPath } from '@/lib/navigation'
import { GlobalSearch } from '@/features/search/components/global-search'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
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

function financialYearLabel(date = new Date()): string {
  const year = date.getFullYear()
  const month = date.getMonth()
  const start = month >= 3 ? year : year - 1
  return `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

export function Topbar(): React.JSX.Element {
  const location = useLocation()
  const session = useSession()
  const { theme, setTheme } = useTheme()
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const isMac = /Mac/i.test(navigator.userAgent)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-5">
      <h1 className="shrink-0 text-[1rem] font-semibold tracking-tight">
        {titleForPath(location.pathname)}
      </h1>

      <span className="hidden shrink-0 border-l border-border pl-3 text-[0.75rem] uppercase tracking-[0.12em] text-muted-foreground sm:inline">
        {financialYearLabel()}
      </span>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Search parties, items, vouchers and accounts"
        aria-haspopup="dialog"
        aria-expanded={searchOpen}
        className="ml-4 flex h-8 min-w-0 flex-1 items-center gap-2 border border-border bg-background px-2.5 text-[0.875rem] text-muted-foreground transition-colors hover:border-rule-strong hover:text-foreground"
      >
        <Search className="size-3.5" strokeWidth={1.75} />
        <span className="flex-1 truncate text-left">Search parties, items, vouchers</span>
        <kbd className="hidden items-center gap-0.5 border border-border bg-muted px-1 py-0.5 font-mono text-[0.6875rem] sm:flex">
          {isMac ? <Command className="size-2.5" /> : 'Ctrl'}+K
        </kbd>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          className="size-8"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? (
            <Sun className="size-4" strokeWidth={1.75} />
          ) : (
            <Moon className="size-4" strokeWidth={1.75} />
          )}
        </Button>

        <span className="mx-1 h-5 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 px-1 py-1 transition-colors hover:bg-accent"
              aria-label="Account menu"
            >
              <span className="flex size-7 items-center justify-center bg-accent-soft text-[0.75rem] font-semibold text-primary">
                {initials(session.userFullName)}
              </span>
              <span className="hidden text-left md:block">
                <span className="block text-[0.875rem] font-medium leading-tight">
                  {session.userFullName}
                </span>
                <span className="block text-[0.6875rem] leading-tight text-muted-foreground">
                  {session.roleName}
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="truncate text-sm font-medium">{session.userFullName}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {session.roleName} · {session.companyName}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <UserRound className="size-4" />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setSignOutOpen(true)}>
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg">
              Sign out of {session.companyName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You will need to sign in again to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="ghost" onClick={() => void session.onSignOut()}>
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}
