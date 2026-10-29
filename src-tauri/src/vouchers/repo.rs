//! SQL for the vouchers domain.
//!
//! Mirrors `src/main/repositories/vouchers.ts`, `src/main/repositories/invoice.ts`
//! and the small lookups the posting engine borrows from
//! `src/main/repositories/masters.ts`. Every query is scoped to a company id.

use std::collections::HashMap;

use rusqlite::{
    params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension,
};
use serde_json::{json, Value};

use crate::error::AppResult;
use crate::state::now_sqlite;

use super::posting::LedgerDraft;
use super::stock::StockMovement;

/// The reserved account ids of a company, keyed by `accounts.system_key`.
pub fn system_keys(conn: &Connection, company_id: i64) -> AppResult<HashMap<String, i64>> {
    let mut stmt = conn.prepare(
        "SELECT system_key, id FROM accounts
         WHERE company_id = ?1 AND system_key IS NOT NULL",
    )?;
    let rows = stmt.query_map(params![company_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    let mut keys = HashMap::new();
    for row in rows {
        let (key, id) = row?;
        keys.insert(key, id);
    }
    Ok(keys)
}

#[derive(Debug, Clone)]
pub struct PartyRecord {
    pub id: i64,
    pub state_code: Option<String>,
    pub credit_days: i64,
}

pub fn find_party(conn: &Connection, company_id: i64, id: i64) -> AppResult<Option<PartyRecord>> {
    Ok(conn
        .query_row(
            "SELECT id, state_code, credit_days
             FROM parties WHERE company_id = ?1 AND id = ?2",
            params![company_id, id],
            |row| {
                Ok(PartyRecord {
                    id: row.get(0)?,
                    state_code: row.get(1)?,
                    credit_days: row.get(2)?,
                })
            },
        )
        .optional()?)
}

/// The company a party belongs to, so a foreign id can be named as such.
pub fn party_company(conn: &Connection, id: i64) -> AppResult<Option<i64>> {
    Ok(conn
        .query_row("SELECT company_id FROM parties WHERE id = ?1", params![id], |row| row.get(0))
        .optional()?)
}

#[derive(Debug, Clone, Copy, Default)]
pub struct PartyAccounts {
    pub debtor: Option<i64>,
    pub creditor: Option<i64>,
}

pub fn party_accounts(conn: &Connection, company_id: i64, party_id: i64) -> AppResult<PartyAccounts> {
    let mut stmt = conn.prepare(
        "SELECT role, account_id FROM party_accounts WHERE company_id = ?1 AND party_id = ?2",
    )?;
    let rows = stmt.query_map(params![company_id, party_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    let mut accounts = PartyAccounts::default();
    for row in rows {
        let (role, account_id) = row?;
        match role.as_str() {
            "DEBTOR" => accounts.debtor = Some(account_id),
            "CREDITOR" => accounts.creditor = Some(account_id),
            _ => {}
        }
    }
    Ok(accounts)
}

#[derive(Debug, Clone)]
pub struct ItemRecord {
    pub id: i64,
    pub hsn_sac: Option<String>,
    pub uom: Option<String>,
    pub cess_rate_bps: i64,
    pub is_service: bool,
    pub purchase_price_minor: i64,
}

pub fn find_item(conn: &Connection, company_id: i64, id: i64) -> AppResult<Option<ItemRecord>> {
    Ok(conn
        .query_row(
            "SELECT i.id, i.hsn_sac, u.name, i.cess_rate_bps, i.is_service, i.purchase_price_minor
             FROM items i
             LEFT JOIN units u ON u.id = i.uom_id
             WHERE i.company_id = ?1 AND i.id = ?2",
            params![company_id, id],
            |row| {
                Ok(ItemRecord {
                    id: row.get(0)?,
                    hsn_sac: row.get(1)?,
                    uom: row.get(2)?,
                    cess_rate_bps: row.get(3)?,
                    is_service: row.get::<_, i64>(4)? != 0,
                    purchase_price_minor: row.get(5)?,
                })
            },
        )
        .optional()?)
}

pub fn item_company(conn: &Connection, id: i64) -> AppResult<Option<i64>> {
    Ok(conn
        .query_row("SELECT company_id FROM items WHERE id = ?1", params![id], |row| row.get(0))
        .optional()?)
}

#[derive(Debug, Clone, Copy)]
pub struct AccountMeta {
    pub company_id: i64,
    pub is_active: bool,
}

/// Looked up by id alone so a cross-company reference can be named as such.
pub fn find_account(conn: &Connection, id: i64) -> AppResult<Option<AccountMeta>> {
    Ok(conn
        .query_row(
            "SELECT company_id, is_active FROM accounts WHERE id = ?1",
            params![id],
            |row| {
                Ok(AccountMeta {
                    company_id: row.get(0)?,
                    is_active: row.get::<_, i64>(1)? != 0,
                })
            },
        )
        .optional()?)
}

pub fn default_godown(conn: &Connection, company_id: i64) -> AppResult<Option<i64>> {
    Ok(conn
        .query_row(
            "SELECT id FROM godowns WHERE company_id = ?1 ORDER BY id LIMIT 1",
            params![company_id],
            |row| row.get(0),
        )
        .optional()?)
}

pub fn find_by_idempotency_key(
    conn: &Connection,
    company_id: i64,
    key: &str,
) -> AppResult<Option<i64>> {
    Ok(conn
        .query_row(
            "SELECT id FROM vouchers WHERE company_id = ?1 AND idempotency_key = ?2
             ORDER BY id LIMIT 1",
            params![company_id, key],
            |row| row.get(0),
        )
        .optional()?)
}

pub fn voucher_number(conn: &Connection, company_id: i64, id: i64) -> AppResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT number FROM vouchers WHERE company_id = ?1 AND id = ?2",
            params![company_id, id],
            |row| row.get(0),
        )
        .optional()?)
}

pub fn find_status(conn: &Connection, company_id: i64, id: i64) -> AppResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT status FROM vouchers WHERE company_id = ?1 AND id = ?2",
            params![company_id, id],
            |row| row.get(0),
        )
        .optional()?)
}

/// Everything the header insert needs. `status`, `posted_at` and `posted_by`
/// are written by the insert itself because every posted voucher is POSTED.
pub struct NewVoucher {
    pub company_id: i64,
    pub voucher_type: String,
    pub series: String,
    pub number: String,
    pub fy: String,
    pub date: String,
    pub due_date: Option<String>,
    pub party_id: Option<i64>,
    pub place_of_supply_state_code: Option<String>,
    pub narration: Option<String>,
    pub reference_no: Option<String>,
    pub taxable_minor: i64,
    pub cgst_minor: i64,
    pub sgst_minor: i64,
    pub igst_minor: i64,
    pub cess_minor: i64,
    pub discount_minor: i64,
    pub round_off_minor: i64,
    pub total_minor: i64,
    pub total_qty_e4: i64,
    pub payment_method_id: Option<i64>,
    pub instrument_no: Option<String>,
    pub bank_account_id: Option<i64>,
    pub reversal_of_voucher_id: Option<i64>,
    pub idempotency_key: Option<String>,
    pub created_by: Option<i64>,
}

pub struct NewLine {
    pub item_id: Option<i64>,
    pub description: String,
    pub hsn: Option<String>,
    pub uom: Option<String>,
    pub qty_e4: i64,
    pub rate_minor: i64,
    pub rate_includes_tax: bool,
    pub discount_bps: i64,
    pub gst_rate_bps: i64,
    pub taxable_minor: i64,
    pub cgst_minor: i64,
    pub sgst_minor: i64,
    pub igst_minor: i64,
    pub cess_minor: i64,
    pub line_total_minor: i64,
    pub unit_cost_minor: Option<i64>,
    pub godown_id: Option<i64>,
    pub sort_order: i64,
}

pub struct NewAllocation {
    pub to_voucher_id: i64,
    pub amount_minor: i64,
    pub allocation_type: String,
}

/// Writes the voucher and every row that hangs off it. The caller owns the
/// transaction, so a failure here rolls the number back too.
pub fn insert(
    conn: &Connection,
    header: &NewVoucher,
    lines: &[NewLine],
    ledger: &[LedgerDraft],
    stock: &[StockMovement],
    allocations: &[NewAllocation],
    actor_id: Option<i64>,
) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO vouchers (
           company_id, voucher_type, series, number, fy, voucher_date, due_date, party_id,
           place_of_supply_state_code, narration, reference_no, status, taxable_minor, cgst_minor,
           sgst_minor, igst_minor, cess_minor, discount_minor, round_off_minor, total_minor,
           total_qty_e4, payment_method_id, instrument_no, bank_account_id, reversal_of_voucher_id,
           idempotency_key, created_by, posted_at, posted_by
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'POSTED', ?12, ?13, ?14, ?15,
           ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28)",
        params![
            header.company_id,
            header.voucher_type,
            header.series,
            header.number,
            header.fy,
            header.date,
            header.due_date,
            header.party_id,
            header.place_of_supply_state_code,
            header.narration,
            header.reference_no,
            header.taxable_minor,
            header.cgst_minor,
            header.sgst_minor,
            header.igst_minor,
            header.cess_minor,
            header.discount_minor,
            header.round_off_minor,
            header.total_minor,
            header.total_qty_e4,
            header.payment_method_id,
            header.instrument_no,
            header.bank_account_id,
            header.reversal_of_voucher_id,
            header.idempotency_key,
            header.created_by,
            now_sqlite(),
            actor_id,
        ],
    )?;
    let voucher_id = conn.last_insert_rowid();

    if !lines.is_empty() {
        let mut stmt = conn.prepare(
            "INSERT INTO voucher_item_lines (
               company_id, voucher_id, item_id, description_snapshot, hsn_snapshot, uom_snapshot,
               qty_e4, entered_rate_minor, rate_includes_tax, discount_bps, gst_rate_bps,
               taxable_value_minor, cgst_minor, sgst_minor, igst_minor, cess_minor,
               line_total_minor, unit_cost_minor, godown_id, sort_order
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
               ?17, ?18, ?19, ?20)",
        )?;
        for line in lines {
            stmt.execute(params![
                header.company_id,
                voucher_id,
                line.item_id,
                line.description,
                line.hsn,
                line.uom,
                line.qty_e4,
                line.rate_minor,
                i64::from(line.rate_includes_tax),
                line.discount_bps,
                line.gst_rate_bps,
                line.taxable_minor,
                line.cgst_minor,
                line.sgst_minor,
                line.igst_minor,
                line.cess_minor,
                line.line_total_minor,
                line.unit_cost_minor,
                line.godown_id,
                line.sort_order,
            ])?;
        }
    }

    if !ledger.is_empty() {
        let mut stmt = conn.prepare(
            "INSERT INTO ledger_lines (
               company_id, voucher_id, account_id, party_id, debit_minor, credit_minor, narration,
               sort_order
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;
        for (index, line) in ledger.iter().enumerate() {
            stmt.execute(params![
                header.company_id,
                voucher_id,
                line.account_id,
                line.party_id,
                line.debit_minor,
                line.credit_minor,
                line.narration,
                index as i64,
            ])?;
        }
    }

    if !stock.is_empty() {
        let mut stmt = conn.prepare(
            "INSERT INTO stock_movements (
               company_id, voucher_id, item_id, godown_id, qty_in_e4, qty_out_e4, unit_cost_minor,
               movement_type
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;
        for movement in stock {
            stmt.execute(params![
                header.company_id,
                voucher_id,
                movement.item_id,
                movement.godown_id,
                movement.qty_in_e4,
                movement.qty_out_e4,
                movement.unit_cost_minor,
                movement.movement_type,
            ])?;
        }
    }

    if !allocations.is_empty() {
        let mut stmt = conn.prepare(
            "INSERT INTO bill_allocations (
               company_id, from_voucher_id, to_voucher_id, amount_minor, allocation_type, created_by
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )?;
        for allocation in allocations {
            stmt.execute(params![
                header.company_id,
                voucher_id,
                allocation.to_voucher_id,
                allocation.amount_minor,
                allocation.allocation_type,
                actor_id,
            ])?;
        }
    }

    Ok(voucher_id)
}

struct DetailHeader {
    id: i64,
    voucher_type: String,
    number: String,
    voucher_date: String,
    due_date: Option<String>,
    party_id: Option<i64>,
    place_of_supply_state_code: Option<String>,
    narration: Option<String>,
    reference_no: Option<String>,
    status: String,
    created_at: String,
    created_by: Option<i64>,
    posted_by: Option<i64>,
    cancelled_at: Option<String>,
    cancelled_by: Option<i64>,
    cancel_reason: Option<String>,
    taxable_minor: i64,
    cgst_minor: i64,
    sgst_minor: i64,
    igst_minor: i64,
    cess_minor: i64,
    discount_minor: i64,
    round_off_minor: i64,
    total_minor: i64,
    total_qty_e4: i64,
}

fn user_name(conn: &Connection, id: Option<i64>) -> AppResult<Option<String>> {
    let Some(id) = id else { return Ok(None) };
    Ok(conn
        .query_row("SELECT full_name FROM users WHERE id = ?1", params![id], |row| row.get(0))
        .optional()?)
}

/// The full `VoucherDetail` the renderer shows, including the audit trail.
pub fn find_detail(conn: &Connection, company_id: i64, id: i64) -> AppResult<Option<Value>> {
    let header = conn
        .query_row(
            "SELECT id, voucher_type, number, voucher_date, due_date, party_id,
                    place_of_supply_state_code, narration, reference_no, status, created_at,
                    created_by, posted_by, cancelled_at, cancelled_by, cancel_reason,
                    taxable_minor, cgst_minor, sgst_minor, igst_minor, cess_minor, discount_minor,
                    round_off_minor, total_minor, total_qty_e4
             FROM vouchers WHERE company_id = ?1 AND id = ?2",
            params![company_id, id],
            |row| {
                Ok(DetailHeader {
                    id: row.get(0)?,
                    voucher_type: row.get(1)?,
                    number: row.get(2)?,
                    voucher_date: row.get(3)?,
                    due_date: row.get(4)?,
                    party_id: row.get(5)?,
                    place_of_supply_state_code: row.get(6)?,
                    narration: row.get(7)?,
                    reference_no: row.get(8)?,
                    status: row.get(9)?,
                    created_at: row.get(10)?,
                    created_by: row.get(11)?,
                    posted_by: row.get(12)?,
                    cancelled_at: row.get(13)?,
                    cancelled_by: row.get(14)?,
                    cancel_reason: row.get(15)?,
                    taxable_minor: row.get(16)?,
                    cgst_minor: row.get(17)?,
                    sgst_minor: row.get(18)?,
                    igst_minor: row.get(19)?,
                    cess_minor: row.get(20)?,
                    discount_minor: row.get(21)?,
                    round_off_minor: row.get(22)?,
                    total_minor: row.get(23)?,
                    total_qty_e4: row.get(24)?,
                })
            },
        )
        .optional()?;
    let Some(header) = header else { return Ok(None) };

    let party = match header.party_id {
        Some(party_id) => conn
            .query_row(
                "SELECT name, gstin FROM parties WHERE company_id = ?1 AND id = ?2",
                params![company_id, party_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .optional()?,
        None => None,
    };

    let mut stmt = conn.prepare(
        "SELECT id, description_snapshot, hsn_snapshot, uom_snapshot, qty_e4, entered_rate_minor,
                discount_bps, gst_rate_bps, taxable_value_minor, cgst_minor, sgst_minor,
                igst_minor, cess_minor, line_total_minor
         FROM voucher_item_lines WHERE voucher_id = ?1 ORDER BY sort_order, id",
    )?;
    let line_rows = stmt.query_map(params![header.id], map_line_row)?;
    let mut lines = Vec::new();
    for row in line_rows {
        lines.push(row?);
    }

    let mut stmt = conn.prepare(
        "SELECT a.to_voucher_id, v.number, a.amount_minor
         FROM bill_allocations a JOIN vouchers v ON v.id = a.to_voucher_id
         WHERE a.company_id = ?1 AND a.from_voucher_id = ?2 ORDER BY a.id",
    )?;
    let allocation_rows = stmt.query_map(params![company_id, header.id], |row| {
        Ok(json!({
            "toVoucherId": row.get::<_, i64>(0)?,
            "toNumber": row.get::<_, String>(1)?,
            "amountMinor": row.get::<_, i64>(2)?
        }))
    })?;
    let mut allocations = Vec::new();
    for row in allocation_rows {
        allocations.push(row?);
    }

    let mut stmt = conn.prepare(
        "SELECT a.id, a.action, a.actor_user_id, u.full_name, u.email, a.created_at
         FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id
         WHERE a.company_id = ?1 AND a.entity = 'VOUCHER' AND a.entity_id = ?2
         ORDER BY a.id",
    )?;
    let audit_rows = stmt.query_map(params![company_id, header.id], |row| {
        Ok(json!({
            "id": row.get::<_, i64>(0)?,
            "action": row.get::<_, String>(1)?,
            "actorUserId": row.get::<_, Option<i64>>(2)?,
            "actorName": row.get::<_, Option<String>>(3)?,
            "actorEmail": row.get::<_, Option<String>>(4)?,
            "createdAt": row.get::<_, String>(5)?
        }))
    })?;
    let mut audit = Vec::new();
    for row in audit_rows {
        audit.push(row?);
    }

    let company_name: Option<String> = conn
        .query_row("SELECT name FROM companies WHERE id = ?1", params![company_id], |row| row.get(0))
        .optional()?;

    let created_by_name = user_name(conn, header.created_by)?;
    let posted_by_name = user_name(conn, header.posted_by)?;
    let cancelled_by_name = user_name(conn, header.cancelled_by)?;
    let party_name = party.as_ref().map(|value| value.0.clone());
    let party_gstin = party.as_ref().and_then(|value| value.1.clone());

    Ok(Some(json!({
        "id": header.id,
        "type": header.voucher_type,
        "number": header.number,
        "date": header.voucher_date,
        "dueDate": header.due_date,
        "partyId": header.party_id,
        "partyName": party_name,
        "partyGstin": party_gstin,
        "narration": header.narration,
        "referenceNo": header.reference_no,
        "status": header.status,
        "createdAt": header.created_at,
        "createdByName": created_by_name,
        "postedByName": posted_by_name,
        "cancelledAt": header.cancelled_at,
        "cancelledByName": cancelled_by_name,
        "cancelReason": header.cancel_reason,
        "audit": audit,
        "taxableMinor": header.taxable_minor,
        "cgstMinor": header.cgst_minor,
        "sgstMinor": header.sgst_minor,
        "igstMinor": header.igst_minor,
        "roundOffMinor": header.round_off_minor,
        "totalMinor": header.total_minor,
        "lines": lines,
        "allocations": allocations,
        "cessMinor": header.cess_minor,
        "discountMinor": header.discount_minor,
        "totalQtyE4": header.total_qty_e4,
        "placeOfSupplyStateCode": header.place_of_supply_state_code,
        "companyName": company_name
    })))
}

fn map_line_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let cgst: i64 = row.get(9)?;
    let sgst: i64 = row.get(10)?;
    let igst: i64 = row.get(11)?;
    let cess: i64 = row.get(12)?;
    let tax = cgst.saturating_add(sgst).saturating_add(igst).saturating_add(cess);
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "description": row.get::<_, String>(1)?,
        "hsn": row.get::<_, Option<String>>(2)?,
        "uom": row.get::<_, Option<String>>(3)?,
        "qtyE4": row.get::<_, i64>(4)?,
        "rateMinor": row.get::<_, i64>(5)?,
        "discountBps": row.get::<_, i64>(6)?,
        "gstRateBps": row.get::<_, i64>(7)?,
        "taxableMinor": row.get::<_, i64>(8)?,
        "taxMinor": tax,
        "totalMinor": row.get::<_, i64>(13)?
    }))
}

/// The `vouchers:list` filter set.
#[derive(Debug, Clone, Default)]
pub struct ListQuery {
    pub voucher_type: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub party_id: Option<i64>,
    pub query: Option<String>,
    pub status: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

pub fn list(conn: &Connection, company_id: i64, input: &ListQuery) -> AppResult<Vec<Value>> {
    let mut sql = String::from(
        "SELECT v.id, v.voucher_type, v.number, v.voucher_date, v.total_minor, v.status,
                v.created_at, p.name, v.narration
         FROM vouchers v LEFT JOIN parties p ON p.id = v.party_id
         WHERE v.company_id = ?",
    );
    let mut args: Vec<SqlValue> = vec![SqlValue::Integer(company_id)];

    if let Some(voucher_type) = &input.voucher_type {
        sql.push_str(" AND v.voucher_type = ?");
        args.push(SqlValue::Text(voucher_type.clone()));
    }
    if let Some(from) = &input.from {
        sql.push_str(" AND v.voucher_date >= ?");
        args.push(SqlValue::Text(from.clone()));
    }
    if let Some(to) = &input.to {
        sql.push_str(" AND v.voucher_date <= ?");
        args.push(SqlValue::Text(to.clone()));
    }
    if let Some(party_id) = input.party_id {
        sql.push_str(" AND v.party_id = ?");
        args.push(SqlValue::Integer(party_id));
    }
    if let Some(status) = &input.status {
        sql.push_str(" AND v.status = ?");
        args.push(SqlValue::Text(status.clone()));
    }
    if let Some(query) = &input.query {
        sql.push_str(
            " AND (lower(v.number) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.name, '')) LIKE ? ESCAPE '\\')",
        );
        let escaped = query
            .to_lowercase()
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let pattern = format!("%{escaped}%");
        args.push(SqlValue::Text(pattern.clone()));
        args.push(SqlValue::Text(pattern));
    }
    sql.push_str(" ORDER BY v.voucher_date DESC, v.id DESC LIMIT ? OFFSET ?");
    args.push(SqlValue::Integer(input.limit));
    args.push(SqlValue::Integer(input.offset));

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(args.iter()), |row| {
        Ok(json!({
            "id": row.get::<_, i64>(0)?,
            "type": row.get::<_, String>(1)?,
            "number": row.get::<_, String>(2)?,
            "date": row.get::<_, String>(3)?,
            "partyName": row.get::<_, Option<String>>(7)?,
            "narration": row.get::<_, Option<String>>(8)?,
            "totalMinor": row.get::<_, i64>(4)?,
            "status": row.get::<_, String>(5)?,
            "createdAt": row.get::<_, String>(6)?
        }))
    })?;
    let mut vouchers = Vec::new();
    for row in rows {
        vouchers.push(row?);
    }
    Ok(vouchers)
}

#[derive(Debug, Clone)]
pub struct OutstandingQuery {
    pub party_id: Option<i64>,
    pub as_of: String,
    /// `DUE_DATE` or `BILL_DATE`.
    pub basis: String,
    /// `RECEIVABLE`, `PAYABLE` or `ALL`.
    pub kind: String,
}

pub fn outstanding(
    conn: &Connection,
    company_id: i64,
    input: &OutstandingQuery,
) -> AppResult<Vec<Value>> {
    let type_filter = match input.kind.as_str() {
        "ALL" => "v.voucher_type IN ('SALES','PURCHASE')",
        "PAYABLE" => "v.voucher_type = 'PURCHASE'",
        _ => "v.voucher_type = 'SALES'",
    };
    let party_filter = if input.party_id.is_some() { " AND v.party_id = ?5" } else { "" };
    let sql = format!(
        "SELECT v.id, v.number, v.voucher_date, v.due_date, v.party_id, p.name, v.total_minor,
                COALESCE((SELECT SUM(a.amount_minor) FROM bill_allocations a
                          WHERE a.to_voucher_id = v.id), 0) AS paid_minor,
                CAST(julianday(?1) - julianday(COALESCE(CASE WHEN ?2 = 'DUE_DATE' THEN v.due_date END, v.voucher_date)) AS INTEGER) AS days
         FROM vouchers v JOIN parties p ON p.id = v.party_id
         WHERE v.company_id = ?3 AND v.status = 'POSTED'
           AND {type_filter}
           AND v.total_minor > 0
           AND v.voucher_date <= ?4{party_filter}
         ORDER BY v.voucher_date, v.id"
    );

    let mut stmt = conn.prepare(&sql)?;

    let rows = match input.party_id {
        Some(party_id) => stmt.query_map(
            params![input.as_of, input.basis, company_id, input.as_of, party_id],
            map_outstanding_row,
        )?,
        None => stmt.query_map(
            params![input.as_of, input.basis, company_id, input.as_of],
            map_outstanding_row,
        )?,
    };

    let mut bills = Vec::new();
    for row in rows {
        let value = row?;
        let outstanding = value.get("outstandingMinor").and_then(|item| item.as_i64()).unwrap_or(0);
        if outstanding > 0 {
            bills.push(value);
        }
    }
    Ok(bills)
}

fn map_outstanding_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let total: i64 = row.get(6)?;
    let paid: i64 = row.get(7)?;
    let days: Option<i64> = row.get(8)?;
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "number": row.get::<_, String>(1)?,
        "date": row.get::<_, String>(2)?,
        "dueDate": row.get::<_, Option<String>>(3)?,
        "partyId": row.get::<_, i64>(4)?,
        "partyName": row.get::<_, String>(5)?,
        "totalMinor": total,
        "paidMinor": paid,
        "outstandingMinor": total.saturating_sub(paid),
        "daysOverdue": days.unwrap_or(0).max(0)
    }))
}

pub fn cancel(
    conn: &Connection,
    company_id: i64,
    id: i64,
    reason: &str,
    actor_id: Option<i64>,
) -> AppResult<()> {
    conn.execute(
        "UPDATE vouchers
         SET status = 'CANCELLED', cancelled_at = ?1, cancelled_by = ?2, cancel_reason = ?3
         WHERE company_id = ?4 AND id = ?5",
        params![now_sqlite(), actor_id, reason, company_id, id],
    )?;
    Ok(())
}

pub fn has_opening_voucher(conn: &Connection, company_id: i64) -> AppResult<bool> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT id FROM vouchers WHERE company_id = ?1 AND voucher_type = 'OPENING' LIMIT 1",
            params![company_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

pub struct OpeningParty {
    pub id: i64,
    pub opening_balance_minor: i64,
}

pub fn opening_parties(conn: &Connection, company_id: i64) -> AppResult<Vec<OpeningParty>> {
    let mut stmt = conn.prepare(
        "SELECT id, opening_balance_minor FROM parties
         WHERE company_id = ?1 AND opening_balance_minor <> 0 ORDER BY id",
    )?;
    let rows = stmt.query_map(params![company_id], |row| {
        Ok(OpeningParty { id: row.get(0)?, opening_balance_minor: row.get(1)? })
    })?;
    let mut parties = Vec::new();
    for row in rows {
        parties.push(row?);
    }
    Ok(parties)
}

pub struct OpeningAccount {
    pub id: i64,
    pub amount_minor: i64,
    pub side: String,
}

pub fn opening_accounts(conn: &Connection, company_id: i64) -> AppResult<Vec<OpeningAccount>> {
    let mut stmt = conn.prepare(
        "SELECT id, opening_balance_minor, opening_balance_side FROM accounts
         WHERE company_id = ?1 AND opening_balance_minor <> 0
           AND id NOT IN (SELECT account_id FROM party_accounts WHERE company_id = ?1)
         ORDER BY id",
    )?;
    let rows = stmt.query_map(params![company_id], |row| {
        Ok(OpeningAccount { id: row.get(0)?, amount_minor: row.get(1)?, side: row.get(2)? })
    })?;
    let mut accounts = Vec::new();
    for row in rows {
        accounts.push(row?);
    }
    Ok(accounts)
}

pub struct OpeningItem {
    pub id: i64,
    pub qty_e4: i64,
    pub rate_minor: i64,
}

pub fn opening_items(conn: &Connection, company_id: i64) -> AppResult<Vec<OpeningItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, opening_qty_e4, opening_rate_minor FROM items
         WHERE company_id = ?1 AND opening_qty_e4 > 0 AND is_service = 0 ORDER BY id",
    )?;
    let rows = stmt.query_map(params![company_id], |row| {
        Ok(OpeningItem { id: row.get(0)?, qty_e4: row.get(1)?, rate_minor: row.get(2)? })
    })?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

/// A stored idempotency record: `(payload fingerprint, response JSON)`.
pub fn find_idempotency(
    conn: &Connection,
    company_id: i64,
    channel: &str,
    key: &str,
) -> AppResult<Option<(Option<String>, Option<String>)>> {
    Ok(conn
        .query_row(
            "SELECT payload_hash, response FROM idempotency_keys
             WHERE company_id = ?1 AND channel = ?2 AND key = ?3",
            params![company_id, channel, key],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .optional()?)
}

pub fn insert_idempotency(
    conn: &Connection,
    company_id: i64,
    channel: &str,
    key: &str,
    fingerprint: &str,
    response: &str,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO idempotency_keys (company_id, channel, key, payload_hash, response)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(company_id, channel, key) DO NOTHING",
        params![company_id, channel, key, fingerprint, response],
    )?;
    Ok(())
}
