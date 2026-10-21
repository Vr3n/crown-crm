import { Routes, Route, Navigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { ModulePlaceholder } from '@/pages/module-placeholder'
import { PlansPage } from '@/features/catalog/pages/PlansPage'
import { OffersPage } from '@/features/catalog/pages/OffersPage'
import { LeadsPage } from '@/features/leads/pages/LeadsPage'
import { LeadDetailPage } from '@/features/leads/pages/LeadDetailPage'
import { FollowUpsPage } from '@/features/followups/pages/FollowUpsPage'
import { ActivitiesPage } from '@/features/activities/pages/ActivitiesPage'
import { CustomersPage } from '@/features/customers/pages/CustomersPage'
import { CustomerDetailPage } from '@/features/customers/pages/CustomerDetailPage'
import { MembershipsPage } from '@/features/memberships/pages/MembershipsPage'
import { MembershipSalePage } from '@/features/memberships/sale/page'
import { InvoicesPage } from '@/features/invoices/pages/InvoicesPage'
import { InvoiceDetailPage } from '@/features/invoices/pages/InvoiceDetailPage'
import { CollectionsPage } from '@/features/collections/pages/CollectionsPage'
import { PaymentsPage } from '@/features/finance/pages/PaymentsPage'
import { RefundsPage } from '@/features/finance/pages/RefundsPage'
import { ReportsPage } from '@/features/finance/pages/ReportsPage'
import { UsersPage } from '@/features/identity/pages/UsersPage'
import { OrganizationPage } from '@/features/identity/pages/OrganizationPage'
import { can, useSession } from '@/context/session-context'

/** Route guard mirroring the nav gate: super OR the permission code. */
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

const MODULES: {
  path: string
  title: string
  description: string
  scope: string
  icon: typeof Search
  requires?: string
}[] = [
  {
    path: 'search',
    title: 'Find a person',
    description:
      'Search customers and leads by name, phone, email, membership ID or invoice number.',
    scope: 'Module 09 · Customer 360',
    icon: Search
  }
]

export function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/:id" element={<LeadDetailPage />} />
        <Route path="followups" element={<FollowUpsPage />} />
        <Route path="activities" element={<ActivitiesPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="memberships" element={<MembershipsPage />} />
        <Route path="memberships/sale" element={<MembershipSalePage />} />
        <Route path="memberships/sell" element={<MembershipSalePage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="offers" element={<OffersPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="refunds" element={<RefundsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route
          path="settings/users"
          element={
            <Protected code="user.view">
              <UsersPage />
            </Protected>
          }
        />
        <Route
          path="settings/organization"
          element={
            <Protected code="org.view">
              <OrganizationPage />
            </Protected>
          }
        />
        {MODULES.map((m) => {
          const element = (
            <ModulePlaceholder
              title={m.title}
              description={m.description}
              scope={m.scope}
              icon={m.icon}
            />
          )
          return (
            <Route
              key={m.path}
              path={m.path}
              element={m.requires ? <Protected code={m.requires}>{element}</Protected> : element}
            />
          )
        })}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
