import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { can, useSession } from '@/context/session-context'
import { useNow } from '@/lib/use-now'
import { buildMembershipRows, sortMembershipRows } from '../build'
import { MembershipFilters } from '../components/membership-filters'
import { MembershipMetrics } from '../components/membership-metrics'
import { MembershipTable } from '../components/membership-table'
import { filterMemberships } from '../filters'
import { useMemberships } from '../queries'
import type { MembershipFilters as MembershipFilterState, MembershipRow } from '../types'

const BlacklistDialog = lazy(() =>
  import('@/features/people/components/blacklist-dialog').then((m) => ({
    default: m.BlacklistDialog
  }))
)

const DEFAULT_FILTERS: MembershipFilterState = {
  search: '',
  status: 'ALL',
  personStatus: 'ALL',
  plan: 'ALL'
}

/**
 * Memberships (Module 02 §6) — every purchased entitlement period across all
 * customers, one row per membership, including renewals, freezes and
 * cancellations. Status is derived from dates + open freezes, and each row
 * carries its price snapshot (never recomputed from the plan).
 */
export function MembershipsPage(): React.JSX.Element {
  const navigate = useNavigate()
  const session = useSession()
  const now = useNow()
  const { customers, isLoading } = useMemberships()
  const [filters, setFilters] = useState<MembershipFilterState>(DEFAULT_FILTERS)
  const [blacklisting, setBlacklisting] = useState<MembershipRow | null>(null)

  const rows = useMemo(() => {
    const all = buildMembershipRows(customers, now)
    return sortMembershipRows(filterMemberships(all, filters))
  }, [customers, filters, now])

  function openCustomer(customerId: string): void {
    navigate(`/customers/${customerId}`, { state: { from: '/memberships' } })
  }

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Memberships"
        description={`${session.organizationName} · every entitlement period`}
        actions={
          <Button onClick={() => navigate('/memberships/sale')}>
            <Plus className="size-4" />
            New Membership Sale
          </Button>
        }
      />

      <MembershipMetrics rows={rows} now={now} />

      <Card className="gap-0 py-0">
        <CardContent className="px-3 py-2.5">
          <MembershipFilters filters={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardContent className="px-3 py-3">
          <MembershipTable
            rows={rows}
            now={now}
            isLoading={isLoading}
            onOpenCustomer={openCustomer}
            onBlacklist={setBlacklisting}
            canBlacklist={can(session.permissions, session.isSuper, 'person.blacklist')}
          />
        </CardContent>
      </Card>

      {blacklisting && (
        <Suspense fallback={null}>
          <BlacklistDialog
            key={blacklisting.personId}
            open
            onOpenChange={() => setBlacklisting(null)}
            personId={Number(blacklisting.personId)}
            personName={blacklisting.customerName}
            isBlacklisted={blacklisting.isBlacklisted}
          />
        </Suspense>
      )}
    </div>
  )
}
