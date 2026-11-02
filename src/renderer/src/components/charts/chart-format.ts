import { formatMinor } from '@/lib/money'

/** Money for a chart's data table, exact and locale grouped. */
export function chartMoney(minor: number): string {
  return formatMinor(minor, 'INR')
}
