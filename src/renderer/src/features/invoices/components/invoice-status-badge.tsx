import { Badge } from '@/components/ui/badge'
import { INVOICE_STATUS_META } from '../constants'
import type { InvoiceStatus } from '../types'

/**
 * Blocky (0-radius) status chip, per the table UI guide. Tone follows the
 * semantic money/status palette: green = settled, amber = partial, red = bad,
 * neutral = inactive.
 */
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }): React.JSX.Element {
  const meta = INVOICE_STATUS_META[status]
  return (
    <Badge variant={meta.tone} className="rounded-none px-2.5 py-1 tabular-nums">
      {meta.label}
    </Badge>
  )
}
