import { getDb } from '../db/connection'
import { currentCompanyId } from '../auth/session'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import type { DashboardSummary } from '../../shared/contracts/dashboard'
import { handle } from './handle'

/**
 * Dashboard read model. Every number is a query over rows; nothing is stored.
 * The money figures use the allocation bridge, so they stay correct as soon as
 * Phase 3 starts posting vouchers.
 */
export function registerDashboardIpc(): void {
  handle(IPC_CHANNELS.DASHBOARD_SUMMARY, (): DashboardSummary => {
    const db = getDb()
    const companyId = currentCompanyId()

    const count = (table: string): number => {
      const row = db
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE company_id = ?`)
        .get(companyId) as { n: number } | undefined
      return row?.n ?? 0
    }

    const outstanding = (type: 'SALES' | 'PURCHASE'): number => {
      const row = db
        .prepare(
          `SELECT COALESCE(SUM(
             v.total_minor - COALESCE((
               SELECT SUM(a.amount_minor) FROM bill_allocations a WHERE a.to_voucher_id = v.id
             ), 0)
           ), 0) AS amount
           FROM vouchers v
           WHERE v.company_id = ? AND v.voucher_type = ? AND v.status = 'POSTED'`
        )
        .get(companyId, type) as { amount: number } | undefined
      return row?.amount ?? 0
    }

    const cashBank = db
      .prepare(
        `SELECT COALESCE(SUM(l.debit_minor - l.credit_minor), 0) AS amount
         FROM ledger_lines l
         JOIN accounts a ON a.id = l.account_id
         WHERE l.company_id = ? AND a.system_key IN ('CASH', 'BANK')`
      )
      .get(companyId) as { amount: number } | undefined

    return {
      partyCount: count('parties'),
      itemCount: count('items'),
      voucherCount: count('vouchers'),
      receivableMinor: outstanding('SALES'),
      payableMinor: outstanding('PURCHASE'),
      cashBankMinor: cashBank?.amount ?? 0
    }
  })
}
