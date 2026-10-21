import type { ComponentProps } from 'react'
import type { Badge } from '@/components/ui/badge'
import type { InvoiceStatus } from './types'

type BadgeTone = ComponentProps<typeof Badge>['variant']

/**
 * Per-status presentation. The blocky chip follows the table UI guide (no
 * rounded pills) and the semantic palette rule: green = settled, amber =
 * partial/attention, red = bad, neutral = inactive.
 */
export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Draft', tone: 'outline' },
  OPEN: { label: 'Open', tone: 'default' },
  PARTIALLY_PAID: { label: 'Partially paid', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  VOID: { label: 'Voided', tone: 'secondary' },
  UNCOLLECTIBLE: { label: 'Uncollectible', tone: 'destructive' }
}

/**
 * Statuses offered in the register filter ("all" is handled separately).
 * DRAFT is included: two-phase invoice creation leaves real draft rows that
 * staff must be able to find and finish.
 */
export const INVOICE_STATUS_OPTIONS = Object.keys(INVOICE_STATUS_META) as InvoiceStatus[]

/** Rows-per-page options for the invoice register table. */
export const INVOICE_PAGE_SIZES = [10, 20, 50]
