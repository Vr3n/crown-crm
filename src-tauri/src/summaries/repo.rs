//! Page summary SQL. Mirrors `src/main/repositories/summaries.ts` together with
//! the master and report reads it depends on (`partyRepo.list`, `itemRepo.list`
//! and `reportRepo.stockSummary`).

use rusqlite::{params, Connection};

use crate::error::AppResult;

#[derive(Debug, Clone)]
pub struct PartyBalanceRow {
    pub id: i64,
    pub name: String,
    pub is_customer: bool,
    pub is_supplier: bool,
    pub credit_limit_minor: i64,
    pub balance_minor: i64,
}

#[derive(Debug, Clone)]
pub struct ItemRow {
    pub id: i64,
    pub name: String,
    pub is_service: bool,
    pub reorder_level_e4: i64,
    pub stock_qty_e4: i64,
}

#[derive(Debug, Clone)]
pub struct OpenBill {
    pub voucher_type: String,
    pub due_date: Option<String>,
    pub open_minor: i64,
}

#[derive(Debug, Clone)]
pub struct MonthTotal {
    pub month: String,
    pub total_minor: i64,
}

#[derive(Debug, Clone)]
pub struct PartyTotal {
    pub id: i64,
    pub name: String,
    pub total_minor: i64,
}

/// Active parties with their ledger balance (debit positive, credit negative).
pub fn party_balances(conn: &Connection, company_id: i64) -> AppResult<Vec<PartyBalanceRow>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.is_customer, p.is_supplier, p.credit_limit_minor,
          COALESCE((
            SELECT SUM(l.debit_minor - l.credit_minor)
            FROM ledger_lines l
            JOIN party_accounts pa ON pa.account_id = l.account_id
            JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
            WHERE pa.party_id = p.id AND l.company_id = p.company_id
          ), 0) AS balance_minor
         FROM parties p
         WHERE p.company_id = ?1 AND p.is_active = 1
         ORDER BY p.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map(params![company_id], |row| {
        Ok(PartyBalanceRow {
            id: row.get(0)?,
            name: row.get(1)?,
            is_customer: row.get::<_, i64>(2)? != 0,
            is_supplier: row.get::<_, i64>(3)? != 0,
            credit_limit_minor: row.get(4)?,
            balance_minor: row.get(5)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// Active items with posted stock quantity, as `itemRepo.list` returns them.
pub fn active_items(conn: &Connection, company_id: i64) -> AppResult<Vec<ItemRow>> {
    let mut stmt = conn.prepare(
        "SELECT i.id, i.name, i.is_service, i.reorder_level_e4,
          COALESCE((SELECT SUM(m.qty_in_e4 - m.qty_out_e4) FROM stock_movements m
                    JOIN vouchers v ON v.id = m.voucher_id AND v.status = 'POSTED'
                    WHERE m.item_id = i.id), 0) AS stock_qty
         FROM items i
         WHERE i.company_id = ?1 AND i.is_active = 1
         ORDER BY i.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map(params![company_id], |row| {
        Ok(ItemRow {
            id: row.get(0)?,
            name: row.get(1)?,
            is_service: row.get::<_, i64>(2)? != 0,
            reorder_level_e4: row.get(3)?,
            stock_qty_e4: row.get(4)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// Stock quantity and value per non-service item; value is paise, divided by
/// 10,000 inside SQL so the truncation matches the TS report.
pub fn stock_summary(conn: &Connection, company_id: i64) -> AppResult<Vec<(i64, i64, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT i.id,
           COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN m.qty_in_e4 - m.qty_out_e4 ELSE 0 END), 0) AS qty,
           COALESCE(SUM(CASE WHEN v.id IS NOT NULL
             THEN m.qty_in_e4 * m.unit_cost_minor - m.qty_out_e4 * m.unit_cost_minor ELSE 0 END), 0) / 10000 AS value
         FROM items i
         LEFT JOIN units u ON u.id = i.uom_id
         LEFT JOIN stock_movements m ON m.item_id = i.id
         LEFT JOIN vouchers v ON v.id = m.voucher_id AND v.status = 'POSTED'
         WHERE i.company_id = ?1 AND i.is_service = 0
         GROUP BY i.id",
    )?;
    let rows = stmt.query_map(params![company_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i64>(2)?,
        ))
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn open_bills(conn: &Connection, company_id: i64) -> AppResult<Vec<OpenBill>> {
    let mut stmt = conn.prepare(
        "SELECT v.voucher_type, v.due_date,
                v.total_minor - COALESCE(a.amount, 0) AS open_minor
         FROM vouchers v
         LEFT JOIN (
           SELECT to_voucher_id, SUM(amount_minor) AS amount
           FROM bill_allocations GROUP BY to_voucher_id
         ) a ON a.to_voucher_id = v.id
         WHERE v.company_id = ?1 AND v.status = 'POSTED'
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

/// `(count, total_minor)` for posted vouchers in the period, optionally of one type.
pub fn voucher_aggregate(
    conn: &Connection,
    company_id: i64,
    voucher_type: Option<&str>,
    from: &str,
    to: &str,
) -> AppResult<(i64, i64)> {
    Ok(conn.query_row(
        "SELECT COUNT(*) AS count, COALESCE(SUM(v.total_minor), 0) AS total
         FROM vouchers v
         WHERE v.company_id = ?1 AND v.voucher_date BETWEEN ?2 AND ?3 AND v.status = 'POSTED'
           AND (?4 IS NULL OR v.voucher_type = ?4)",
        params![company_id, from, to, voucher_type],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?)
}

pub fn voucher_monthly(
    conn: &Connection,
    company_id: i64,
    voucher_type: Option<&str>,
    from: &str,
    to: &str,
) -> AppResult<Vec<MonthTotal>> {
    let mut stmt = conn.prepare(
        "SELECT substr(v.voucher_date, 1, 7) AS month, COALESCE(SUM(v.total_minor), 0) AS total
         FROM vouchers v
         WHERE v.company_id = ?1 AND v.voucher_date BETWEEN ?2 AND ?3 AND v.status = 'POSTED'
           AND (?4 IS NULL OR v.voucher_type = ?4)
         GROUP BY month ORDER BY month",
    )?;
    let rows = stmt.query_map(params![company_id, from, to, voucher_type], |row| {
        Ok(MonthTotal {
            month: row.get(0)?,
            total_minor: row.get(1)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn voucher_top_parties(
    conn: &Connection,
    company_id: i64,
    voucher_type: Option<&str>,
    from: &str,
    to: &str,
) -> AppResult<Vec<PartyTotal>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, COALESCE(SUM(v.total_minor), 0) AS total
         FROM vouchers v
         JOIN parties p ON p.id = v.party_id
         WHERE v.company_id = ?1 AND v.voucher_date BETWEEN ?2 AND ?3 AND v.status = 'POSTED'
           AND (?4 IS NULL OR v.voucher_type = ?4)
         GROUP BY p.id ORDER BY total DESC LIMIT 6",
    )?;
    let rows = stmt.query_map(params![company_id, from, to, voucher_type], |row| {
        Ok(PartyTotal {
            id: row.get(0)?,
            name: row.get(1)?,
            total_minor: row.get(2)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// Total billed less allocated for one voucher type, across all time.
pub fn outstanding_total(conn: &Connection, company_id: i64, voucher_type: &str) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(
           v.total_minor - COALESCE((SELECT SUM(a.amount_minor) FROM bill_allocations a WHERE a.to_voucher_id = v.id), 0)
         ), 0) AS open
         FROM vouchers v
         WHERE v.company_id = ?1 AND v.voucher_type = ?2 AND v.status = 'POSTED'",
        params![company_id, voucher_type],
        |row| row.get(0),
    )?)
}
