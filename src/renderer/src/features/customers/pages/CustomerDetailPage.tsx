import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { can, useSession } from '@/context/session-context'
import { useNow } from '@/lib/use-now'
import { buildCustomerRow } from '../build'
import { useCustomer } from '../queries'
import { BlacklistBanner } from '@/features/people/components/blacklist-banner'
import { CurrentMembershipCard } from '../components/detail/current-membership-card'
import { IdentityCard } from '../components/detail/identity-card'
import { InvoiceOverviewCard } from '../components/detail/invoice-overview-card'
import { LifetimeCard } from '../components/detail/lifetime-card'
import { MembershipOverviewCard } from '../components/detail/membership-overview-card'
import { MembershipTimeline } from '../components/detail/membership-timeline'
import { QuickStatsCard } from '../components/detail/quick-stats-card'
import { CancelMembershipDialog } from '@/features/memberships/components/cancel-membership-dialog'
import { RenewMembershipDialog } from '@/features/memberships/components/renew-membership-dialog'
import { useRevertCancellation } from '@/features/memberships/mutations'
import type { Membership } from '../types'

/**
 * Customer 360 (Module 02) — the operational view of one person. Bento grid
 * layout with asymmetric anchor cells:
 *
 *   Row 1: Identity (7) | QuickStats (5)
 *   Row 2: CurrentMembership (7) | Lifetime (5)
 *   Row 3: Memberships + Invoices side-by-side (flex bento)
 */
export function CustomerDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const session = useSession()
  const now = useNow()
  const { data: customer, isLoading } = useCustomer(id)

  const from = (location.state as { from?: string } | null)?.from ?? '/customers'
  const backLabel = from === '/memberships' ? 'Memberships' : 'Customers'

  const row = useMemo(() => (customer ? buildCustomerRow(customer, now) : null), [customer, now])

  // Cancel / revert / renew state
  const [cancelTarget, setCancelTarget] = useState<Membership | null>(null)
  const [renewTarget, setRenewTarget] = useState<Membership | null>(null)
  const revertCancellation = useRevertCancellation()
  const canCancel = can(session.permissions, session.isSuper, 'membership.cancel')
  const canRenew = can(session.permissions, session.isSuper, 'membership.renew')

  const handleCancel = (membershipId: string): void => {
    const m = customer?.memberships.find((mem) => mem.id === membershipId)
    if (m) setCancelTarget(m)
  }

  const handleRenew = (membershipId: string): void => {
    const m = customer?.memberships.find((mem) => mem.id === membershipId)
    if (m) setRenewTarget(m)
  }

  const handleRevert = (membershipId: string): void => {
    revertCancellation.mutate({ membershipId: parseInt(membershipId) })
  }

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-6 p-6">
        <Skeleton className="mb-4 h-8 w-40" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
          <Skeleton className="h-52 md:col-span-7" />
          <Skeleton className="h-52 md:col-span-5" />
          <Skeleton className="h-52 md:col-span-7" />
          <Skeleton className="h-52 md:col-span-5" />
          <Skeleton className="h-64 md:col-span-6" />
          <Skeleton className="h-64 md:col-span-6" />
        </div>
      </div>
    )
  }

  if (!customer || !row) {
    return (
      <div className="flex w-full items-center justify-center p-6">
        <EmptyState
          icon={ArrowLeft}
          title="Customer not found"
          description="This customer may have been removed."
          action={
            <Button onClick={() => navigate(from)}>
              <ArrowLeft />
              Back to {backLabel.toLowerCase()}
            </Button>
          }
        />
      </div>
    )
  }

  const sortedMemberships = [...customer.memberships].sort((a, b) =>
    b.startDate.localeCompare(a.startDate)
  )
  const sortedInvoices = [...(customer.invoices ?? [])].sort((a, b) =>
    b.issuedAt.localeCompare(a.issuedAt)
  )

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <div className="flex items-center gap-2">
        <Link to={from}>
          <Button variant="ghost" size="sm">
            <ArrowLeft />
            {backLabel}
          </Button>
        </Link>
      </div>

      {customer ? (
        <BlacklistBanner
          personId={Number(customer.personId)}
          personName={customer.name}
          isBlacklisted={customer.isBlacklisted}
          reason={customer.blacklistedReason ?? undefined}
          canManage={can(session.permissions, session.isSuper, 'person.blacklist')}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
        {/* Row 1: Identity anchor (7) + QuickStats (5) */}
        <div className="md:col-span-7">
          <IdentityCard customer={customer} status={row.status} />
        </div>
        <div className="md:col-span-5">
          <QuickStatsCard customer={customer} now={now} />
        </div>

        {/* Row 2: CurrentMembership anchor (7) + Lifetime accent (5) */}
        <div className="md:col-span-7">
          <CurrentMembershipCard
            currentMembership={row.currentMembership}
            now={now}
            onCancel={handleCancel}
            onRevert={handleRevert}
            onRenew={canRenew ? handleRenew : undefined}
          />
        </div>
        <div className="md:col-span-5">
          <LifetimeCard customer={customer} now={now} />
        </div>

        {/* Row 3: Memberships + Invoices side-by-side in bento flex */}
        <div className="md:col-span-12">
          <div className="flex flex-col gap-5 lg:flex-row">
            {/* Memberships */}
            <div className="flex-1 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Memberships purchased ({customer.memberships.length})
              </h3>
              {sortedMemberships.length === 0 ? (
                <p className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                  No membership purchased yet.
                </p>
              ) : (
                <div className="grid gap-4">
                  {sortedMemberships.map((m, i) => (
                    <MembershipOverviewCard
                      key={m.id}
                      membership={m}
                      now={now}
                      variant={i === 0 ? 'hero' : 'default'}
                      canCancel={canCancel}
                      canRenew={canRenew}
                      onCancel={() => handleCancel(m.id)}
                      onRenew={() => handleRenew(m.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Invoices */}
            <div className="flex-1 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Invoices ({sortedInvoices.length})
              </h3>
              {sortedInvoices.length === 0 ? (
                <p className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                  No invoices yet — invoices appear here after a membership is sold.
                </p>
              ) : (
                <div className="grid gap-4">
                  {sortedInvoices.map((inv) => (
                    <InvoiceOverviewCard key={inv.id} invoice={inv} customerId={customer.id} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 4: Membership lifecycle timeline */}
        <div className="md:col-span-12">
          <MembershipTimeline memberships={customer.memberships} now={now} />
        </div>
      </div>

      {/* Cancel membership dialog */}
      {cancelTarget && (
        <CancelMembershipDialog
          open={!!cancelTarget}
          onOpenChange={(o) => {
            if (!o) setCancelTarget(null)
          }}
          membership={cancelTarget}
        />
      )}

      {/* Renew membership dialog */}
      {renewTarget && (
        <RenewMembershipDialog
          open={!!renewTarget}
          onOpenChange={(o) => {
            if (!o) setRenewTarget(null)
          }}
          membership={renewTarget}
        />
      )}
    </div>
  )
}
