/**
 * Dashboard read model. Every figure is a query over posted rows; nothing is
 * stored. The renderer receives plain numbers and formats them at the edge.
 */
export interface SetupStep {
  id: 'numbering' | 'parties' | 'items' | 'opening' | 'purchase' | 'sale'
  label: string
  detail: string
  /** Points at the action itself, not just the page that owns it. */
  href: string
  /** Verb shown on the row, e.g. "Add a party". */
  cta: string
  done: boolean
}

export interface AttentionItem {
  id: string
  tone: 'warning' | 'destructive' | 'info'
  title: string
  detail: string
  href: string
}

export interface RecentVoucher {
  id: number
  type: string
  number: string
  date: string
  partyName: string | null
  totalMinor: number
}

export interface MonthlyTotals {
  /** YYYY-MM */
  month: string
  label: string
  salesMinor: number
  purchasesMinor: number
}

export interface AgeingBucket {
  bucket: 'Not due' | '1-30' | '31-60' | '61-90' | '90+'
  receivableMinor: number
  payableMinor: number
}

export interface DashboardSummary {
  partyCount: number
  itemCount: number
  voucherCount: number
  receivableMinor: number
  payableMinor: number
  cashBankMinor: number
  setup: {
    done: number
    total: number
    steps: SetupStep[]
  }
  attention: AttentionItem[]
  recentVouchers: RecentVoucher[]
  monthly: MonthlyTotals[]
  ageing: AgeingBucket[]
}
