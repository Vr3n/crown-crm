import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { toneForPath } from '@/lib/module-tone'

/**
 * Shared page header: title + description on the left, contextual actions on the
 * right. Global actions (search, theme, account) stay in the topbar; this is the
 * per-page action area (CSS Crème "page actions vs global actions" split).
 *
 * A 2px rule in the module accent gives each area a recognisable top edge
 * without changing the neutral body.
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
  const location = useLocation()
  const tone = toneForPath(location.pathname)

  return (
    <div className={cn('border-t-2 pt-3', tone.rule, className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-[1.5rem] font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 text-[0.9375rem] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
