/**
 * Report chart shaping.
 *
 * Every function here is pure and keeps money in integer minor units. The same
 * rows the table renders are the rows the charts read, so a chart total and the
 * table total come from one source. Formatting happens at the component edge.
 */

import type { ProfitLossMonth, RegisterRow } from '../../../../shared/contracts/reports'

/** Bucket labels, in order, matching `splitBucket` in the Rust report module. */
export const AGEING_BUCKETS = ['0-30', '31-60', '61-90', '91-180', '180+'] as const

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
] as const

const MONTH_KEY = /^(\d{4})-(\d{2})$/

/** `2026-04-17` becomes `2026-04`. */
export function monthKeyOf(date: string): string {
  return date.slice(0, 7)
}

/** `2026-04` becomes `Apr 2026`. */
export function monthLabel(key: string): string {
  const match = MONTH_KEY.exec(key)
  if (!match) return key
  const month = Number(match[2])
  if (month < 1 || month > 12) return key
  return `${MONTH_NAMES[month - 1]} ${match[1]}`
}

/**
 * Every month touched by a date range, inclusive, ascending. Returns an empty
 * array for an unparseable or reversed range, so a bad control never produces
 * an invented axis.
 */
export function monthKeysBetween(from: string, to: string): string[] {
  const start = MONTH_KEY.exec(monthKeyOf(from))
  const end = MONTH_KEY.exec(monthKeyOf(to))
  if (!start || !end) return []

  let year = Number(start[1])
  let month = Number(start[2])
  const endIndex = Number(end[1]) * 12 + (Number(end[2]) - 1)
  if (month < 1 || month > 12 || Number(end[2]) < 1 || Number(end[2]) > 12) return []
  if (year * 12 + (month - 1) > endIndex) return []

  const keys: string[] = []
  while (year * 12 + (month - 1) <= endIndex) {
    keys.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month === 13) {
      month = 1
      year += 1
    }
  }
  return keys
}

export interface RegisterMonth {
  key: string
  label: string
  taxableMinor: number
  taxMinor: number
  cgstMinor: number
  sgstMinor: number
  igstMinor: number
  totalMinor: number
}

/**
 * Aggregate register rows into one point per month in the period.
 *
 * Months without documents are present with zeros so the time axis stays
 * continuous. `taxMinor` is CGST + SGST + IGST; `totalMinor` is the invoice
 * total as posted, which may differ from taxable plus tax by round off.
 */
export function monthlyRegisterSeries(
  rows: RegisterRow[],
  from: string,
  to: string
): RegisterMonth[] {
  const months = new Map<string, RegisterMonth>()
  for (const key of monthKeysBetween(from, to)) {
    months.set(key, {
      key,
      label: monthLabel(key),
      taxableMinor: 0,
      taxMinor: 0,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
      totalMinor: 0
    })
  }

  for (const row of rows) {
    const key = monthKeyOf(row.date)
    const month = months.get(key) ?? {
      key,
      label: monthLabel(key),
      taxableMinor: 0,
      taxMinor: 0,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
      totalMinor: 0
    }
    month.taxableMinor += row.taxableMinor
    month.cgstMinor += row.cgstMinor
    month.sgstMinor += row.sgstMinor
    month.igstMinor += row.igstMinor
    month.taxMinor += row.cgstMinor + row.sgstMinor + row.igstMinor
    month.totalMinor += row.totalMinor
    months.set(key, month)
  }

  return [...months.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export interface StackedRow {
  /** Category on the shared axis: a month, an ageing bucket or a party. */
  x: string
  /** The stack layer. */
  series: string
  valueMinor: number
}

/** Sum the five ageing buckets across parties. Missing buckets are zero. */
export function bucketTotals(rows: { bucketsMinor: number[] }[]): number[] {
  return AGEING_BUCKETS.map((_, index) =>
    rows.reduce((sum, row) => sum + (row.bucketsMinor[index] ?? 0), 0)
  )
}

/** One stacked bar whose layers are the five ageing buckets. */
export function bucketSlices(
  buckets: number[],
  category = 'Outstanding'
): StackedRow[] {
  return AGEING_BUCKETS.map((bucket, index) => ({
    x: category,
    series: bucket,
    valueMinor: buckets[index] ?? 0
  }))
}

/** Tax split layers for a monthly register, ready for stacked bars. */
export function taxSplitRows(months: RegisterMonth[]): StackedRow[] {
  return months.flatMap((month) => [
    { x: month.label, series: 'CGST', valueMinor: month.cgstMinor },
    { x: month.label, series: 'SGST', valueMinor: month.sgstMinor },
    { x: month.label, series: 'IGST', valueMinor: month.igstMinor }
  ])
}

/** Tax layers with nothing to show: used to skip an empty chart. */
export function hasTax(months: RegisterMonth[]): boolean {
  return months.some((month) => month.taxMinor !== 0)
}

export interface RankedItem {
  label: string
  valueMinor: number
}

/**
 * Largest first, ties keep their input order, zero and negative values are
 * dropped because they carry no rank meaning here. `limit` is the number of
 * real rows to keep.
 */
export function rankedItems<T>(
  rows: T[],
  labelOf: (row: T) => string,
  valueOf: (row: T) => number,
  limit: number
): RankedItem[] {
  return rows
    .map((row) => ({ label: labelOf(row), valueMinor: valueOf(row) }))
    .filter((row) => row.valueMinor > 0)
    .sort((a, b) => b.valueMinor - a.valueMinor)
    .slice(0, limit)
}

export interface AgeingParty {
  label: string
  bucketsMinor: number[]
  totalMinor: number
}

/**
 * Largest parties first, with everything past `limit` folded into one
 * "Other parties" row. Folding keeps the chart's bucket totals equal to the
 * table's bucket totals instead of silently dropping rows.
 */
export function ageingParties(
  rows: { partyName: string; bucketsMinor: number[]; totalMinor: number }[],
  limit = 10
): AgeingParty[] {
  const sorted = [...rows].sort((a, b) => b.totalMinor - a.totalMinor)
  const kept = sorted.slice(0, limit).map((row) => ({
    label: row.partyName,
    bucketsMinor: AGEING_BUCKETS.map((_, index) => row.bucketsMinor[index] ?? 0),
    totalMinor: row.totalMinor
  }))
  const rest = sorted.slice(limit)
  if (rest.length === 0) return kept

  const buckets = bucketTotals(rest)
  const total = rest.reduce((sum, row) => sum + row.totalMinor, 0)
  if (total === 0) return kept
  return [...kept, { label: `Other parties (${rest.length})`, bucketsMinor: buckets, totalMinor: total }]
}

/** Stacked bars with one row per party and buckets as the layers. */
export function ageingStackRows(parties: AgeingParty[]): StackedRow[] {
  return parties.flatMap((party) =>
    AGEING_BUCKETS.map((bucket, index) => ({
      x: party.label,
      series: bucket,
      valueMinor: party.bucketsMinor[index] ?? 0
    }))
  )
}

export interface ProfitMonthPoint {
  key: string
  label: string
  incomeMinor: number
  expenseMinor: number
  netProfitMinor: number
}

/**
 * Expand the P&L monthly series to every month in the period. Months the RPC
 * did not return are zero-filled; a month outside the requested range is kept
 * rather than dropped, because the RPC is the source of the numbers.
 */
export function profitMonthlySeries(
  monthly: ProfitLossMonth[],
  from: string,
  to: string
): ProfitMonthPoint[] {
  const range = monthKeysBetween(from, to)
  const keys = range.length > 0 ? range : [...new Set(monthly.map((point) => point.month))].sort()
  const byKey = new Map(monthly.map((point) => [point.month, point]))

  return keys.map((key) => {
    const point = byKey.get(key)
    return {
      key,
      label: monthLabel(key),
      incomeMinor: point?.incomeMinor ?? 0,
      expenseMinor: point?.expenseMinor ?? 0,
      netProfitMinor: point?.netProfitMinor ?? 0
    }
  })
}

/**
 * Expense accounts largest first, with the tail folded into "Other expenses"
 * so the composition sums to the reported total expense.
 */
export function expenseComposition(
  expenses: { name: string; debitMinor: number }[],
  limit = 8
): RankedItem[] {
  const ranked = rankedItems(expenses, (row) => row.name, (row) => row.debitMinor, expenses.length)
  if (ranked.length <= limit) return ranked

  const kept = ranked.slice(0, limit)
  const rest = ranked.slice(limit)
  const remainder = rest.reduce((sum, row) => sum + row.valueMinor, 0)
  if (remainder === 0) return kept
  return [...kept, { label: `Other expenses (${rest.length})`, valueMinor: remainder }]
}

export interface TrialBalanceGroup {
  name: string
  debitMinor: number
  creditMinor: number
}

/**
 * Debit and credit totals per account group, in group-name order. Accounts with
 * no movement are ignored, so the group list is the same set of groups the
 * detail table actually shows.
 */
export function trialBalanceGroups(
  rows: { groupName: string; debitMinor: number; creditMinor: number }[]
): TrialBalanceGroup[] {
  const groups = new Map<string, TrialBalanceGroup>()
  for (const row of rows) {
    if (row.debitMinor === 0 && row.creditMinor === 0) continue
    const group = groups.get(row.groupName) ?? {
      name: row.groupName,
      debitMinor: 0,
      creditMinor: 0
    }
    group.debitMinor += row.debitMinor
    group.creditMinor += row.creditMinor
    groups.set(row.groupName, group)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export type OpenBalanceStatus = 'overdue' | 'due-soon' | 'current'

/** Overdue wins over due-soon; anything else is current. */
export function openBalanceStatus(row: {
  overdueMinor: number
  dueWithin7Minor: number
}): OpenBalanceStatus {
  if (row.overdueMinor > 0) return 'overdue'
  if (row.dueWithin7Minor > 0) return 'due-soon'
  return 'current'
}

export type AmountTone = 'negative' | 'positive' | 'zero'

/** Money tone: negative, positive (credit) or zero, for the table's colour. */
export function amountTone(minor: number): AmountTone {
  if (minor < 0) return 'negative'
  if (minor > 0) return 'positive'
  return 'zero'
}
