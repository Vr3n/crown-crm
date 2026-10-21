import {
  Banknote,
  CreditCard,
  Ellipsis,
  FileText,
  Landmark,
  Smartphone,
  type LucideIcon
} from 'lucide-react'

/**
 * Payment method vocabulary (docs/modules 05 §15) shared by every finance
 * surface — invoice allocations and the daily-collection report both render
 * methods, so the label + icon live here once instead of being re-declared per
 * feature. Methods are configurable in the real system; this is the v1 set.
 */

export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER'

export const PAYMENT_METHODS: PaymentMethod[] = [
  'CASH',
  'UPI',
  'CARD',
  'BANK_TRANSFER',
  'CHEQUE',
  'OTHER'
]

export interface PaymentMethodMeta {
  label: string
  icon: LucideIcon
  /** Data-viz accent (hex) used by the collection report's stacked bar. */
  color: string
}

export const PAYMENT_METHOD_META: Record<PaymentMethod, PaymentMethodMeta> = {
  CASH: { label: 'Cash', icon: Banknote, color: '#4cc38a' },
  UPI: { label: 'UPI', icon: Smartphone, color: '#06b6d4' },
  CARD: { label: 'Card', icon: CreditCard, color: '#ff7eb6' },
  BANK_TRANSFER: { label: 'Bank transfer', icon: Landmark, color: '#a78bfa' },
  CHEQUE: { label: 'Cheque', icon: FileText, color: '#60a5fa' },
  OTHER: { label: 'Other', icon: Ellipsis, color: '#9ca3af' }
}
