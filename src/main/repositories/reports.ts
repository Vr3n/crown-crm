import { getDb } from '../db/connection'
import type {
  RegisterRow,
  StatementRow,
  StockMovementRow,
  StockRow,
  TrialBalanceRow
} from '../../shared/contracts/reports'

/** Report queries. Everything is computed from posted rows; nothing is stored. */

export type { RegisterRow, StatementRow, StockMovementRow, StockRow, TrialBalanceRow }

export const reportRepo = {
  trialBalance(companyId: number): TrialBalanceRow[] {
    const rows = getDb()
      .prepare(
        `SELECT a.id, a.name, g.name AS group_name, a.type,
           CASE WHEN a.opening_balance_side = 'DEBIT' THEN a.opening_balance_minor ELSE 0 END
             + COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN l.debit_minor ELSE 0 END), 0) AS debit_minor,
           CASE WHEN a.opening_balance_side = 'CREDIT' THEN a.opening_balance_minor ELSE 0 END
             + COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN l.credit_minor ELSE 0 END), 0) AS credit_minor
         FROM accounts a
         JOIN account_groups g ON g.id = a.group_id
         LEFT JOIN ledger_lines l ON l.account_id = a.id
         LEFT JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
         WHERE a.company_id = ?
         GROUP BY a.id
         ORDER BY g.sort_order, a.name COLLATE NOCASE`
      )
      .all(companyId) as Record<string, unknown>[]
    return rows.map((row) => ({
      id: row.id as number,
      name: row.name as string,
      groupName: row.group_name as string,
      type: row.type as string,
      debitMinor: Number(row.debit_minor ?? 0),
      creditMinor: Number(row.credit_minor ?? 0)
    }))
  },

  periodBalances(companyId: number, from: string, to: string): TrialBalanceRow[] {
    const rows = getDb()
      .prepare(
        `SELECT a.id, a.name, g.name AS group_name, a.type,
           CASE WHEN a.opening_balance_side = 'DEBIT' THEN a.opening_balance_minor ELSE 0 END
             + COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN l.debit_minor ELSE 0 END), 0) AS debit_minor,
           CASE WHEN a.opening_balance_side = 'CREDIT' THEN a.opening_balance_minor ELSE 0 END
             + COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN l.credit_minor ELSE 0 END), 0) AS credit_minor
         FROM accounts a
         JOIN account_groups g ON g.id = a.group_id
         LEFT JOIN ledger_lines l ON l.account_id = a.id
         LEFT JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
           AND v.voucher_date BETWEEN ? AND ?
         WHERE a.company_id = ?
         GROUP BY a.id
         ORDER BY g.sort_order, a.name COLLATE NOCASE`
      )
      .all(from, to, companyId) as Record<string, unknown>[]
    return rows.map((row) => ({
      id: row.id as number,
      name: row.name as string,
      groupName: row.group_name as string,
      type: row.type as string,
      debitMinor: Number(row.debit_minor ?? 0),
      creditMinor: Number(row.credit_minor ?? 0)
    }))
  },

  partyStatement(companyId: number, partyId: number, from: string, to: string): StatementRow[] {
    const opening = getDb()
      .prepare(
        `SELECT COALESCE(SUM(l.debit_minor - l.credit_minor), 0) AS balance
         FROM ledger_lines l
         JOIN party_accounts pa ON pa.account_id = l.account_id
         JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
         WHERE l.company_id = ? AND pa.party_id = ? AND v.voucher_date < ?`
      )
      .get(companyId, partyId, from) as { balance: number }

    const rows = getDb()
      .prepare(
        `SELECT v.voucher_date AS date, v.voucher_type AS type, v.number,
                v.narration, l.debit_minor, l.credit_minor
         FROM ledger_lines l
         JOIN party_accounts pa ON pa.account_id = l.account_id
         JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
         WHERE l.company_id = ? AND pa.party_id = ? AND v.voucher_date BETWEEN ? AND ?
         ORDER BY v.voucher_date, v.id`
      )
      .all(companyId, partyId, from, to) as Array<{
      date: string
      type: string
      number: string
      narration: string | null
      debit_minor: number
      credit_minor: number
    }>

    let balance = opening.balance
    return rows.map((row) => {
      balance += row.debit_minor - row.credit_minor
      return {
        date: row.date,
        type: row.type,
        number: row.number,
        narration: row.narration,
        debitMinor: row.debit_minor,
        creditMinor: row.credit_minor,
        balanceMinor: balance
      }
    })
  },

  partyOpening(companyId: number, partyId: number, before: string): number {
    const row = getDb()
      .prepare(
        `SELECT COALESCE(SUM(l.debit_minor - l.credit_minor), 0) AS balance
         FROM ledger_lines l
         JOIN party_accounts pa ON pa.account_id = l.account_id
         JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
         WHERE l.company_id = ? AND pa.party_id = ? AND v.voucher_date < ?`
      )
      .get(companyId, partyId, before) as { balance: number }
    return row.balance
  },

  register(companyId: number, type: 'SALES' | 'PURCHASE', from: string, to: string): RegisterRow[] {
    const rows = getDb()
      .prepare(
        `SELECT v.id, v.voucher_date, v.number, p.name AS party_name, v.taxable_minor,
                v.cgst_minor, v.sgst_minor, v.igst_minor, v.round_off_minor, v.total_minor, v.status
         FROM vouchers v LEFT JOIN parties p ON p.id = v.party_id
         WHERE v.company_id = ? AND v.voucher_type = ? AND v.status = 'POSTED'
           AND v.voucher_date BETWEEN ? AND ?
         ORDER BY v.voucher_date, v.id`
      )
      .all(companyId, type, from, to) as Record<string, unknown>[]
    return rows.map((row) => ({
      id: row.id as number,
      date: row.voucher_date as string,
      number: row.number as string,
      partyName: (row.party_name as string) ?? null,
      taxableMinor: Number(row.taxable_minor),
      cgstMinor: Number(row.cgst_minor),
      sgstMinor: Number(row.sgst_minor),
      igstMinor: Number(row.igst_minor),
      roundOffMinor: Number(row.round_off_minor),
      totalMinor: Number(row.total_minor),
      status: row.status as string
    }))
  },

  stockMovements(companyId: number, itemId: number, from: string, to: string): StockMovementRow[] {
    const rows = getDb()
      .prepare(
        `SELECT m.id, v.id AS voucher_id, v.voucher_date AS date, v.number, v.voucher_type AS type,
                p.name AS party_name, m.qty_in_e4, m.qty_out_e4, m.unit_cost_minor,
                v.narration
         FROM stock_movements m
         JOIN vouchers v ON v.id = m.voucher_id AND v.status = 'POSTED'
         LEFT JOIN parties p ON p.id = v.party_id
         WHERE m.company_id = ? AND m.item_id = ? AND v.voucher_date BETWEEN ? AND ?
         ORDER BY v.voucher_date, v.id, m.id`
      )
      .all(companyId, itemId, from, to) as Record<string, unknown>[]
    return rows.map((row) => ({
      id: row.id as number,
      voucherId: row.voucher_id as number,
      date: row.date as string,
      number: row.number as string,
      type: row.type as string,
      partyName: (row.party_name as string) ?? null,
      qtyInE4: Number(row.qty_in_e4 ?? 0),
      qtyOutE4: Number(row.qty_out_e4 ?? 0),
      unitCostMinor: Number(row.unit_cost_minor ?? 0),
      narration: (row.narration as string) ?? null
    }))
  },

  stockSummary(companyId: number): StockRow[] {
    const rows = getDb()
      .prepare(
        `SELECT i.id, i.name, u.name AS uom,
           COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN m.qty_in_e4 - m.qty_out_e4 ELSE 0 END), 0) AS qty,
           COALESCE(SUM(CASE WHEN v.id IS NOT NULL
             THEN m.qty_in_e4 * m.unit_cost_minor - m.qty_out_e4 * m.unit_cost_minor ELSE 0 END), 0) / 10000 AS value
         FROM items i
         LEFT JOIN units u ON u.id = i.uom_id
         LEFT JOIN stock_movements m ON m.item_id = i.id
         LEFT JOIN vouchers v ON v.id = m.voucher_id AND v.status = 'POSTED'
         WHERE i.company_id = ? AND i.is_service = 0
         GROUP BY i.id
         ORDER BY i.name COLLATE NOCASE`
      )
      .all(companyId) as Record<string, unknown>[]
    return rows.map((row) => ({
      id: row.id as number,
      name: row.name as string,
      uom: (row.uom as string) ?? null,
      qtyE4: Number(row.qty ?? 0),
      valueMinor: Number(row.value ?? 0)
    }))
  }
}
