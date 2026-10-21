import { Suspense, lazy, useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { can, useSession } from '@/context/session-context'
import { useInvoices } from '../queries'
import { InvoiceMetrics } from '../components/invoice-metrics'
import { InvoicesTable } from '../components/invoices-table'
import type { Invoice } from '../types'

// Lazy dialogs — keep them out of the initial render
const NewInvoiceDialog = lazy(() =>
  import('../components/new-invoice-dialog').then((m) => ({ default: m.NewInvoiceDialog }))
)
const RecordPaymentDialog = lazy(() =>
  import('@/features/finance/components/record-payment-dialog').then((m) => ({
    default: m.RecordPaymentDialog
  }))
)

export function InvoicesPage(): React.JSX.Element {
  const session = useSession()
  const canCreate = can(session.permissions, session.isSuper, 'invoice.create')
  const { data } = useInvoices()
  const [newOpen, setNewOpen] = useState(false)
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null)

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Invoices"
        description="Drafts, finalized obligations and their payments — immutable lines, tax and numbering."
        actions={
          <>
            <Badge variant="secondary" className="rounded-none">
              Module 04 · Billing
            </Badge>
            {canCreate ? (
              <Button onClick={() => setNewOpen(true)}>
                <Plus />
                New invoice
              </Button>
            ) : null}
          </>
        }
      />

      <InvoiceMetrics invoices={data ?? []} />

      <InvoicesTable onMakePayment={(inv) => setPaymentTarget(inv)} />

      {newOpen ? (
        <Suspense fallback={null}>
          <NewInvoiceDialog open={newOpen} onOpenChange={setNewOpen} />
        </Suspense>
      ) : null}

      {paymentTarget ? (
        <Suspense fallback={null}>
          <RecordPaymentDialog
            open={!!paymentTarget}
            onOpenChange={(open) => {
              if (!open) setPaymentTarget(null)
            }}
            preSelectedCustomerId={paymentTarget.customer.id}
            preSelectedInvoiceId={paymentTarget.id}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
