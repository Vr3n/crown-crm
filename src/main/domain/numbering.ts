import type { VoucherType } from '../../shared/contracts/vouchers'
import {
  formatVoucherNumber,
  nextSequenceValue,
  resolveNumberTokens,
  sequencePeriod,
  validateNumberingSetting,
  voucherNumberLength,
  type NumberResetPeriod
} from '../../shared/numbering'

export {
  formatVoucherNumber,
  nextSequenceValue,
  resolveNumberTokens,
  sequencePeriod,
  validateNumberingSetting,
  voucherNumberLength
}
export type { NumberResetPeriod }

export interface NumberingDefaults {
  label: string
  series: string
  prefix: string
  suffix: string
  padding: number
  startNumber: number
}

/**
 * Seeded series per voucher type. The owner can change any of these later; the
 * defaults must match the series used before numbering became configurable so
 * existing books keep their letters.
 */
export const NUMBERING_DEFAULTS: Record<VoucherType, NumberingDefaults> = {
  SALES: {
    label: 'Sales invoice',
    series: 'INV',
    prefix: 'INV/',
    suffix: '',
    padding: 4,
    startNumber: 1
  },
  PURCHASE: {
    label: 'Purchase bill',
    series: 'PUR',
    prefix: 'PUR/',
    suffix: '',
    padding: 4,
    startNumber: 1
  },
  RECEIPT: {
    label: 'Receipt',
    series: 'RCT',
    prefix: 'RCT/',
    suffix: '',
    padding: 4,
    startNumber: 1
  },
  PAYMENT: {
    label: 'Payment',
    series: 'PAY',
    prefix: 'PAY/',
    suffix: '',
    padding: 4,
    startNumber: 1
  },
  CREDIT_NOTE: {
    label: 'Credit note',
    series: 'CN',
    prefix: 'CN/',
    suffix: '',
    padding: 4,
    startNumber: 1
  },
  DEBIT_NOTE: {
    label: 'Debit note',
    series: 'DN',
    prefix: 'DN/',
    suffix: '',
    padding: 4,
    startNumber: 1
  },
  JOURNAL: {
    label: 'Journal',
    series: 'JV',
    prefix: 'JV/',
    suffix: '',
    padding: 4,
    startNumber: 1
  },
  CONTRA: {
    label: 'Contra',
    series: 'CTR',
    prefix: 'CTR/',
    suffix: '',
    padding: 4,
    startNumber: 1
  },
  OPENING: {
    label: 'Opening balances',
    series: 'OPN',
    prefix: 'OPN/',
    suffix: '',
    padding: 4,
    startNumber: 1
  }
}

export const VOUCHER_TYPE_ORDER: VoucherType[] = [
  'SALES',
  'PURCHASE',
  'RECEIPT',
  'PAYMENT',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'JOURNAL',
  'CONTRA',
  'OPENING'
]
