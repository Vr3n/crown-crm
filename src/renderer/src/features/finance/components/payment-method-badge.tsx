import { cn } from '@/lib/utils'
import { METHOD_ICON, METHOD_LABEL } from '../constants'
import type { PaymentMethod } from '../types'

/**
 * Payment-method pill: a neutral chip with a leading method icon + label. One
 * visual family for methods across the payments, refunds and reports tables.
 */
export function PaymentMethodBadge({
  method,
  className
}: {
  method: PaymentMethod
  className?: string
}): React.JSX.Element {
  const Icon = METHOD_ICON[method]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground/80',
        className
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      {METHOD_LABEL[method]}
    </span>
  )
}
