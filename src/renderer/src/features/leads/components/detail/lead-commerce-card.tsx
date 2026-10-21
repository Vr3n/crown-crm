import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCustomer } from '@/features/customers/queries'
import { InvoiceOverviewCard } from '@/features/customers/components/detail/invoice-overview-card'
import { MembershipOverviewCard } from '@/features/customers/components/detail/membership-overview-card'
import { MembershipTimeline } from '@/features/customers/components/detail/membership-timeline'
import { CancelMembershipDialog } from '@/features/memberships/components/cancel-membership-dialog'
import { RenewMembershipDialog } from '@/features/memberships/components/renew-membership-dialog'
import { can, useSession } from '@/context/session-context'
import type { Membership } from '@/features/customers/types'
import type { Lead } from '../../types'

/**
 * Rich commercial-history block for a converted lead: full membership cards
 * (with joining date, paid/total and cancel/renew actions) plus invoice cards
 * and a membership lifecycle timeline — mirroring the Customer detail page.
 */
export function LeadCommerceCard({ lead }: { lead: Lead }): React.JSX.Element | null {
  const customerId = lead.customerId
  const session = useSession()
  const { data: customer } = useCustomer(customerId !== undefined ? String(customerId) : undefined)
  const [now] = useState(() => Date.now())
  const [cancelTarget, setCancelTarget] = useState<Membership | null>(null)
  const [renewTarget, setRenewTarget] = useState<Membership | null>(null)
  const canCancel = can(session.permissions, session.isSuper, 'membership.cancel')
  const canRenew = can(session.permissions, session.isSuper, 'membership.renew')

  if (!customer) return null

  const hasMemberships = customer.memberships.length > 0
  const hasInvoices = (customer.invoices ?? []).length > 0
  if (!hasMemberships && !hasInvoices) return null

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold tracking-tight">Commercial history</h3>
        <Button asChild size="sm" variant="outline">
          <Link to={`/customers/${String(customerId)}`}>
            Open customer <ExternalLink className="ml-1 size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-6 md:flex-row">
        {hasMemberships ? (
          <div className="flex-1 space-y-4 rounded-lg border border-dashed p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Memberships
            </h4>
            <div className="grid gap-3">
              {[...customer.memberships]
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
                .map((m) => (
                  <MembershipOverviewCard
                    key={m.id}
                    membership={m}
                    now={now}
                    canCancel={canCancel}
                    canRenew={canRenew}
                    onCancel={() => setCancelTarget(m)}
                    onRenew={() => setRenewTarget(m)}
                  />
                ))}
            </div>
          </div>
        ) : null}

        {hasInvoices ? (
          <div className="flex-1 space-y-4 rounded-lg border border-dashed p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Invoices
            </h4>
            <div className="grid gap-3">
              {[...(customer.invoices ?? [])]
                .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
                .map((inv) => (
                  <InvoiceOverviewCard key={inv.id} invoice={inv} customerId={String(customerId)} />
                ))}
            </div>
          </div>
        ) : null}
      </div>

      {hasMemberships ? (
        <div className="mt-4">
          <MembershipTimeline memberships={customer.memberships} now={now} />
        </div>
      ) : null}

      {cancelTarget ? (
        <CancelMembershipDialog
          open={!!cancelTarget}
          onOpenChange={(o) => {
            if (!o) setCancelTarget(null)
          }}
          membership={cancelTarget}
        />
      ) : null}
      {renewTarget ? (
        <RenewMembershipDialog
          open={!!renewTarget}
          onOpenChange={(o) => {
            if (!o) setRenewTarget(null)
          }}
          membership={renewTarget}
        />
      ) : null}
    </section>
  )
}
