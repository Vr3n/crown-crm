//! Report SQL. Mirrors `src/main/repositories/reports.ts` plus the
//! `voucherRepo.outstanding` query that receivables, payables and ageing use.
//!
//! Every query is read-only and scoped to one company. Money is integer paise;
//! quantities are scaled by 10,000.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

use crate::error::AppResult;

/// An account with its stored opening balance folded into the debit/credit
/// pair, exactly as the trial balance and P&L queries return it.
#[derive(Debug, Clone)]
pub struct AccountBalance {
    pub id: i64,
    pub name: String,
    pub group_name: String,
    pub account_type: String,
    pub debit_minor: i64,
    pub credit_minor: i64,
}

impl AccountBalance {
    /// `TrialBalanceRow` with overridden figures (P&L and balance sheet net the
    /// opposite side away).
    pub fn to_json(&self, debit_minor: i64, credit_minor: i64) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "groupName": self.group_name,
            "type": self.account_type,
            "debitMinor": debit_minor,
            "creditMinor": credit_minor
        })
    }
}

#[derive(Debug, Clone)]
pub struct StatementRow {
    pub date: String,
    pub voucher_type: String,
    pub number: String,
    pub narration: Option<String>,
    pub debit_minor: i64,
    pub credit_minor: i64,
}

#[derive(Debug, Clone)]
pub struct RegisterRow {
    pub id: i64,
    pub date: String,
    pub number: String,
    pub party_name: Option<String>,
    pub taxable_minor: i64,
    pub cgst_minor: i64,
    pub sgst_minor: i64,
    pub igst_minor: i64,
    pub round_off_minor: i64,
    pub total_minor: i64,
    pub status: String,
}

impl RegisterRow {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "date": self.date,
            "number": self.number,
            "partyName": self.party_name,
            "taxableMinor": self.taxable_minor,
            "cgstMinor": self.cgst_minor,
            "sgstMinor": self.sgst_minor,
            "igstMinor": self.igst_minor,
            "roundOffMinor": self.round_off_minor,
            "totalMinor": self.total_minor,
            "status": self.status
        })
    }
}

#[derive(Debug, Clone)]
pub struct StockRow {
    pub id: i64,
    pub name: String,
    pub uom: Option<String>,
    pub qty_e4: i64,
    pub value_minor: i64,
}

impl StockRow {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "uom": self.uom,
            "qtyE4": self.qty_e4,
            "valueMinor": self.value_minor
        })
    }
}

#[derive(Debug, Clone)]
pub struct StockMovementRow {
    pub id: i64,
    pub voucher_id: i64,
    pub date: String,
    pub number: String,
    pub voucher_type: String,
    pub party_name: Option<String>,
    pub qty_in_e4: i64,
    pub qty_out_e4: i64,
    pub unit_cost_minor: i64,
    pub narration: Option<String>,
}

impl StockMovementRow {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "voucherId": self.voucher_id,
            "date": self.date,
            "number": self.number,
            "type": self.voucher_type,
            "partyName": self.party_name,
            "qtyInE4": self.qty_in_e4,
            "qtyOutE4": self.qty_out_e4,
            "unitCostMinor": self.unit_cost_minor,
            "narration": self.narration
        })
    }
}

/// One open bill from `voucherRepo.outstanding`.
#[derive(Debug, Clone)]
pub struct OpenBill {
    pub party_id: i64,
    pub party_name: String,
    pub outstanding_minor: i64,
    pub days_overdue: i64,
}

fn map_account_balance(row: &rusqlite::Row<'_>) -> rusqlite::Result<AccountBalance> {
    Ok(AccountBalance {
        id: row.get(0)?,
        name: row.get(1)?,
        group_name: row.get(2)?,
        account_type: row.get(3)?,
        debit_minor: row.get(4)?,
        credit_minor: row.get(5)?,
    })
}

pub fn trial_balance(conn: &Connection, company_id: i64) -> AppResult<Vec<AccountBalance>> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.name, g.name AS group_name, a.type,
           CASE WHEN a.opening_balance_side = 'DEBIT' THEN a.opening_balance_minor ELSE 0 END
             + COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN l.debit_minor ELSE 0 END), 0) AS debit_minor,
           CASE WHEN a.opening_balance_side = 'CREDIT' THEN a.opening_balance_minor ELSE 0 END
             + COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN l.credit_minor ELSE 0 END), 0) AS credit_minor
         FROM accounts a
         JOIN account_groups g ON g.id = a.group_id
         LEFT JOIN ledger_lines l ON l.account_id = a.id
         LEFT JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
         WHERE a.company_id = ?1
         GROUP BY a.id
         ORDER BY g.sort_order, a.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map(params![company_id], map_account_balance)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn period_balances(
    conn: &Connection,
    company_id: i64,
    from: &str,
    to: &str,
) -> AppResult<Vec<AccountBalance>> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.name, g.name AS group_name, a.type,
           CASE WHEN a.opening_balance_side = 'DEBIT' THEN a.opening_balance_minor ELSE 0 END
             + COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN l.debit_minor ELSE 0 END), 0) AS debit_minor,
           CASE WHEN a.opening_balance_side = 'CREDIT' THEN a.opening_balance_minor ELSE 0 END
             + COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN l.credit_minor ELSE 0 END), 0) AS credit_minor
         FROM accounts a
         JOIN account_groups g ON g.id = a.group_id
         LEFT JOIN ledger_lines l ON l.account_id = a.id
         LEFT JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
           AND v.voucher_date BETWEEN ?1 AND ?2
         WHERE a.company_id = ?3
         GROUP BY a.id
         ORDER BY g.sort_order, a.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map(params![from, to, company_id], map_account_balance)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// Balance before `before` for one party, from posted ledger lines.
pub fn party_opening(conn: &Connection, company_id: i64, party_id: i64, before: &str) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(l.debit_minor - l.credit_minor), 0) AS balance
         FROM ledger_lines l
         JOIN party_accounts pa ON pa.account_id = l.account_id
         JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
         WHERE l.company_id = ?1 AND pa.party_id = ?2 AND v.voucher_date < ?3",
        params![company_id, party_id, before],
        |row| row.get(0),
    )?)
}

pub fn party_statement(
    conn: &Connection,
    company_id: i64,
    party_id: i64,
    from: &str,
    to: &str,
) -> AppResult<Vec<StatementRow>> {
    let mut stmt = conn.prepare(
        "SELECT v.voucher_date AS date, v.voucher_type AS type, v.number,
                v.narration, l.debit_minor, l.credit_minor
         FROM ledger_lines l
         JOIN party_accounts pa ON pa.account_id = l.account_id
         JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
         WHERE l.company_id = ?1 AND pa.party_id = ?2 AND v.voucher_date BETWEEN ?3 AND ?4
         ORDER BY v.voucher_date, v.id",
    )?;
    let rows = stmt.query_map(params![company_id, party_id, from, to], |row| {
        Ok(StatementRow {
            date: row.get(0)?,
            voucher_type: row.get(1)?,
            number: row.get(2)?,
            narration: row.get(3)?,
            debit_minor: row.get(4)?,
            credit_minor: row.get(5)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn register(
    conn: &Connection,
    company_id: i64,
    voucher_type: &str,
    from: &str,
    to: &str,
) -> AppResult<Vec<RegisterRow>> {
    let mut stmt = conn.prepare(
        "SELECT v.id, v.voucher_date, v.number, p.name AS party_name, v.taxable_minor,
                v.cgst_minor, v.sgst_minor, v.igst_minor, v.round_off_minor, v.total_minor, v.status
         FROM vouchers v LEFT JOIN parties p ON p.id = v.party_id
         WHERE v.company_id = ?1 AND v.voucher_type = ?2 AND v.status = 'POSTED'
           AND v.voucher_date BETWEEN ?3 AND ?4
         ORDER BY v.voucher_date, v.id",
    )?;
    let rows = stmt.query_map(params![company_id, voucher_type, from, to], |row| {
        Ok(RegisterRow {
            id: row.get(0)?,
            date: row.get(1)?,
            number: row.get(2)?,
            party_name: row.get(3)?,
            taxable_minor: row.get(4)?,
            cgst_minor: row.get(5)?,
            sgst_minor: row.get(6)?,
            igst_minor: row.get(7)?,
            round_off_minor: row.get(8)?,
            total_minor: row.get(9)?,
            status: row.get(10)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn stock_movements(
    conn: &Connection,
    company_id: i64,
    item_id: i64,
    from: &str,
    to: &str,
) -> AppResult<Vec<StockMovementRow>> {
    let mut stmt = conn.prepare(
        "SELECT m.id, v.id AS voucher_id, v.voucher_date AS date, v.number, v.voucher_type AS type,
                p.name AS party_name, m.qty_in_e4, m.qty_out_e4, m.unit_cost_minor,
                v.narration
         FROM stock_movements m
         JOIN vouchers v ON v.id = m.voucher_id AND v.status = 'POSTED'
         LEFT JOIN parties p ON p.id = v.party_id
         WHERE m.company_id = ?1 AND m.item_id = ?2 AND v.voucher_date BETWEEN ?3 AND ?4
         ORDER BY v.voucher_date, v.id, m.id",
    )?;
    let rows = stmt.query_map(params![company_id, item_id, from, to], |row| {
        Ok(StockMovementRow {
            id: row.get(0)?,
            voucher_id: row.get(1)?,
            date: row.get(2)?,
            number: row.get(3)?,
            voucher_type: row.get(4)?,
            party_name: row.get(5)?,
            qty_in_e4: row.get(6)?,
            qty_out_e4: row.get(7)?,
            unit_cost_minor: row.get(8)?,
            narration: row.get(9)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn stock_summary(conn: &Connection, company_id: i64) -> AppResult<Vec<StockRow>> {
    let mut stmt = conn.prepare(
        "SELECT i.id, i.name, u.name AS uom,
           COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN m.qty_in_e4 - m.qty_out_e4 ELSE 0 END), 0) AS qty,
           COALESCE(SUM(CASE WHEN v.id IS NOT NULL
             THEN m.qty_in_e4 * m.unit_cost_minor - m.qty_out_e4 * m.unit_cost_minor ELSE 0 END), 0) / 10000 AS value
         FROM items i
         LEFT JOIN units u ON u.id = i.uom_id
         LEFT JOIN stock_movements m ON m.item_id = i.id
         LEFT JOIN vouchers v ON v.id = m.voucher_id AND v.status = 'POSTED'
         WHERE i.company_id = ?1 AND i.is_service = 0
         GROUP BY i.id
         ORDER BY i.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map(params![company_id], |row| {
        Ok(StockRow {
            id: row.get(0)?,
            name: row.get(1)?,
            uom: row.get(2)?,
            qty_e4: row.get(3)?,
            value_minor: row.get(4)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// Open bills for receivables (`RECEIVABLE`), payables (`PAYABLE`) or both
/// (`ALL`), exactly as `voucherRepo.outstanding` computes them.
pub fn outstanding_bills(
    conn: &Connection,
    company_id: i64,
    as_of: &str,
    basis: &str,
    kind: &str,
) -> AppResult<Vec<OpenBill>> {
    let type_filter = match kind {
        "ALL" => "v.voucher_type IN ('SALES','PURCHASE')",
        "PAYABLE" => "v.voucher_type = 'PURCHASE'",
        _ => "v.voucher_type = 'SALES'",
    };
    let sql = format!(
        "SELECT v.id, v.number, v.voucher_date, v.due_date, v.party_id, p.name AS party_name,
                v.total_minor,
                COALESCE((SELECT SUM(a.amount_minor) FROM bill_allocations a WHERE a.to_voucher_id = v.id), 0) AS paid_minor,
                CAST(julianday(?1) - julianday(COALESCE(CASE WHEN ?2 = 'DUE_DATE' THEN v.due_date END, v.voucher_date)) AS INTEGER) AS days
         FROM vouchers v JOIN parties p ON p.id = v.party_id
         WHERE v.company_id = ?3 AND v.status = 'POSTED'
           AND {type_filter}
           AND v.total_minor > 0
           AND v.voucher_date <= ?4
         ORDER BY v.voucher_date, v.id"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![as_of, basis, company_id, as_of], |row| {
        let total_minor: i64 = row.get(6)?;
        let paid_minor: i64 = row.get(7)?;
        let days: Option<i64> = row.get(8)?;
        Ok(OpenBill {
            party_id: row.get(4)?,
            party_name: row.get(5)?,
            outstanding_minor: total_minor - paid_minor,
            days_overdue: days.unwrap_or(0).max(0),
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        let bill = row?;
        if bill.outstanding_minor > 0 {
            out.push(bill);
        }
    }
    Ok(out)
}
