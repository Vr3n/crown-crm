import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SortDirection = false | 'asc' | 'desc'

/**
 * Table header sort control. The direction icon is always present so the
 * affordance survives hover-loss (never colour-only); it swaps with a short
 * transition to make the direction change feel responsive. Sorted headers
 * shift to the foreground tone for hierarchy.
 */
export function SortButton({
  sorted,
  onClick,
  className,
  children
}: {
  sorted: SortDirection
  onClick: () => void
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1 transition-colors',
        sorted
          ? 'font-medium text-foreground'
          : 'font-medium text-muted-foreground hover:text-foreground',
        className
      )}
    >
      {children}
      <Icon
        className={cn(
          'size-3.5 transition-all duration-200',
          sorted === false ? 'opacity-50' : 'opacity-100'
        )}
      />
    </button>
  )
}
