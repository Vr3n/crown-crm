export interface TrialBalanceRow {
  id: number
  name: string
  groupName: string
  type: string
  debitMinor: number
  creditMinor: number
}

export interface StatementRow {
  date: string
  type: string
  number: string
  narration: string | null
  debitMinor: number
  creditMinor: number
  balanceMinor: number
}

export interface RegisterRow {
  id: number
  date: string
  number: string
  partyName: string | null
  taxableMinor: number
  cgstMinor: number
  sgstMinor: number
  igstMinor: number
  roundOffMinor: number
  totalMinor: number
  status: string
}

export interface StockRow {
  id: number
  name: string
  uom: string | null
  qtyE4: number
  valueMinor: number
}

export interface StockMovementRow {
  id: number
  voucherId: number
  date: string
  number: string
  type: string
  partyName: string | null
  qtyInE4: number
  qtyOutE4: number
  unitCostMinor: number
  narration: string | null
}

export interface ReceivableRow {
  partyId: number
  partyName: string
  notDueMinor: number
  overdueMinor: number
  totalMinor: number
  /**
   * Outstanding by age bucket: 0-30, 31-60, 61-90, 91-180, 180+.
   * Every bill is bucketed, not only the overdue ones, so the first bucket
   * includes bills that are not due yet.
   */
  bucketsMinor: number[]
  /** Outstanding on bills due today or in the next seven days. */
  dueWithin7Minor: number
  /** Outstanding on bills due today or in the next thirty days. */
  dueWithin30Minor: number
}

export interface AgeingRow {
  partyId: number
  partyName: string
  bucketsMinor: number[]
  totalMinor: number
}

/**
 * One month of P&L movement. `month` is `YYYY-MM`. Opening balances are folded
 * into the first month so the series always sums to the report totals; months
 * without ledger activity are filled by the renderer.
 */
export interface ProfitLossMonth {
  month: string
  incomeMinor: number
  expenseMinor: number
  netProfitMinor: number
}

export interface ProfitLossReport {
  income: TrialBalanceRow[]
  expenses: TrialBalanceRow[]
  totalIncomeMinor: number
  totalExpenseMinor: number
  netProfitMinor: number
  monthly: ProfitLossMonth[]
}

export interface BalanceSheetReport {
  assets: TrialBalanceRow[]
  liabilities: TrialBalanceRow[]
  equity: TrialBalanceRow[]
  totalAssetsMinor: number
  totalLiabilitiesMinor: number
  totalEquityMinor: number
  differenceMinor: number
}

export interface ReportRangeInput {
  from: string
  to: string
}
