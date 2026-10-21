import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared page header: title + description on the left, contextual actions on the
 * right. Global actions (search, theme, account) stay in the topbar; this is the
 * per-page action area (CSS Crème "page actions vs global actions" split).
 */
export function PageHeader({
  title,
  description,
  actions,
  className
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="font-heading text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
