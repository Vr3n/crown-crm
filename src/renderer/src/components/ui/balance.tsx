import { cn } from '@/lib/utils'
import { formatMinor } from '@/lib/money'

/**
 * A ledger balance with a Dr/Cr marker. Positive is Dr (money in), negative is
 * Cr (money out). Bold by default so balances stand out from body text, and
 * the amount is always tabular for easy scanning.
 */
export function Balance({
  minor,
  className,
  mutedWhenZero = true
}: {
  minor: number
  className?: string
  mutedWhenZero?: boolean
}): React.JSX.Element {
  if (minor === 0) {
    return (
      <span
        className={cn(
          'font-mono text-[0.875rem] font-semibold tabular-nums',
          mutedWhenZero && 'text-muted-foreground',
          className
        )}
      >
        {formatMinor(0, 'INR')}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'font-mono text-[0.875rem] font-semibold tabular-nums',
        minor > 0 ? 'text-success' : 'text-destructive',
        className
      )}
    >
      {formatMinor(Math.abs(minor), 'INR')}{' '}
      <span className="text-[0.6875rem] font-medium">{minor > 0 ? 'Dr' : 'Cr'}</span>
    </span>
  )
}
