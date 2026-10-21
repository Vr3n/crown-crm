import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { RevenueRow } from '../build'

const TONE_GRADIENT: Record<string, { start: string; end: string }> = {
  primary: { start: 'var(--primary)', end: 'var(--primary)' },
  success: { start: 'var(--success)', end: 'var(--primary)' },
  destructive: { start: 'var(--destructive)', end: 'var(--warning)' }
}

/**
 * Revenue breakdown (Module 09 §63) — a shared card used for "by plan" and "by
 * staff". Rows render largest first with a proportional bar and % of the total,
 * so the biggest revenue lines read at a glance.
 */
export function RevenueBreakdownCard({
  title,
  icon: Icon,
  tone,
  rows
}: {
  title: string
  icon: LucideIcon
  tone: 'primary' | 'success' | 'destructive'
  rows: RevenueRow[]
}): React.JSX.Element {
  const total = rows.reduce((s, r) => s + r.amountMinor, 0)
  const currency = useCurrency()
  const toneClass =
    tone === 'success'
      ? 'bg-success/10 text-success'
      : tone === 'destructive'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-primary/10 text-primary'
  const gradient = TONE_GRADIENT[tone]

  return (
    <Card
      className="crm-gradient-border"
      style={
        {
          '--gradient-start': gradient.start,
          '--gradient-end': gradient.end
        } as React.CSSProperties
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className={`flex size-9 items-center justify-center rounded-md ${toneClass}`}>
            <Icon className="size-5" />
          </span>
          <span className="font-heading text-lg">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        <p className="font-mono text-2xl font-semibold tabular-nums">
          {formatMinor(total, currency)}
        </p>
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-medium">{row.label}</span>
                <span className="font-mono text-xs tabular-nums">
                  {formatMinor(row.amountMinor, currency)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${total > 0 ? (row.amountMinor / total) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-9 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                  {total > 0 ? Math.round((row.amountMinor / total) * 100) : 0}%
                </span>
              </div>
            </div>
          ))}
          {!rows.length ? (
            <p className="text-xs text-muted-foreground">No billed revenue to show.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
