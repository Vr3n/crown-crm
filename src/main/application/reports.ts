import { currentCompanyId, requirePermission } from '../auth/session'
import { PERMISSIONS } from '../db/permissions'
import { reportRepo } from '../repositories/reports'
import { voucherRepo } from '../repositories/vouchers'
import type {
  AgeingRow,
  BalanceSheetReport,
  ProfitLossReport,
  ReceivableRow,
  StatementRow,
  TrialBalanceRow
} from '../../shared/contracts/reports'

function splitBucket(days: number): number {
  if (days <= 30) return 0
  if (days <= 60) return 1
  if (days <= 90) return 2
  if (days <= 180) return 3
  return 4
}

export const reports = {
  trialBalance(): TrialBalanceRow[] {
    requirePermission(PERMISSIONS.REPORT_VIEW)
    return reportRepo.trialBalance(currentCompanyId())
  },

  profitLoss(from: string, to: string): ProfitLossReport {
    requirePermission(PERMISSIONS.REPORT_VIEW)
    const rows = reportRepo.periodBalances(currentCompanyId(), from, to)
    const income = rows
      .filter((row) => row.type === 'INCOME')
      .map((row) => ({
        ...row,
        debitMinor: 0,
        creditMinor: row.creditMinor - row.debitMinor
      }))
      .filter((row) => row.creditMinor !== 0)
    const expenses = rows
      .filter((row) => row.type === 'EXPENSE')
      .map((row) => ({
        ...row,
        debitMinor: row.debitMinor - row.creditMinor,
        creditMinor: 0
      }))
      .filter((row) => row.debitMinor !== 0)

    const totalIncomeMinor = income.reduce((sum, row) => sum + row.creditMinor, 0)
    const totalExpenseMinor = expenses.reduce((sum, row) => sum + row.debitMinor, 0)
    return {
      income,
      expenses,
      totalIncomeMinor,
      totalExpenseMinor,
      netProfitMinor: totalIncomeMinor - totalExpenseMinor
    }
  },

  balanceSheet(from: string, to: string): BalanceSheetReport {
    requirePermission(PERMISSIONS.REPORT_VIEW)
    const rows = reportRepo.periodBalances(currentCompanyId(), from, to)
    const assets = rows
      .filter((row) => row.type === 'ASSET')
      .map((row) => ({ ...row, creditMinor: 0, debitMinor: row.debitMinor - row.creditMinor }))
      .filter((row) => row.debitMinor !== 0)
    const liabilities = rows
      .filter((row) => row.type === 'LIABILITY')
      .map((row) => ({ ...row, debitMinor: 0, creditMinor: row.creditMinor - row.debitMinor }))
      .filter((row) => row.creditMinor !== 0)
    const equity = rows
      .filter((row) => row.type === 'EQUITY')
      .map((row) => ({ ...row, debitMinor: 0, creditMinor: row.creditMinor - row.debitMinor }))
      .filter((row) => row.creditMinor !== 0)

    const profit = this.profitLoss(from, to).netProfitMinor
    const totalAssets = assets.reduce((sum, row) => sum + row.debitMinor, 0)
    const totalLiabilities = liabilities.reduce((sum, row) => sum + row.creditMinor, 0)
    const totalEquity = equity.reduce((sum, row) => sum + row.creditMinor, 0) + profit

    return {
      assets,
      liabilities,
      equity,
      totalAssetsMinor: totalAssets,
      totalLiabilitiesMinor: totalLiabilities,
      totalEquityMinor: totalEquity,
      differenceMinor: totalAssets - (totalLiabilities + totalEquity)
    }
  },

  receivables(asOf = today()): ReceivableRow[] {
    return this.aging(asOf, 'DUE_DATE')
  },

  payables(asOf = today()): ReceivableRow[] {
    requirePermission(PERMISSIONS.REPORT_VIEW)
    const bills = voucherRepo.outstanding(currentCompanyId(), {
      asOf,
      basis: 'DUE_DATE',
      kind: 'PAYABLE'
    })
    return groupBills(bills)
  },

  aging(asOf = today(), basis: 'BILL_DATE' | 'DUE_DATE' = 'DUE_DATE'): ReceivableRow[] {
    requirePermission(PERMISSIONS.REPORT_VIEW)
    const bills = voucherRepo.outstanding(currentCompanyId(), {
      asOf,
      basis,
      kind: 'RECEIVABLE'
    })
    return groupBills(bills)
  },

  ageingBuckets(asOf = today(), basis: 'BILL_DATE' | 'DUE_DATE' = 'DUE_DATE'): AgeingRow[] {
    requirePermission(PERMISSIONS.REPORT_VIEW)
    const bills = voucherRepo.outstanding(currentCompanyId(), {
      asOf,
      basis,
      kind: 'RECEIVABLE'
    })
    const map = new Map<number, AgeingRow>()
    for (const bill of bills) {
      const row =
        map.get(bill.partyId) ??
        ({
          partyId: bill.partyId,
          partyName: bill.partyName,
          bucketsMinor: [0, 0, 0, 0, 0],
          totalMinor: 0
        } satisfies AgeingRow)
      row.bucketsMinor[splitBucket(bill.daysOverdue)] += bill.outstandingMinor
      row.totalMinor += bill.outstandingMinor
      map.set(bill.partyId, row)
    }
    return [...map.values()].sort((a, b) => b.totalMinor - a.totalMinor)
  },

  statement(partyId: number, from: string, to: string): StatementRow[] {
    requirePermission(PERMISSIONS.REPORT_VIEW)
    return reportRepo.partyStatement(currentCompanyId(), partyId, from, to)
  },

  partyOpening(partyId: number, before: string): number {
    requirePermission(PERMISSIONS.REPORT_VIEW)
    return reportRepo.partyOpening(currentCompanyId(), partyId, before)
  },

  register(type: 'SALES' | 'PURCHASE', from: string, to: string) {
    requirePermission(PERMISSIONS.REPORT_VIEW)
    return reportRepo.register(currentCompanyId(), type, from, to)
  },

  stockSummary() {
    requirePermission(PERMISSIONS.REPORT_VIEW)
    return reportRepo.stockSummary(currentCompanyId())
  },

  stockMovements(itemId: number, from: string, to: string) {
    requirePermission(PERMISSIONS.REPORT_VIEW)
    return reportRepo.stockMovements(currentCompanyId(), itemId, from, to)
  }
}

function groupBills(
  bills: { partyId: number; partyName: string; outstandingMinor: number; daysOverdue: number }[]
): ReceivableRow[] {
  const map = new Map<number, ReceivableRow>()
  for (const bill of bills) {
    const row =
      map.get(bill.partyId) ??
      ({
        partyId: bill.partyId,
        partyName: bill.partyName,
        notDueMinor: 0,
        overdueMinor: 0,
        totalMinor: 0
      } satisfies ReceivableRow)
    if (bill.daysOverdue > 0) row.overdueMinor += bill.outstandingMinor
    else row.notDueMinor += bill.outstandingMinor
    row.totalMinor += bill.outstandingMinor
    map.set(bill.partyId, row)
  }
  return [...map.values()].sort((a, b) => b.totalMinor - a.totalMinor)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
