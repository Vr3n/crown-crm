import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ArrowDown, ArrowUp, BookOpen, ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/validation'
import { can, useSession } from '@/context/session-context'
import { visibleGroups, type NavItem } from '@/lib/navigation'
import { scrollEdge } from '@/lib/scroll-edge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const SIDEBAR_KEY = 'crownbooks:sidebar-collapsed'

/**
 * Primary navigation rail. Collapses to an icon strip. Groups carry the
 * workflow labels; items are permission gated. No decorative badges.
 */
export function Sidebar(): React.JSX.Element {
  const session = useSession()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SIDEBAR_KEY) === 'true'
  })
  const [scroll, setScroll] = useState({ canScroll: false, atBottom: false })

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_KEY, String(collapsed))
  }, [collapsed])

  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return

    const update = (): void => {
      setScroll(
        scrollEdge({
          scrollTop: main.scrollTop,
          scrollHeight: main.scrollHeight,
          clientHeight: main.clientHeight
        })
      )
    }

    update()
    main.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    observer?.observe(main)

    return () => {
      main.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [location.pathname])

  function scrollToEdge(): void {
    const main = document.querySelector('main')
    if (!main) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    main.scrollTo({
      top: scroll.atBottom ? 0 : main.scrollHeight,
      behavior: reduce ? 'auto' : 'smooth'
    })
  }

  const groups = visibleGroups(session.permissions, session.isSuper, can)

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-[64px]' : 'w-[216px]'
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center border-b border-sidebar-border',
          collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center bg-stamp text-paper">
          <BookOpen className="size-4" strokeWidth={1.75} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[0.9375rem] font-semibold leading-tight tracking-tight">
              Crown Books
            </div>
            <div className="truncate text-[0.75rem] leading-tight text-sidebar-foreground/55">
              {session.companyName}
            </div>
          </div>
        )}
      </div>

      <nav className="no-scrollbar min-h-0 flex-1 overflow-y-auto py-3">
        {groups.map((group, index) => (
          <div key={group.id} className={cn(index > 0 && 'mt-4')}>
            {!collapsed && group.label ? (
              <p className="px-4 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/50">
                {group.label}
              </p>
            ) : null}
            <ul>
              {group.items.map((item) => (
                <SidebarItem key={item.to} item={item} collapsed={collapsed} />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {scroll.canScroll ? (
        <div className="px-2 pb-1">
          <button
            type="button"
            onClick={scrollToEdge}
            aria-label={scroll.atBottom ? 'Scroll to top' : 'Scroll to bottom'}
            title={scroll.atBottom ? 'Back to top' : 'Scroll to bottom'}
            className={cn(
              'flex w-full items-center gap-2 border border-sidebar-border bg-sidebar-accent/60 px-2 py-1.5 text-[0.75rem] text-sidebar-foreground/70 transition-colors hover:border-sidebar-ring hover:text-sidebar-foreground',
              collapsed && 'justify-center px-0'
            )}
          >
            {scroll.atBottom ? (
              <ArrowUp className="size-3.5" strokeWidth={1.75} />
            ) : (
              <ArrowDown className="size-3.5" strokeWidth={1.75} />
            )}
            {!collapsed ? (
              <span>{scroll.atBottom ? 'Back to top' : 'Scroll to bottom'}</span>
            ) : null}
          </button>
        </div>
      ) : null}

      <div className="border-t border-sidebar-border p-2">
        <div
          className={cn('flex items-center gap-2.5 px-2 py-2', collapsed && 'justify-center px-0')}
        >
          <div className="flex size-8 shrink-0 items-center justify-center bg-accent-soft text-[0.75rem] font-semibold text-primary">
            {initials(session.userFullName)}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9375rem] font-medium leading-tight">
                {session.userFullName}
              </p>
              <p className="truncate text-[0.75rem] leading-tight text-sidebar-foreground/55">
                {session.roleName}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={session.onSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="text-sidebar-foreground/55 transition-colors hover:text-destructive"
            >
              <LogOut className="size-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
        <button
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'mt-1 flex w-full items-center gap-2 px-2 py-1.5 text-[0.75rem] text-sidebar-foreground/55 transition-colors hover:text-sidebar-foreground',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? (
            <ChevronsRight className="size-4" strokeWidth={1.75} />
          ) : (
            <>
              <ChevronsLeft className="size-4" strokeWidth={1.75} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}

function SidebarItem({
  item,
  collapsed
}: {
  item: NavItem
  collapsed: boolean
}): React.JSX.Element {
  const Icon = item.icon
  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'relative flex h-9 items-center gap-2.5 px-4 text-[0.9375rem] transition-colors',
          'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          isActive && 'bg-sidebar-accent font-medium text-sidebar-primary',
          collapsed && 'justify-center px-0'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? <span className="absolute inset-y-0 left-0 w-[2px] bg-stamp" /> : null}
          <Icon className="size-[16px] shrink-0" strokeWidth={1.75} />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return <li>{link}</li>

  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    </li>
  )
}
