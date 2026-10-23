import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StatusTone } from '@/components/ui/status-pill'

export interface InsightItem {
  id: string
  tone: StatusTone
  title: string
  detail?: string
  href: string
  icon: LucideIcon
}

/**
 * The "what needs attention" card. Three or fewer items, each with a single
 * next action, because a list of problems without a route out is just noise.
 */
export function InsightList({
  title = 'Needs attention',
  items,
  emptyText = 'Nothing needs attention right now.',
  className
}: {
  title?: string
  items: InsightItem[]
  emptyText?: string
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('border border-border bg-card', className)}>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-[0.875rem] text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.id}>
                <Link
                  to={item.href}
                  className="group flex items-start gap-2.5 px-4 py-3 hover:bg-muted/40"
                >
                  <Icon
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.875rem] font-medium">{item.title}</p>
                    {item.detail ? (
                      <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted-foreground">
                        {item.detail}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
