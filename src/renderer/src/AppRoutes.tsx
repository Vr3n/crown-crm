import { Routes, Route, Navigate, useParams } from 'react-router-dom'
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
  PieChart,
  Scale,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Building2
} from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { ReportsPage } from '@/features/reports/pages/ReportsPage'
import { StockPage } from '@/features/stock/pages/StockPage'
import { BackupPage } from '@/features/backup/pages/BackupPage'
import { JournalsPage } from '@/features/journals/pages/JournalsPage'
import { PartiesPage } from '@/features/parties/pages/PartiesPage'
import { PartyDetailPage } from '@/features/parties/pages/PartyDetailPage'
import { ItemsPage } from '@/features/items/pages/ItemsPage'
import { ItemDetailPage } from '@/features/items/pages/ItemDetailPage'
import { AccountsPage } from '@/features/accounts/pages/AccountsPage'
import { CompanyPage } from '@/features/company/pages/CompanyPage'
import { NumberingPage } from '@/features/numbering/pages/NumberingPage'
import { UnitsPage } from '@/features/settings/pages/UnitsPage'
import { TaxRatesPage } from '@/features/settings/pages/TaxRatesPage'
import { SetupTourPage } from '@/features/onboarding/pages/SetupTourPage'
import { SetupNumberingPage } from '@/features/onboarding/pages/SetupNumberingPage'
import { VoucherListPage } from '@/features/vouchers/pages/VoucherListPage'
import { VoucherEntryPage } from '@/features/vouchers/pages/VoucherEntryPage'
import { ReceiptEntryPage } from '@/features/vouchers/pages/ReceiptEntryPage'
import { VoucherDetailPage } from '@/features/vouchers/pages/VoucherDetailPage'
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
    path: 'settings/company',
    title: 'Company',
    description: 'Identity, GSTIN and state, financial year, costing method and invoice terms.',
    scope: 'P1',
    icon: Building2,
    requires: 'company.view'
  },
]

function VoucherDetailRoute(): React.JSX.Element {
  const { id } = useParams()
  const numeric = Number(id)
  if (!numeric) return <Navigate to="/" replace />
  return <VoucherDetailPage id={numeric} />
}

export function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route
        path="setup/numbering"
        element={
          <Protected code="settings.manage">
            <SetupNumberingPage />
          </Protected>
        }
      />
      <Route
        path="setup/tour"
        element={
          <Protected code="settings.manage">
            <SetupTourPage />
          </Protected>
        }
      />
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="journals" element={<JournalsPage />} />
        <Route path="parties" element={<PartiesPage />} />
        <Route path="parties/:id" element={<PartyDetailPage />} />
        <Route path="customers" element={<PartiesPage />} />
        <Route path="customers/:id" element={<PartyDetailPage />} />
        <Route path="suppliers" element={<PartiesPage />} />
        <Route path="suppliers/:id" element={<PartyDetailPage />} />
        <Route path="items" element={<ItemsPage />} />
        <Route path="items/:id" element={<ItemDetailPage />} />
        <Route path="masters/accounts" element={<AccountsPage />} />
        <Route
          path="masters/units"
          element={
            <Protected code="item.view">
              <UnitsPage />
            </Protected>
          }
        />
        <Route
          path="masters/tax-rates"
          element={
            <Protected code="item.view">
              <TaxRatesPage />
            </Protected>
          }
        />
        <Route path="day-book" element={<VoucherListPage title="Day Book" />} />
        <Route path="sales" element={<VoucherListPage type="SALES" title="Sales" />} />
        <Route path="purchases" element={<VoucherListPage type="PURCHASE" title="Purchases" />} />
        <Route path="receipts" element={<VoucherListPage type="RECEIPT" title="Receipts" />} />
        <Route path="payments" element={<VoucherListPage type="PAYMENT" title="Payments" />} />
        <Route path="sales/new" element={<VoucherEntryPage type="SALES" />} />
        <Route path="purchases/new" element={<VoucherEntryPage type="PURCHASE" />} />
        <Route path="sales/:id/credit-note" element={<VoucherEntryPage type="CREDIT_NOTE" />} />
        <Route path="purchases/:id/debit-note" element={<VoucherEntryPage type="DEBIT_NOTE" />} />
        <Route path="receipts/new" element={<ReceiptEntryPage mode="RECEIPT" />} />
        <Route path="payments/new" element={<ReceiptEntryPage mode="PAYMENT" />} />
        <Route path="vouchers/:id" element={<VoucherDetailRoute />} />
        <Route
          path="settings/company"
          element={
            <Protected code="company.view">
              <CompanyPage />
            </Protected>
          }
        />
        <Route
          path="settings/numbering"
          element={
            <Protected code="settings.manage">
              <NumberingPage />
            </Protected>
          }
        />
        <Route path="reports/receivables" element={<ReportsPage kind="receivables" />} />
        <Route path="reports/payables" element={<ReportsPage kind="payables" />} />
        <Route path="reports/ageing" element={<ReportsPage kind="ageing" />} />
        <Route path="reports/trial-balance" element={<ReportsPage kind="trial-balance" />} />
        <Route path="reports/profit-loss" element={<ReportsPage kind="profit-loss" />} />
        <Route path="reports/balance-sheet" element={<ReportsPage kind="balance-sheet" />} />
        <Route path="reports/sales-register" element={<ReportsPage kind="sales-register" />} />
        <Route
          path="reports/purchase-register"
          element={<ReportsPage kind="purchase-register" />}
        />
        <Route
          path="settings/backup"
          element={
            <Protected code="backup.manage">
              <BackupPage />
            </Protected>
          }
        />
        {PLANNED.filter(
          (route) =>
            route.path !== 'stock' &&
            route.path !== 'journals' &&
            route.path !== 'parties' &&
            route.path !== 'customers' &&
            route.path !== 'suppliers' &&
            route.path !== 'items' &&
            route.path !== 'masters/accounts' &&
            route.path !== 'settings/company' &&
            route.path !== 'day-book' &&
            route.path !== 'sales' &&
            route.path !== 'purchases' &&
            route.path !== 'receipts' &&
            route.path !== 'payments' &&
            !route.path.startsWith('reports/')
        ).map((route) => {
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
