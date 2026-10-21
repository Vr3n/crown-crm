import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CUSTOMER_STATUS, MEMBERSHIP_STATUS } from '../constants'
import type { CustomerStatus, MembershipStatus } from '../types'

const toneClass: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/10 text-destructive'
}

/** Shared status pill — mirrors the stage-badge language (tone + dot + label). */
export function StatusBadge({
  label,
  tone,
  icon,
  className
}: {
  label: string
  tone: keyof typeof toneClass
  icon?: LucideIcon
  className?: string
}): React.JSX.Element {
  const Icon = icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        toneClass[tone],
        className
      )}
    >
      {Icon ? <Icon className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
      {label}
    </span>
  )
}

export function MembershipStatusBadge({
  status,
  className
}: {
  status: MembershipStatus
  className?: string
}): React.JSX.Element {
  const cfg = MEMBERSHIP_STATUS[status]
  return <StatusBadge label={cfg.label} tone={cfg.tone} className={className} />
}

export function CustomerStatusBadge({
  status,
  className
}: {
  status: CustomerStatus
  className?: string
}): React.JSX.Element {
  const cfg = CUSTOMER_STATUS[status]
  return <StatusBadge label={cfg.label} tone={cfg.tone} className={className} />
}
