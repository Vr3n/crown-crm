import type { BillingFrequency, DiscountType, OfferLifecycle, PlanDuration, Plan } from './types'
import { getPlanAvailability } from './components/catalog-status-badge'

export const DURATIONS: { value: PlanDuration; label: string; months: number }[] = [
  { value: 'MONTHLY', label: 'Monthly', months: 1 },
  { value: 'QUARTERLY', label: 'Quarterly', months: 3 },
  { value: 'HALF_YEARLY', label: 'Half yearly', months: 6 },
  { value: 'YEARLY', label: 'Yearly', months: 12 }
]

export const durationLabel = (duration: PlanDuration): string =>
  DURATIONS.find((d) => d.value === duration)?.label ?? duration

export const BILLING_FREQUENCIES: { value: BillingFrequency; label: string }[] = [
  { value: 'ONE_TIME', label: 'One time' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half yearly' },
  { value: 'YEARLY', label: 'Yearly' }
]

export const billingFrequencyLabel = (billing: BillingFrequency): string =>
  BILLING_FREQUENCIES.find((b) => b.value === billing)?.label ?? billing

export const DISCOUNT_TYPES: { value: DiscountType; label: string }[] = [
  { value: 'PERCENTAGE', label: 'Percentage' },
  { value: 'FIXED_AMOUNT', label: 'Fixed amount' },
  { value: 'OVERRIDE_PRICE', label: 'Override price' },
  { value: 'FREE_PERIOD', label: 'Free period' }
]

export const discountTypeLabel = (type: DiscountType): string =>
  DISCOUNT_TYPES.find((d) => d.value === type)?.label ?? type

export const ACCESS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL_HOURS', label: 'All hours' },
  { value: 'TIMED', label: 'Timed window' }
]

export const FREE_PERIOD_MONTHS = [1, 3] as const

export interface PlanStatus {
  value: 'ALL' | 'ACTIVE' | 'INACTIVE'
  label: string
}

export const filterPlansByStatus = <T extends { isActive: boolean }>(
  plans: T[],
  status: 'ALL' | 'ACTIVE' | 'INACTIVE'
): T[] => {
  if (status === 'ALL') return plans
  return plans.filter((plan) => (status === 'ACTIVE') === plan.isActive)
}

export type PlanAvailabilityFilter = 'ALL' | 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'INACTIVE'

export const filterPlansByAvailability = (
  plans: Plan[],
  filter: PlanAvailabilityFilter
): Plan[] => {
  if (filter === 'ALL') return plans
  return plans.filter((plan) => getPlanAvailability(plan) === filter)
}

export const OFFER_LIFECYCLES: { value: OfferLifecycle; label: string }[] = [
  { value: 'LIVE', label: 'Live' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'ENDED', label: 'Ended' },
  { value: 'PAUSED', label: 'Paused' }
]
