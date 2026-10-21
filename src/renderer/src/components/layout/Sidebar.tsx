import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Crown, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/validation'
import { can, useSession } from '@/context/session-context'
import { visibleGroups, type NavItem } from '@/lib/navigation'
import { useOrgLogo } from '@/features/identity/queries'
import { useOverdueFollowUpCount } from '@/features/followups/queries'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const SIDEBAR_KEY = 'crowncrm:sidebar-collapsed'

/**
 * The app's primary navigation rail. Collapses to an icon-only strip (64px);
 * groups carry the module labels; items are permission-gated via `can()`.
 * Operational counts render as badges only when real data is present.
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
  const { data: logo } = useOrgLogo()

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-60',
        'max-lg:hidden'
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex h-14 items-center border-b',
          collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'
        )}
      >
        <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          {logo?.src ? (
            <img src={logo.src} alt={`${session.organizationName} logo`} className="size-9 object-cover" />
          ) : (
            <Crown className="size-5" />
          )}
        </div>
        {!collapsed && (
          <span className="min-w-0 truncate font-heading text-lg font-semibold tracking-tight">
            {session.organizationName}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.id} className={cn('mb-1', !collapsed && 'mt-3 first:mt-0')}>
            {!collapsed && group.label ? (
              <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/45">
                {group.label}
              </p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <SidebarItem key={item.to} item={item} collapsed={collapsed} />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t p-2">
        <button
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>

      {/* Identity — anchored to bottom of rail */}
      <div className="mt-auto border-t p-2">
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-md px-2 py-2',
            collapsed && 'justify-center px-0'
          )}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-sm font-semibold text-primary">
            {initials(session.userFullName)}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {session.userFullName}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/55">{session.roleName}</p>
            </div>
          )}
        </div>
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
          'group/nav relative flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors',
          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
          collapsed && 'justify-center px-0'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary" />
          ) : null}
          <Icon className="size-4.5 shrink-0" />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
          {!collapsed && item.badge ? <NavBadge kind={item.badge} /> : null}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        <span>{item.label}</span>
        {item.badge ? <NavBadge kind={item.badge} /> : null}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Operational count badge. Renders only when a real data source exists — the
 * shell deliberately avoids fake-precise numbers (no invented "5 overdue").
 * `kind` selects the subscribed query; count 0 hides the badge.
 */
function NavBadge({ kind }: { kind: NonNullable<NavItem['badge']> }): React.JSX.Element | null {
  const overdue = useOverdueFollowUpCount()
  const count = kind === 'overdue-followups' ? overdue : 0
  if (count <= 0) return null
  return (
    <span className="ml-auto shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive tabular-nums">
      {count}
    </span>
  )
}
