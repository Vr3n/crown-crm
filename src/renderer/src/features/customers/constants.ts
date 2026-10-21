import type { BillingFrequency, CustomerStatus, MembershipStatus } from './types'

/**
 * Module 02 — reference data. The plan catalog is a listing convenience (Module
 * 03 owns the real plan entity): memberships snapshot their commercial terms,
 * so nothing financial is ever recomputed from these rows.
 */
export interface PlanDef {
  id: string
  name: string
  price: number
  durationMonths: number
  billingFrequency: BillingFrequency
  registrationFee: number
}

export const PLANS: PlanDef[] = [
  {
    id: 'p-basic',
    name: 'Monthly Basic',
    price: 1500,
    durationMonths: 1,
    billingFrequency: 'MONTHLY',
    registrationFee: 500
  },
  {
    id: 'p-premium',
    name: 'Monthly Premium',
    price: 2000,
    durationMonths: 1,
    billingFrequency: 'MONTHLY',
    registrationFee: 500
  },
  {
    id: 'p-quarterly',
    name: 'Quarterly Premium',
    price: 5400,
    durationMonths: 3,
    billingFrequency: 'QUARTERLY',
    registrationFee: 500
  },
  {
    id: 'p-half-yearly',
    name: 'Half-Yearly',
    price: 9600,
    durationMonths: 6,
    billingFrequency: 'HALF_YEARLY',
    registrationFee: 0
  },
  {
    id: 'p-annual',
    name: 'Annual Premium',
    price: 24000,
    durationMonths: 12,
    billingFrequency: 'ANNUAL',
    registrationFee: 0
  },
  {
    id: 'p-unlimited',
    name: 'Annual Unlimited',
    price: 30000,
    durationMonths: 12,
    billingFrequency: 'ANNUAL',
    registrationFee: 0
  },
  {
    id: 'p-student',
    name: 'Student Monthly',
    price: 1000,
    durationMonths: 1,
    billingFrequency: 'MONTHLY',
    registrationFee: 0
  },
  {
    id: 'p-couple',
    name: 'Couple Annual',
    price: 42000,
    durationMonths: 12,
    billingFrequency: 'ANNUAL',
    registrationFee: 0
  }
]

export const PLAN_NAMES = PLANS.map((p) => p.name)

/** Memberships expiring within this many days count as "due soon". */
export const EXPIRING_SOON_DAYS = 14

/** Status → label + tone, mirroring the stage-badge language. */
export const MEMBERSHIP_STATUS: Record<
  MembershipStatus,
  { label: string; tone: 'default' | 'primary' | 'success' | 'warning' | 'destructive' }
> = {
  PENDING: { label: 'Pending', tone: 'warning' },
  ACTIVE: { label: 'Active', tone: 'success' },
  FROZEN: { label: 'Frozen', tone: 'primary' },
  EXPIRED: { label: 'Expired', tone: 'default' },
  CANCELLED: { label: 'Cancelled', tone: 'default' },
  TERMINATED: { label: 'Terminated', tone: 'destructive' }
}

export const CUSTOMER_STATUS: Record<
  CustomerStatus,
  { label: string; tone: 'default' | 'primary' | 'success' | 'warning' | 'destructive' }
> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  FROZEN: { label: 'Frozen', tone: 'primary' },
  PENDING: { label: 'Pending', tone: 'warning' },
  EXPIRED: { label: 'Expired', tone: 'default' },
  NONE: { label: 'No plan', tone: 'default' }
}

export const OWNERS: { id: string; name: string }[] = [
  { id: 'priya', name: 'Priya Verma' },
  { id: 'arjun', name: 'Arjun Mehta' },
  { id: 'sana', name: 'Sana Shaikh' }
]
