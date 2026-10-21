import { CircleDollarSign, Clock3, ReceiptText, TriangleAlert } from 'lucide-react'
import { StatCard } from '@/components/stat-card'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { Invoice } from '../types'

/**
 * Invoice workbench KPIs (Module 09 §62). All numbers are derived from the
 * read model — never a maintained counter: billed is the sum of finalized
 * invoice totals (voids excluded), collected is the sum of allocations, and
 * outstanding is the sum of what still needs collecting.
 */
export function InvoiceMetrics({ invoices }: { invoices: Invoice[] }): React.JSX.Element {
  const currency = useCurrency()
  const active = invoices.filter((i) => i.status === 'OPEN' || i.status === 'PARTIALLY_PAID')
  const billed = invoices
    .filter((i) => i.status !== 'VOID' && i.status !== 'DRAFT')
    .reduce((sum, i) => sum + i.totalMinor, 0)
  const collected = invoices.reduce((sum, i) => sum + i.paidMinor, 0)
  const outstanding = active.reduce((sum, i) => sum + i.outstandingMinor, 0)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Total billed"
        value={formatMinor(billed, currency)}
        hint="Finalized invoices"
        icon={ReceiptText}
        tone="primary"
      />
      <StatCard
        label="Collected"
        value={formatMinor(collected, currency)}
        hint="Allocated payments"
        icon={CircleDollarSign}
        tone="success"
      />
      <StatCard
        label="Outstanding"
        value={formatMinor(outstanding, currency)}
        hint="Open + partially paid"
        icon={TriangleAlert}
        tone={outstanding > 0 ? 'warning' : 'default'}
      />
      <StatCard
        label="Awaiting payment"
        value={String(active.length)}
        hint="Invoices with a balance"
        icon={Clock3}
        tone="default"
      />
    </div>
  )
}
