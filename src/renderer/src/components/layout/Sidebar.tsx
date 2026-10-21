import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { BookOpen, ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/validation'
import { can, useSession } from '@/context/session-context'
import { visibleGroups, type NavItem } from '@/lib/navigation'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const SIDEBAR_KEY = 'crownbooks:sidebar-collapsed'

/**
 * Primary navigation rail. Collapses to an icon strip. Groups carry the
 * workflow labels; items are permission gated. No decorative badges.
 */
export function Sidebar(): React.JSX.Element {
  const session = useSession()
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SIDEBAR_KEY) === 'true'
  })

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_KEY, String(collapsed))
  }, [collapsed])

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
        <div className="flex size-8 shrink-0 items-center justify-center bg-ink text-paper">
          <BookOpen className="size-4" strokeWidth={1.75} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-tight tracking-tight">
              Crown Books
            </div>
            <div className="truncate text-[10.5px] leading-tight text-muted-foreground">
              {session.companyName}
            </div>
          </div>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-3">
        {groups.map((group, index) => (
          <div key={group.id} className={cn(index > 0 && 'mt-4')}>
            {!collapsed && group.label ? (
              <p className="px-4 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
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

      <div className="border-t border-sidebar-border p-2">
        <div
          className={cn('flex items-center gap-2.5 px-2 py-2', collapsed && 'justify-center px-0')}
        >
          <div className="flex size-8 shrink-0 items-center justify-center bg-accent-soft text-[11px] font-semibold text-primary">
            {initials(session.userFullName)}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium leading-tight">
                {session.userFullName}
              </p>
              <p className="truncate text-[10.5px] leading-tight text-muted-foreground">
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
              className="text-muted-foreground transition-colors hover:text-destructive"
            >
              <LogOut className="size-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
        <button
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'mt-1 flex w-full items-center gap-2 px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground',
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
          'relative flex h-[34px] items-center gap-2.5 px-4 text-[12.5px] transition-colors',
          'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          isActive && 'bg-accent-soft font-medium text-primary',
          collapsed && 'justify-center px-0'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? <span className="absolute inset-y-0 left-0 w-[2px] bg-primary" /> : null}
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
