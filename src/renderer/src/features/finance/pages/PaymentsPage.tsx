import { useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { PaymentsMetrics } from '../components/payments-metrics'
import { PaymentsFilters } from '../components/payments-filters'
import { PaymentsTable } from '../components/payments-table'
import { PaymentDetailSheet } from '../components/payment-detail-sheet'
import { RecordPaymentDialog } from '../components/record-payment-dialog'
import { filterPayments, type PaymentFilters as PaymentFilterState } from '../filters'
import { usePayments, useRefunds } from '../queries'
import type { Payment } from '../types'

const DEFAULT_FILTERS: PaymentFilterState = { method: 'ALL', status: 'ALL', search: '' }

/**
 * Payments (Module 05 §15–16) — the money-received workbench. Recorded payments
 * (not one-to-one with invoices) with explicit allocations, filterable by
 * allocation state and method, with a record drawer per payment and an inline
 * "Record payment" flow that spreads a single payment across invoices.
 */
export function PaymentsPage(): React.JSX.Element {
  const { data: payments, isLoading } = usePayments()
  const { data: refunds } = useRefunds()
  const [filters, setFilters] = useState<PaymentFilterState>(DEFAULT_FILTERS)
  const [recordOpen, setRecordOpen] = useState(false)
  const [selected, setSelected] = useState<Payment | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const visible = useMemo(() => filterPayments(payments ?? [], filters), [payments, filters])

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Payments"
        description="Money received, allocated across invoices, with refunds and credits kept separate."
        actions={
          <Button onClick={() => setRecordOpen(true)}>
            <Wallet />
            Record payment
          </Button>
        }
      />

      <PaymentsMetrics payments={payments ?? []} refunds={refunds ?? []} />

      <Card className="gap-0 py-0">
        <CardContent className="px-3 py-2.5">
          <PaymentsFilters payments={payments ?? []} filters={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardContent className="px-3 py-3">
          <PaymentsTable
            payments={visible}
            isLoading={isLoading}
            onOpen={(payment) => {
              setSelected(payment)
              setSheetOpen(true)
            }}
          />
        </CardContent>
      </Card>

      {recordOpen && <RecordPaymentDialog open={recordOpen} onOpenChange={setRecordOpen} />}

      <PaymentDetailSheet
        payment={selected}
        refunds={refunds ?? []}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  )
}
