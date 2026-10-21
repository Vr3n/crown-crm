import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { PAYMENT_METHODS } from '../constants'
import { allocationStatusOf } from '../build'
import type { PaymentFilters } from '../filters'
import type { Payment, PaymentAllocationStatus, PaymentMethod } from '../types'

const STATUS_TABS: { key: PaymentAllocationStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'FULLY_ALLOCATED', label: 'Allocated' },
  { key: 'PARTIALLY_ALLOCATED', label: 'Partial' },
  { key: 'UNALLOCATED', label: 'Unallocated' }
]

/**
 * Payments queue controls: allocation-status tabs with live counts (mirroring
 * the follow-ups page) plus a payment-method select. Free-text search lives in
 * the DataTable toolbar.
 */
export function PaymentsFilters({
  payments,
  filters,
  onChange
}: {
  payments: Payment[]
  filters: PaymentFilters
  onChange: (f: PaymentFilters) => void
}): React.JSX.Element {
  const count = (key: PaymentAllocationStatus | 'ALL'): number =>
    key === 'ALL' ? payments.length : payments.filter((p) => allocationStatusOf(p) === key).length

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        value={filters.status}
        onValueChange={(v) =>
          onChange({ ...filters, status: v as PaymentAllocationStatus | 'ALL' })
        }
      >
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                {count(t.key)}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="ml-auto">
        <Select
          value={filters.method}
          onValueChange={(v) => onChange({ ...filters, method: v as PaymentMethod | 'ALL' })}
        >
          <SelectTrigger size="sm" className="h-8 w-44 gap-1 rounded-md text-xs">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="ALL">All methods</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m.key} value={m.key}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
