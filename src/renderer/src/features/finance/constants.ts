import type { LucideIcon } from 'lucide-react'
import { Banknote, CreditCard, Landmark, MoreHorizontal, NotebookPen, QrCode } from 'lucide-react'
import type { InvoiceStatus, PaymentMethod } from './types'

/** Configurable payment methods (Module 05 §15) with their icon + display label. */
export const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: LucideIcon }[] = [
  { key: 'CASH', label: 'Cash', icon: Banknote },
  { key: 'UPI', label: 'UPI', icon: QrCode },
  { key: 'CARD', label: 'Card', icon: CreditCard },
  { key: 'BANK_TRANSFER', label: 'Bank transfer', icon: Landmark },
  { key: 'CHEQUE', label: 'Cheque', icon: NotebookPen },
  { key: 'OTHER', label: 'Other', icon: MoreHorizontal }
]

export const METHOD_ICON: Record<PaymentMethod, LucideIcon> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.key, m.icon])
) as Record<PaymentMethod, LucideIcon>

export const METHOD_LABEL: Record<PaymentMethod, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.key, m.label])
) as Record<PaymentMethod, string>

export type StatusBadgeTone = 'default' | 'secondary' | 'success' | 'warning' | 'destructive'

/** Invoice lifecycle labels + badge tones for receivable reporting. */
export const INVOICE_STATUS_META: Record<
  InvoiceStatus,
  { label: string; tone: Exclude<StatusBadgeTone, 'destructive'> }
> = {
  OPEN: { label: 'Open', tone: 'warning' },
  PARTIALLY_PAID: { label: 'Partial', tone: 'default' },
  PAID: { label: 'Paid', tone: 'success' },
  VOID: { label: 'Void', tone: 'secondary' }
}

/** Allocation state labels + badge tones for the payments table. */
export const ALLOCATION_STATUS_META: Record<
  'FULLY_ALLOCATED' | 'PARTIALLY_ALLOCATED' | 'UNALLOCATED',
  { label: string; tone: StatusBadgeTone }
> = {
  FULLY_ALLOCATED: { label: 'Fully allocated', tone: 'success' },
  PARTIALLY_ALLOCATED: { label: 'Partially allocated', tone: 'warning' },
  UNALLOCATED: { label: 'Unallocated', tone: 'secondary' }
}

/** Credit state labels + badge tones. */
export const CREDIT_STATUS_META: Record<
  'AVAILABLE' | 'PARTIALLY_APPLIED' | 'APPLIED',
  { label: string; tone: StatusBadgeTone }
> = {
  AVAILABLE: { label: 'Available', tone: 'default' },
  PARTIALLY_APPLIED: { label: 'Partially applied', tone: 'warning' },
  APPLIED: { label: 'Applied', tone: 'success' }
}
