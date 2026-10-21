import { StatusBadge } from '@/features/customers/components/status-badge'
import type { Offer, Plan } from '../types'
import { offerLifecycle } from '../pricing'

export type PlanAvailability = 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'INACTIVE'

export function getPlanAvailability(plan: Plan, now: Date = new Date()): PlanAvailability {
  if (!plan.isActive) return 'INACTIVE'
  const today = now.toISOString().slice(0, 10)
  if (plan.availableFrom && plan.availableFrom > today) return 'UPCOMING'
  if (plan.availableTo && plan.availableTo < today) return 'EXPIRED'
  return 'ACTIVE'
}

export function PlanStatusBadge({
  plan,
  isActive
}: {
  plan?: Plan
  isActive: boolean
}): React.JSX.Element {
  if (plan) {
    const availability = getPlanAvailability(plan)
    const cfg = {
      ACTIVE: { label: 'Available', tone: 'success' as const },
      UPCOMING: { label: 'Upcoming', tone: 'primary' as const },
      EXPIRED: { label: 'Expired', tone: 'default' as const },
      INACTIVE: { label: 'Inactive', tone: 'default' as const }
    }
    return <StatusBadge label={cfg[availability].label} tone={cfg[availability].tone} />
  }
  return isActive ? (
    <StatusBadge label="Active" tone="success" />
  ) : (
    <StatusBadge label="Inactive" tone="default" />
  )
}

export function OfferLifecycleBadge({ offer }: { offer: Offer }): React.JSX.Element {
  const lifecycle = offerLifecycle(offer)
  const cfg = {
    LIVE: { label: 'Live', tone: 'success' },
    UPCOMING: { label: 'Upcoming', tone: 'primary' },
    ENDED: { label: 'Expired', tone: 'default' },
    PAUSED: { label: 'Paused', tone: 'warning' }
  } as const
  return <StatusBadge label={cfg[lifecycle].label} tone={cfg[lifecycle].tone} />
}
