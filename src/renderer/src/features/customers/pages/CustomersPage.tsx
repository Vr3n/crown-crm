import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { can, useSession } from '@/context/session-context'
import { useNow } from '@/lib/use-now'
import { buildCustomerRow } from '../build'
import { CustomerFilters } from '../components/customer-filters'
import { CustomerMetrics } from '../components/customer-metrics'
import { CustomerTable } from '../components/customer-table'
import { filterCustomers, sortCustomerRows } from '../filters'
import { useCustomers } from '../queries'
import type { CustomerFilters as CustomerFilterState, CustomerRow } from '../types'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'

const BlacklistDialog = lazy(() =>
  import('@/features/people/components/blacklist-dialog').then((m) => ({
    default: m.BlacklistDialog
  }))
)

const CUSTOMER_EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Name', key: 'name', format: 'text' },
  { header: 'Phone', key: 'phone', format: 'text' },
  { header: 'Email', key: 'email', format: 'text' },
  { header: 'Status', key: 'status', format: 'text' },
  { header: 'Plan', key: 'plan', format: 'text' },
  { header: 'Expires', key: 'expires', format: 'date' },
  { header: 'Joined', key: 'joined', format: 'date' },
  { header: 'Owner', key: 'owner', format: 'text' }
]

const DEFAULT_FILTERS: CustomerFilterState = {
  search: '',
  status: 'ALL',
  personStatus: 'ALL',
  plan: 'ALL',
  ownerId: 'ALL'
}

/**
 * Customers (Module 02) — the directory. Every row is a derived read model over
 * the membership history (Customer ≠ Active Member, docs/02 §4): status comes
 * from dates + open freezes, never a cached column. Row-click opens the 360
 * view.
 */
export function CustomersPage(): React.JSX.Element {
  const navigate = useNavigate()
  const session = useSession()
  const now = useNow()
  const { data, isLoading } = useCustomers()
  const [filters, setFilters] = useState<CustomerFilterState>(DEFAULT_FILTERS)
  const [blacklisting, setBlacklisting] = useState<CustomerRow | null>(null)

  const rows = useMemo(() => {
    if (!data) return []
    const derived = data.map((c) => buildCustomerRow(c, now))
    return sortCustomerRows(filterCustomers(derived, filters))
  }, [data, filters, now])

  const customerExportData = useMemo(
    () =>
      rows.map((r) => ({
        name: r.customer.name,
        id: r.customer.id,
        phone: r.customer.phone ?? '',
        email: r.customer.email ?? '',
        status: r.status,
        plan: r.currentMembership?.plan ?? '',
        expires: r.nextExpiry ?? '',
        joined: r.customer.joinedAt,
        owner: r.customer.ownerName ?? 'Unassigned'
      })),
    [rows]
  )

  function openCustomer(customerId: string): void {
    navigate(`/customers/${customerId}`, { state: { from: '/customers' } })
  }

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Customers"
        description={`${session.organizationName} · customer directory`}
      />

      <CustomerMetrics rows={rows} now={now} />

      <Card className="gap-0 py-0">
        <CardContent className="px-3 py-2.5">
          <CustomerFilters filters={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-3 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <ExportExcelButton
              columns={CUSTOMER_EXPORT_COLUMNS}
              rows={customerExportData}
              sheetName="Customers"
            />
          </div>
          <CustomerTable
            rows={rows}
            now={now}
            isLoading={isLoading}
            onOpen={openCustomer}
            onBlacklist={setBlacklisting}
            canBlacklist={can(session.permissions, session.isSuper, 'person.blacklist')}
          />
        </CardContent>
      </Card>

      {blacklisting && (
        <Suspense fallback={null}>
          <BlacklistDialog
            key={blacklisting.customer.personId}
            open
            onOpenChange={() => setBlacklisting(null)}
            personId={Number(blacklisting.customer.personId)}
            personName={blacklisting.customer.name}
            isBlacklisted={blacklisting.customer.isBlacklisted}
          />
        </Suspense>
      )}
    </div>
  )
}
