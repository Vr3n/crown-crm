import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TONE_GRADIENT: Record<string, { start: string; end: string } | null> = {
  default: null,
  primary: { start: 'var(--primary)', end: 'var(--primary)' },
  success: { start: 'var(--success)', end: 'var(--primary)' },
  warning: { start: 'var(--warning)', end: 'var(--primary)' },
  destructive: { start: 'var(--destructive)', end: 'var(--warning)' }
}

/**
 * KPI / stat tile. Money values render in mono + tabular-nums so columns scan on
 * a single edge (visual-density rule). `tone` maps to the semantic money/status
 * palette only; no rainbow accents.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default'
}: {
  label: string
  value?: string
  hint?: string
  icon: LucideIcon
  tone?: 'default' | 'success' | 'warning' | 'destructive' | 'primary'
}): React.JSX.Element {
  const toneClass = {
    default: 'text-foreground',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive'
  }[tone]
  const gradient = TONE_GRADIENT[tone]

  return (
    <div
      className={cn(
        'crm-gradient-border flex flex-col justify-between gap-3 rounded-lg border bg-card p-4'
      )}
      style={
        gradient
          ? ({
              '--gradient-start': gradient.start,
              '--gradient-end': gradient.end
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Icon className="size-4 shrink-0 text-muted-foreground/60" />
      </div>
      <div className="min-w-0">
        {value ? (
          <p
            className={cn(
              'truncate font-mono text-2xl font-semibold tabular-nums tracking-tight',
              toneClass
            )}
          >
            {value}
          </p>
        ) : (
          <p className="truncate font-mono text-2xl tabular-nums text-muted-foreground/40">--</p>
        )}
        {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  )
}
