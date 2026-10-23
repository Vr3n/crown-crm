import type { LucideIcon } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { toneForPath } from '@/lib/module-tone'

/**
 * Composed empty state (plan §10). A successful pause, not a system failure.
 * Centered icon inside a pale contextual circle, strong title, one-line
 * supporting explanation, and an optional action button. The icon uses a
 * restrained float animation that respects prefers-reduced-motion.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}): React.JSX.Element {
  const location = useLocation()
  const tone = toneForPath(location.pathname)

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center',
        className
      )}
    >
      <div className={cn('crm-float flex size-12 items-center justify-center rounded-full', tone.soft)}>
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 font-heading text-sm font-semibold">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
