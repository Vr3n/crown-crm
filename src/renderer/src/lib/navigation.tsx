import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  NotebookPen,
  Users,
  Truck,
  Contact,
  Package,
  Boxes,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  Scale,
  PieChart,
  Landmark,
  ListTree,
  ListOrdered,
  Percent,
  Ruler,
  Building2,
  ShieldCheck,
  DatabaseBackup
} from 'lucide-react'

/**
 * Application navigation. Groups follow the workflow, not the database:
 * Home, Books, Parties, Items, Reports, Masters, Admin.
 */
export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Permission code that gates the item. Undefined means every signed-in user. */
  requires?: string
  /** Phase in which this screen becomes real. Used by the placeholder pages. */
  phase?: string
}

export interface NavGroup {
  id: string
  label?: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'home',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }]
  },
  {
    id: 'books',
    label: 'Books',
    items: [
      { to: '/day-book', label: 'Day Book', icon: BookOpen, phase: 'P2' },
      { to: '/sales', label: 'Sales', icon: FileText, phase: 'P3' },
      { to: '/purchases', label: 'Purchases', icon: ShoppingCart, phase: 'P4' },
      { to: '/receipts', label: 'Receipts', icon: ArrowDownLeft, phase: 'P3' },
      { to: '/payments', label: 'Payments', icon: ArrowUpRight, phase: 'P4' },
      { to: '/journals', label: 'Journals', icon: NotebookPen, phase: 'P2' }
    ]
  },
  {
    id: 'parties',
    label: 'Parties',
    items: [
      { to: '/parties', label: 'All Parties', icon: Contact, phase: 'P1' },
      { to: '/customers', label: 'Customers', icon: Users, phase: 'P1' },
      { to: '/suppliers', label: 'Suppliers', icon: Truck, phase: 'P1' }
    ]
  },
  {
    id: 'items',
    label: 'Items',
    items: [
      { to: '/items', label: 'Items', icon: Package, phase: 'P1' },
      { to: '/stock', label: 'Stock Summary', icon: Boxes, phase: 'P5' }
    ]
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { to: '/reports/receivables', label: 'Receivables', icon: TrendingUp, phase: 'P3' },
      { to: '/reports/payables', label: 'Payables', icon: TrendingDown, phase: 'P4' },
      { to: '/reports/ageing', label: 'Ageing', icon: CalendarClock, phase: 'P3' },
      { to: '/reports/trial-balance', label: 'Trial Balance', icon: Scale, phase: 'P2' },
      { to: '/reports/profit-loss', label: 'Profit and Loss', icon: PieChart, phase: 'P6' },
      { to: '/reports/balance-sheet', label: 'Balance Sheet', icon: Landmark, phase: 'P6' }
    ]
  },
  {
    id: 'masters',
    label: 'Masters',
    items: [
      { to: '/masters/accounts', label: 'Chart of Accounts', icon: ListTree, phase: 'P1' },
      {
        to: '/masters/tax-rates',
        label: 'Tax Rates',
        icon: Percent,
        requires: 'item.view'
      },
      { to: '/masters/units', label: 'Units', icon: Ruler, requires: 'item.view' }
    ]
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      {
        to: '/settings/numbering',
        label: 'Voucher numbering',
        icon: ListOrdered,
        requires: 'settings.manage'
      },
      { to: '/settings/company', label: 'Company', icon: Building2, requires: 'company.view' },
      { to: '/settings/users', label: 'Users and Roles', icon: ShieldCheck, requires: 'user.view' },
      {
        to: '/settings/backup',
        label: 'Backup',
        icon: DatabaseBackup,
        requires: 'backup.manage'
      }
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

export function titleForPath(pathname: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.to === pathname) return item.label
    }
  }

  const segments = pathname.split('/').filter(Boolean)
  const first = segments[0]
  if (first === 'vouchers') return 'Voucher'
  if (first === 'reports') {
    const names: Record<string, string> = {
      receivables: 'Receivables',
      payables: 'Payables',
      ageing: 'Ageing',
      'trial-balance': 'Trial Balance',
      'profit-loss': 'Profit and Loss',
      'balance-sheet': 'Balance Sheet',
      'sales-register': 'Sales Register',
      'purchase-register': 'Purchase Register'
    }
    return names[segments[1] ?? ''] ?? 'Report'
  }
  if (first === 'settings') return segments[1] === 'company' ? 'Company' : 'Settings'

  const root = `/${first ?? ''}`
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.to === root) return item.label
    }
  }
  return 'Crown Books'
}
