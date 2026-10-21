import { displayPhone } from '@/features/leads/format'
import type { CustomerRef } from '../types'

/**
 * Customer column. The name is the hierarchy lead (bold, per the table UI
 * guide); the phone is demoted to a small muted line. An em dash is shown
 * only when no phone is known.
 */
export function InvoiceCustomerCell({ customer }: { customer: CustomerRef }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-semibold">{customer.name}</span>
      {customer.phone ? (
        <span className="text-xs tabular-nums text-muted-foreground">
          {displayPhone(customer.phone)}
        </span>
      ) : null}
    </div>
  )
}
