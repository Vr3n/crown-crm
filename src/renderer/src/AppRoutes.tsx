import { Routes, Route, Navigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  CalendarClock,
  Contact,
  FileText,
  Landmark,
  ListTree,
  NotebookPen,
  Package,
  Percent,
  PieChart,
  Ruler,
  Scale,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  ShieldCheck,
  Building2
} from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { ModulePlaceholder } from '@/pages/module-placeholder'
import { can, useSession } from '@/context/session-context'

function Protected({
  code,
  children
}: {
  code: string
  children: React.ReactNode
}): React.JSX.Element {
  const session = useSession()
  if (!can(session.permissions, session.isSuper, code)) return <Navigate to="/" replace />
  return <>{children}</>
}

interface PlannedRoute {
  path: string
  title: string
  description: string
  scope: string
  icon: LucideIcon
  requires?: string
}

const PLANNED: PlannedRoute[] = [
  {
    path: 'day-book',
    title: 'Day Book',
    description:
      'Every posted voucher in date order, with its ledger and stock effect one click away.',
    scope: 'P2',
    icon: BookOpen
  },
  {
    path: 'sales',
    title: 'Sales',
    description:
      'GST tax invoices with item lines, discounts, inclusive or exclusive rates and round off.',
    scope: 'P3',
    icon: FileText
  },
  {
    path: 'purchases',
    title: 'Purchases',
    description: 'Supplier bills with the same line grid, discount handling and input tax.',
    scope: 'P4',
    icon: ShoppingCart
  },
  {
    path: 'receipts',
    title: 'Receipts',
    description:
      'Money received, applied against one or more open invoices, with advances left on account.',
    scope: 'P3',
    icon: ArrowDownLeft
  },
  {
    path: 'payments',
    title: 'Payments',
    description: 'Money paid to suppliers, applied against the bills it settles.',
    scope: 'P4',
    icon: ArrowUpRight
  },
  {
    path: 'journals',
    title: 'Journals',
    description: 'Manual double entry and cash to bank transfers, with the balance guard.',
    scope: 'P2',
    icon: NotebookPen
  },
  {
    path: 'parties',
    title: 'All Parties',
    description:
      'One record per business, flagged customer, supplier or both, with credit terms and balance.',
    scope: 'P1',
    icon: Contact
  },
  {
    path: 'customers',
    title: 'Customers',
    description: 'Debtors with their outstanding bills, statements and collection history.',
    scope: 'P1',
    icon: Users
  },
  {
    path: 'suppliers',
    title: 'Suppliers',
    description: 'Creditors with bills payable, payment terms and statements.',
    scope: 'P1',
    icon: Truck
  },
  {
    path: 'items',
    title: 'Items',
    description: 'Goods and services with HSN, unit, GST rate, prices and opening stock.',
    scope: 'P1',
    icon: Package
  },
  {
    path: 'stock',
    title: 'Stock Summary',
    description: 'Quantity and value on hand by item and godown, computed from movements.',
    scope: 'P5',
    icon: Boxes
  },
  {
    path: 'reports/receivables',
    title: 'Receivables',
    description: 'Who owes us, bill by bill, with due dates and days overdue.',
    scope: 'P3',
    icon: TrendingUp
  },
  {
    path: 'reports/payables',
    title: 'Payables',
    description: 'Who we owe, bill by bill, with the payment due next.',
    scope: 'P4',
    icon: TrendingDown
  },
  {
    path: 'reports/ageing',
    title: 'Ageing',
    description: 'Open bills bucketed by age, by bill date or due date.',
    scope: 'P3',
    icon: CalendarClock
  },
  {
    path: 'reports/trial-balance',
    title: 'Trial Balance',
    description: 'Every account with its debit and credit total, proving the books balance.',
    scope: 'P2',
    icon: Scale
  },
  {
    path: 'reports/profit-loss',
    title: 'Profit and Loss',
    description: 'Net sales, cost of goods sold, expenses and profit for the period.',
    scope: 'P6',
    icon: PieChart
  },
  {
    path: 'reports/balance-sheet',
    title: 'Balance Sheet',
    description: 'Assets, liabilities and equity, with the current period profit inside equity.',
    scope: 'P6',
    icon: Landmark
  },
  {
    path: 'masters/accounts',
    title: 'Chart of Accounts',
    description:
      'Groups and ledgers, with the reserved system accounts the posting engine relies on.',
    scope: 'P1',
    icon: ListTree
  },
  {
    path: 'masters/tax-rates',
    title: 'Tax Rates',
    description: 'GST and cess rates with effective dates, so history never changes.',
    scope: 'P1',
    icon: Percent
  },
  {
    path: 'masters/units',
    title: 'Units',
    description: 'Nos, kilograms, litres, metres and the precision each one allows.',
    scope: 'P1',
    icon: Ruler
  },
  {
    path: 'settings/company',
    title: 'Company',
    description: 'Identity, GSTIN and state, financial year, costing method and invoice terms.',
    scope: 'P1',
    icon: Building2,
    requires: 'company.view'
  },
  {
    path: 'settings/users',
    title: 'Users and Roles',
    description: 'Staff accounts and the permission sets attached to each role.',
    scope: 'P8',
    icon: ShieldCheck,
    requires: 'user.view'
  }
]

export function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        {PLANNED.map((route) => {
          const element = (
            <ModulePlaceholder
              title={route.title}
              description={route.description}
              scope={route.scope}
              icon={route.icon}
            />
          )
          return (
            <Route
              key={route.path}
              path={route.path}
              element={
                route.requires ? <Protected code={route.requires}>{element}</Protected> : element
              }
            />
          )
        })}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
