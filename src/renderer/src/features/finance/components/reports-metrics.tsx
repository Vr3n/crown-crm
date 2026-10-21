import { CalendarClock, Landmark, ReceiptText, Undo2 } from 'lucide-react'
import { isSameDay, isSameMonth, sum } from '../build'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { FinanceMetric } from './finance-metric'
import type { FinanceInvoice, Payment, Refund } from '../types'

/**
 * Reports headline (Module 09 §62). Collections today and this month, what is
 * still owed across open invoices, and what left the business in refunds.
 */
export function ReportsMetrics({
  payments,
  invoices,
  refunds
}: {
  payments: Payment[]
  invoices: FinanceInvoice[]
  refunds: Refund[]
}): React.JSX.Element {
  const now = new Date()
  const currency = useCurrency()
  const today = payments.filter((p) => isSameDay(p.paymentDate, now))
  const month = payments.filter((p) => isSameMonth(p.paymentDate, now))
  const monthRefunds = refunds.filter(
    (r) => r.status === 'ISSUED' && isSameMonth(r.refundDate, now)
  )
  const dues = invoices.reduce((s, i) => s + i.totalMinor - i.paidMinor, 0)

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <FinanceMetric
        icon={CalendarClock}
        label="Collected today"
        value={formatMinor(sum(today), currency)}
        hint={`${today.length} payments`}
      />
      <FinanceMetric
        icon={Landmark}
        label="Collected this month"
        value={formatMinor(sum(month), currency)}
        hint={`${month.length} payments`}
      />
      <FinanceMetric
        icon={ReceiptText}
        label="Outstanding dues"
        value={formatMinor(dues, currency)}
        hint="Open + partially paid invoices"
        tone="destructive"
      />
      <FinanceMetric
        icon={Undo2}
        label="Refunds this month"
        value={`-${formatMinor(sum(monthRefunds), currency)}`}
        hint={`${monthRefunds.length} refunds`}
        tone="muted"
      />
    </div>
  )
}
