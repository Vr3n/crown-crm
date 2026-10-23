import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type KpiTone = 'primary' | 'success' | 'warning' | 'stamp'

const TONES: Record<KpiTone, { rule: string; icon: string }> = {
  primary: { rule: 'border-t-primary', icon: 'text-primary' },
  success: { rule: 'border-t-success', icon: 'text-success' },
  warning: { rule: 'border-t-warning', icon: 'text-warning' },
  stamp: { rule: 'border-t-stamp', icon: 'text-stamp' }
}

/**
 * One decision metric. The label is a question the number answers; the context
 * line adds the interpretation so the figure never sits without meaning.
 */
export function KpiCard({
  label,
  value,
  context,
  icon: Icon,
  tone = 'primary'
}: {
  label: string
  value: React.ReactNode
  context?: string
  icon?: LucideIcon
  tone?: KpiTone
}): React.JSX.Element {
  const palette = TONES[tone]
  return (
    <div className={cn('ui-lift border-t-2 bg-card px-4 py-3.5', palette.rule)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        {Icon ? (
          <Icon className={cn('size-4', palette.icon)} strokeWidth={1.6} aria-hidden />
        ) : null}
      </div>
      <div className="mt-2 font-mono text-[1.375rem] leading-none tracking-tight tabular-nums">
        {value}
      </div>
      {context ? (
        <div className="mt-1.5 text-[0.75rem] leading-snug text-muted-foreground">{context}</div>
      ) : null}
    </div>
  )
}
