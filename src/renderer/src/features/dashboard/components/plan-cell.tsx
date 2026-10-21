import { formatDate } from '@/features/leads/format'
import { cn } from '@/lib/utils'

/**
 * Plan column. The plan name is the hierarchy lead; the purchase date is
 * demoted to a small muted line (abbreviated month) so it reads as metadata,
 * not noise. The optional `className` lets a card align the column (e.g.
 * `items-end` for right-justified tables).
 */
export function PlanCell({
  plan,
  purchasedAt,
  className
}: {
  plan: string
  purchasedAt: string
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-sm font-medium">{plan}</span>
      <span className="text-xs text-muted-foreground">Bought {formatDate(purchasedAt)}</span>
    </div>
  )
}
