import { BadgeCheck, PiggyBank, Undo2 } from 'lucide-react'
import { creditApplied, creditRemaining, isSameMonth, sum } from '../build'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { FinanceMetric } from './finance-metric'
import type { Credit, Refund } from '../types'

/**
 * Refunds & Credits headline (Module 05 §17–18). The two money-out flows stay
 * visually distinct: refunds leave the business (destructive tone), credits are
 * value kept inside it (cyan / green tones).
 */
export function RefundsMetrics({
  refunds,
  credits
}: {
  refunds: Refund[]
  credits: Credit[]
}): React.JSX.Element {
  const now = new Date()
  const currency = useCurrency()
  // Scheduled (future) and voided refunds never moved money — metrics count ISSUED only.
  const issued = refunds.filter((r) => r.status === 'ISSUED')
  const monthRefunds = issued.filter((r) => isSameMonth(r.refundDate, now))
  const available = credits.reduce((s, c) => s + creditRemaining(c), 0)
  const applied = credits.reduce((s, c) => s + creditApplied(c), 0)

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <FinanceMetric
        icon={Undo2}
        label="Refunds this month"
        value={`-${formatMinor(sum(monthRefunds), currency)}`}
        hint={`${monthRefunds.length} refunds`}
        tone="destructive"
      />
      <FinanceMetric
        icon={Undo2}
        label="Refunds · all time"
        value={`-${formatMinor(sum(issued), currency)}`}
        hint={`${issued.length} refunds`}
        tone="muted"
      />
      <FinanceMetric
        icon={PiggyBank}
        label="Credit available"
        value={formatMinor(available, currency)}
        hint="Can be applied to future invoices"
      />
      <FinanceMetric
        icon={BadgeCheck}
        label="Credit applied"
        value={formatMinor(applied, currency)}
        tone="success"
      />
    </div>
  )
}
