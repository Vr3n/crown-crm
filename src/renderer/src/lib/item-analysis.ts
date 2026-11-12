/**
 * Item analysis.
 *
 * Every function is pure. Money stays in integer minor units, quantities stay
 * in E4 (1 unit = 10,000) and formatting happens only at the component edge.
 * The same `StockFlowRow` rows feed the Items ranking, the Stock filters and
 * the Item Detail charts, so one movement ledger answers every question.
 */

import type { ItemRow } from '../../../shared/contracts/masters'
import type { StockFlowRow } from '../../../shared/contracts/reports'
import { grossFromExclusive, splitInclusivePrice } from '../../../shared/price'

/** The windows offered by the analysis controls. */
export const ANALYSIS_WINDOWS = [30, 60, 90, 180] as const
export type AnalysisWindow = (typeof ANALYSIS_WINDOWS)[number]

/**
 * The shared label vocabulary, keyed by the label itself so a page can look up
 * `REORDER_LABELS[state]` without a second map.
 */
export const REORDER_LABELS = {
  Service: 'Service',
  Out: 'Out',
  Low: 'Low',
  'In stock': 'In stock'
} as const

export type ReorderState = (typeof REORDER_LABELS)[keyof typeof REORDER_LABELS]

/** Status tones for the shared reorder vocabulary. */
export const REORDER_TONES: Record<ReorderState, 'success' | 'warning' | 'destructive' | 'info'> = {
  [REORDER_LABELS['In stock']]: 'success',
  [REORDER_LABELS.Low]: 'warning',
  [REORDER_LABELS.Out]: 'destructive',
  [REORDER_LABELS.Service]: 'info'
}

/**
 * Service first, then out of stock, then at or below a set reorder level, then
 * in stock. A zero reorder level means "not set", not "low".
 */
export function reorderState(
  item: Pick<ItemRow, 'isService' | 'stockQtyE4' | 'reorderLevelE4'>
): ReorderState {
  if (item.isService) return REORDER_LABELS.Service
  if (item.stockQtyE4 <= 0) return REORDER_LABELS.Out
  if (item.reorderLevelE4 > 0 && item.stockQtyE4 <= item.reorderLevelE4) {
    return REORDER_LABELS.Low
  }
  return REORDER_LABELS['In stock']
}

export interface ItemMargin {
  /** The sale price with tax extracted, which is what margin is measured on. */
  saleTaxableMinor: number
  /** The price the customer pays, tax included. */
  saleGrossMinor: number
  /** Purchase price plus the input tax that is not recoverable. */
  landedCostMinor: number
  /** Whole percent, or null when there is no landed cost to compare against. */
  marginPercent: number | null
}

/** Margin is calculated for services too; only a zero landed cost hides it. */
export function itemMargin(item: ItemRow): ItemMargin {
  const sale = item.salePriceIncludesTax
    ? splitInclusivePrice(item.salePriceMinor, item.gstRateBps, item.cessRateBps)
    : grossFromExclusive(item.salePriceMinor, item.gstRateBps, item.cessRateBps)
  const purchase = item.purchasePriceIncludesTax
    ? splitInclusivePrice(item.purchasePriceMinor, item.gstRateBps, item.cessRateBps)
    : grossFromExclusive(item.purchasePriceMinor, item.gstRateBps, item.cessRateBps)

  return {
    saleTaxableMinor: sale.taxableMinor,
    saleGrossMinor: sale.grossMinor,
    landedCostMinor: purchase.grossMinor,
    marginPercent:
      purchase.grossMinor > 0
        ? Math.round(((sale.taxableMinor - purchase.grossMinor) / purchase.grossMinor) * 100)
        : null
  }
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

/**
 * Date-only UTC arithmetic for a date-only string. No local timezone enters the
 * calculation, so the result does not drift on a machine east or west of UTC.
 * An unparseable date is returned unchanged rather than inventing a window.
 */
export function windowStart(today: string, days: number): string {
  const match = DATE_KEY.exec(today)
  if (!match) return today
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return today
  const daysBack = Math.max(0, Math.trunc(days))
  return new Date(Date.UTC(year, month - 1, day) - daysBack * DAY_MS).toISOString().slice(0, 10)
}

/** Every movement row for one item, in the order the RPC returned them. */
export function itemFlow(rows: StockFlowRow[], itemId: number): StockFlowRow[] {
  return rows.filter((row) => row.itemId === itemId)
}

export interface ItemAnalysis {
  item: ItemRow
  /** The analysis window, stated on the row for the page caption. */
  windowDays: number
  from: string
  to: string
  margin: ItemMargin
  marginPercent: number | null
  /** Gross margin per unit times outward quantity in the window. */
  contributionMinor: number
  /** Stock on hand divided by average daily outward quantity, or null. */
  coverDays: number | null
  lastOutwardDate: string | null
  outwardQtyE4: number
  reorder: ReorderState
  /** True when no outward movement happened in the window. */
  dead: boolean
}

export interface AnalysisOptions {
  today: string
  windowDays: number
}

/**
 * Analyse each item from the raw movement ledger. Movement rows outside the
 * window are ignored here as well as by the RPC, so a wider read is safe.
 */
export function analyseItems(
  items: ItemRow[],
  flow: StockFlowRow[],
  { today, windowDays }: AnalysisOptions
): ItemAnalysis[] {
  const from = windowStart(today, windowDays)
  const byItem = new Map<number, StockFlowRow[]>()
  for (const row of flow) {
    const rows = byItem.get(row.itemId) ?? []
    rows.push(row)
    byItem.set(row.itemId, rows)
  }

  return items.map((item) => {
    const margin = itemMargin(item)
    const rows = (byItem.get(item.id) ?? []).filter((row) => row.date >= from && row.date <= today)

    let outwardQtyE4 = 0
    let lastOutwardDate: string | null = null
    for (const row of rows) {
      if (row.qtyOutE4 <= 0) continue
      outwardQtyE4 += row.qtyOutE4
      if (lastOutwardDate === null || row.date > lastOutwardDate) {
        lastOutwardDate = row.date
      }
    }

    const coverDays =
      outwardQtyE4 <= 0
        ? null
        : item.stockQtyE4 <= 0
          ? 0
          : Math.round((item.stockQtyE4 * windowDays * 10) / outwardQtyE4) / 10

    return {
      item,
      windowDays,
      from,
      to: today,
      margin,
      marginPercent: margin.marginPercent,
      contributionMinor: Math.round(
        ((margin.saleTaxableMinor - margin.landedCostMinor) * outwardQtyE4) / 10_000
      ),
      coverDays,
      lastOutwardDate,
      outwardQtyE4,
      reorder: reorderState(item),
      dead: outwardQtyE4 === 0
    }
  })
}

/**
 * Tracked goods with no outward movement in the window. Service items are not
 * stock, so they never appear as dead stock.
 */
export function deadStock(
  rows: ItemAnalysis[],
  { windowDays = 90 }: { windowDays?: number } = {}
): ItemAnalysis[] {
  return rows.filter((row) => !row.item.isService && row.windowDays === windowDays && row.dead)
}

/** Largest outward quantity first. Items that did not move are not ranked. */
export function topMovers(rows: ItemAnalysis[], limit = 5): ItemAnalysis[] {
  return rows
    .filter((row) => !row.item.isService && row.outwardQtyE4 > 0)
    .sort(
      (a, b) =>
        b.outwardQtyE4 - a.outwardQtyE4 ||
        b.contributionMinor - a.contributionMinor ||
        a.item.name.localeCompare(b.item.name)
    )
    .slice(0, Math.max(0, limit))
}
