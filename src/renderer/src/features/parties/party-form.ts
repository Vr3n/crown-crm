import { z } from 'zod'
import { minorToMajor } from '@/lib/money'
import type { CreatePartyInput, PartyRow } from '../../../../shared/contracts/masters'

export interface PartyForm {
  name: string
  phone: string
  email: string
  gstin: string
  stateCode: string
  billingAddress: string
  isCustomer: boolean
  isSupplier: boolean
  creditDays: string
  creditLimit: string
  openingBalance: string
  openingDate: string
}

/** Rupees typed by the user to integer paise. Blank or invalid counts as zero. */
export function toMinor(value: string): number {
  const cleaned = value.replace(/[₹,\s]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export const blankPartyForm = (): PartyForm => ({
  name: '',
  phone: '',
  email: '',
  gstin: '',
  stateCode: '',
  billingAddress: '',
  isCustomer: true,
  isSupplier: false,
  creditDays: '0',
  creditLimit: '0',
  openingBalance: '0',
  openingDate: todayIso()
})

export function partyToForm(party: PartyRow): PartyForm {
  return {
    name: party.name,
    phone: party.phone ?? '',
    email: party.email ?? '',
    gstin: party.gstin ?? '',
    stateCode: party.stateCode ?? '',
    billingAddress: '',
    isCustomer: party.isCustomer,
    isSupplier: party.isSupplier,
    creditDays: String(party.creditDays),
    creditLimit: minorToMajor(party.creditLimitMinor, 'INR'),
    openingBalance: minorToMajor(party.openingBalanceMinor, 'INR'),
    openingDate: ''
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const partyFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Party name is required')
      .max(200, 'Keep it under 200 characters'),
    phone: z.string().trim().max(24, 'Keep it under 24 characters'),
    email: z
      .string()
      .trim()
      .refine((v) => !v || EMAIL_RE.test(v), 'Enter a valid email'),
    gstin: z
      .string()
      .trim()
      .refine((v) => !v || v.length === 15, 'GSTIN is 15 characters'),
    stateCode: z
      .string()
      .trim()
      .refine((v) => !v || /^\d{2}$/.test(v), 'Two digits, e.g. 27'),
    billingAddress: z.string().max(500),
    isCustomer: z.boolean(),
    isSupplier: z.boolean(),
    creditDays: z.string().refine((v) => {
      const days = Number(v)
      return Number.isInteger(days) && days >= 0 && days <= 365
    }, 'Enter 0 to 365 days'),
    creditLimit: z.string().refine((v) => toMinor(v) >= 0, 'Cannot be negative'),
    openingBalance: z
      .string()
      .refine((v) => Number.isFinite(Number(v.replace(/[₹,\s]/g, '') || 0)), 'Enter an amount'),
    openingDate: z.string()
  })
  .refine((form) => form.isCustomer || form.isSupplier, {
    message: 'Choose customer, supplier, or both',
    path: ['isCustomer']
  })

type FieldName = keyof PartyForm

/** Field-level rule reused for live blur/change validation. */
export function partyFieldError(name: FieldName, value: string | boolean): string | undefined {
  const shape = partyFormSchema.shape[name]
  const result = shape.safeParse(value)
  if (result.success) return undefined
  return result.error.issues[0]?.message
}

export function partyFormToInput(form: PartyForm): CreatePartyInput {
  return {
    name: form.name.trim(),
    phone: form.phone.trim() || null,
    email: form.email.trim().toLowerCase() || null,
    gstin: form.gstin.trim().toUpperCase() || null,
    stateCode: form.stateCode.trim() || null,
    isCustomer: form.isCustomer,
    isSupplier: form.isSupplier,
    creditDays: Number(form.creditDays),
    creditLimitMinor: toMinor(form.creditLimit),
    openingBalanceMinor: toMinor(form.openingBalance),
    openingBalanceDate: form.openingDate || null
  }
}
