import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Kanban,
  BellRing,
  PhoneCall,
  Users,
  CreditCard,
  Package,
  BadgePercent,
  Receipt,
  Landmark,
  Wallet,
  Undo2,
  BarChart3,
  UserCog,
  Building2
} from 'lucide-react'

/**
 * Application shell navigation — maps every bounded context (docs/modules 01–15)
 * to a nav item. `requires` is a permission code (Module 15); items with no code
 * are visible to every signed-in user. Module permission codes (lead.view,
 * invoice.view, …) are designed-but-not-yet-seeded, so business groups are open to
 * all authenticated users for now — add the code here the moment it exists.
 */
export interface NavItem {
  to: string
  label: string
  description?: string
  icon: LucideIcon
  /** Permission code that gates this item; undefined = visible to all signed-in users. */
  requires?: string
  /** Optional live count (badge). Renderer subscribes via its own query key. */
  badge?: 'overdue-followups' | 'outstanding-dues'
}

export interface NavGroup {
  id: string
  label?: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'command',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }]
  },
  {
    id: 'sales',
    label: 'Sales',
    items: [
      { to: '/leads', label: 'Pipeline', icon: Kanban },
      { to: '/followups', label: 'Follow-ups', icon: BellRing, badge: 'overdue-followups' },
      { to: '/activities', label: 'Activities', icon: PhoneCall }
    ]
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/memberships', label: 'Memberships', icon: CreditCard }
    ]
  },
  {
    id: 'catalog',
    label: 'Catalog',
    items: [
      { to: '/plans', label: 'Plans', icon: Package },
      { to: '/offers', label: 'Offers', icon: BadgePercent }
    ]
  },
  {
    id: 'billing',
    label: 'Billing',
    items: [
      { to: '/invoices', label: 'Invoices', icon: Receipt },
      { to: '/collections', label: 'Daily Collection', icon: Landmark }
    ]
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { to: '/payments', label: 'Payments', icon: Wallet },
      { to: '/refunds', label: 'Refunds & Credits', icon: Undo2 },
      { to: '/reports', label: 'Reports', icon: BarChart3 }
    ]
  },
  {
    id: 'settings',
    label: 'Administration',
    items: [
      { to: '/settings/users', label: 'Users & Roles', icon: UserCog, requires: 'user.view' },
      { to: '/settings/organization', label: 'Organization', icon: Building2, requires: 'org.view' }
    ]
  }
]

export function visibleGroups(
  permissions: string[],
  isSuper: boolean,
  can: (permissions: string[], isSuper: boolean, code?: string) => boolean
): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(permissions, isSuper, item.requires))
  })).filter((group) => group.items.length > 0)
}
