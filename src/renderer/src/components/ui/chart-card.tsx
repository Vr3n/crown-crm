import { cn } from '@/lib/utils'

/**
 * A chart with a title and one-line question it answers. Charts are the visual
 * layer over a table, never the only source of the number.
 */
export function ChartCard({
  title,
  subtitle,
  children,
  className
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('min-w-0 border border-border bg-card p-4', className)}>
      <div className="mb-3">
        <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-[0.75rem] text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  )
}
