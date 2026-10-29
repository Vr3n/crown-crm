//! Dashboard SQL. Mirrors `src/main/repositories/dashboard.ts`.

use rusqlite::{params, Connection};

use crate::error::AppResult;

#[derive(Debug, Clone)]
pub struct OpenBill {
    pub voucher_type: String,
    pub due_date: Option<String>,
    pub open_minor: i64,
}

#[derive(Debug, Clone)]
pub struct RecentVoucher {
    pub id: i64,
    pub voucher_type: String,
    pub number: String,
    pub date: String,
    pub party_name: Option<String>,
    pub total_minor: i64,
}

#[derive(Debug, Clone)]
pub struct MonthTotal {
    pub month: String,
    pub voucher_type: String,
    pub amount: i64,
}

pub fn count_parties(conn: &Connection, company_id: i64) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM parties WHERE company_id = ?1",
        params![company_id],
        |row| row.get(0),
    )?)
}

pub fn count_items(conn: &Connection, company_id: i64) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM items WHERE company_id = ?1",
        params![company_id],
        |row| row.get(0),
    )?)
}

/// Every voucher, whatever its status — `count('vouchers')` in the TS.
pub fn count_vouchers(conn: &Connection, company_id: i64) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM vouchers WHERE company_id = ?1",
        params![company_id],
        |row| row.get(0),
    )?)
}

pub fn posted_count(conn: &Connection, company_id: i64, voucher_type: &str) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM vouchers
         WHERE company_id = ?1 AND voucher_type = ?2 AND status = 'POSTED'",
        params![company_id, voucher_type],
        |row| row.get(0),
    )?)
}

/// Total billed less allocated for one voucher type (SALES or PURCHASE).
pub fn outstanding_total(conn: &Connection, company_id: i64, voucher_type: &str) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(
           v.total_minor - COALESCE((
             SELECT SUM(a.amount_minor) FROM bill_allocations a WHERE a.to_voucher_id = v.id
           ), 0)
         ), 0) AS amount
         FROM vouchers v
         WHERE v.company_id = ?1 AND v.voucher_type = ?2 AND v.status = 'POSTED'",
        params![company_id, voucher_type],
        |row| row.get(0),
    )?)
}

/// Cash and bank balances. No voucher-status filter: mirrors the TS query.
pub fn cash_bank_total(conn: &Connection, company_id: i64) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(l.debit_minor - l.credit_minor), 0) AS amount
         FROM ledger_lines l
         JOIN accounts a ON a.id = l.account_id
         WHERE l.company_id = ?1 AND a.system_key IN ('CASH', 'BANK')",
        params![company_id],
        |row| row.get(0),
    )?)
}

/// `(numbering_setup_at, onboarding_completed_at)` for the setup checklist.
pub fn setup_flags(conn: &Connection, company_id: i64) -> AppResult<(Option<String>, Option<String>)> {
    Ok(conn.query_row(
        "SELECT numbering_setup_at, onboarding_completed_at FROM companies WHERE id = ?1",
        params![company_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?)
}

pub fn open_bills(conn: &Connection, company_id: i64) -> AppResult<Vec<OpenBill>> {
    let mut stmt = conn.prepare(
        "SELECT v.voucher_type,
                v.due_date,
                v.total_minor - COALESCE(a.amount, 0) AS open_minor
         FROM vouchers v
         LEFT JOIN (
           SELECT to_voucher_id, SUM(amount_minor) AS amount
           FROM bill_allocations
           GROUP BY to_voucher_id
         ) a ON a.to_voucher_id = v.id
         WHERE v.company_id = ?1
           AND v.status = 'POSTED'
           AND v.voucher_type IN ('SALES', 'PURCHASE')",
    )?;
    let rows = stmt.query_map(params![company_id], |row| {
        Ok(OpenBill {
            voucher_type: row.get(0)?,
            due_date: row.get(1)?,
            open_minor: row.get(2)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn recent_vouchers(conn: &Connection, company_id: i64) -> AppResult<Vec<RecentVoucher>> {
    let mut stmt = conn.prepare(
        "SELECT v.id, v.voucher_type AS type, v.number, v.voucher_date AS date,
                p.name AS partyName, v.total_minor AS totalMinor
         FROM vouchers v
         LEFT JOIN parties p ON p.id = v.party_id
         WHERE v.company_id = ?1 AND v.status = 'POSTED'
         ORDER BY v.voucher_date DESC, v.id DESC
         LIMIT 5",
    )?;
    let rows = stmt.query_map(params![company_id], |row| {
        Ok(RecentVoucher {
            id: row.get(0)?,
            voucher_type: row.get(1)?,
            number: row.get(2)?,
            date: row.get(3)?,
            party_name: row.get(4)?,
            total_minor: row.get(5)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn monthly_totals(conn: &Connection, company_id: i64) -> AppResult<Vec<MonthTotal>> {
    let mut stmt = conn.prepare(
        "SELECT substr(v.voucher_date, 1, 7) AS month, v.voucher_type AS type,
                COALESCE(SUM(v.total_minor), 0) AS amount
         FROM vouchers v
         WHERE v.company_id = ?1 AND v.status = 'POSTED'
           AND v.voucher_type IN ('SALES', 'PURCHASE')
         GROUP BY month, type",
    )?;
    let rows = stmt.query_map(params![company_id], |row| {
        Ok(MonthTotal {
            month: row.get(0)?,
            voucher_type: row.get(1)?,
            amount: row.get(2)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}
