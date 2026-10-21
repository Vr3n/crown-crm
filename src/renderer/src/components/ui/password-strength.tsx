import * as React from 'react'
import { cn } from '@/lib/utils'

function scorePassword(value: string): number {
  let score = 0
  if (value.length >= 8) score += 1
  if (value.length >= 12) score += 1
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1
  return score
}

/**
 * Live password-strength indicator: a 3-segment bar plus a label, computed as the
 * user types. Renders nothing while the field is empty.
 */
export function PasswordStrength({
  value,
  className
}: {
  value: string
  className?: string
}): React.JSX.Element | null {
  const score = scorePassword(value)
  if (score === 0) return null

  const filled = score <= 1 ? 1 : score <= 3 ? 2 : 3
  const label = filled === 1 ? 'Weak' : filled === 2 ? 'Okay' : 'Strong'
  const bar = filled === 1 ? 'bg-amber-500' : filled === 2 ? 'bg-primary' : 'bg-green-600'
  const text =
    filled === 1
      ? 'text-amber-600 dark:text-amber-400'
      : filled === 2
        ? 'text-primary'
        : 'text-green-600 dark:text-green-400'

  return (
    <div className={cn('flex w-full items-center gap-2', className)}>
      <div className="flex flex-1 items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              i < filled ? bar : 'bg-muted'
            )}
          />
        ))}
      </div>
      <span className={cn('text-xs font-medium tabular-nums', text)}>{label}</span>
    </div>
  )
}
