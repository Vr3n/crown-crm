//! Search SQL. Mirrors `src/main/repositories/search.ts`: active masters only,
//! posted vouchers only, five rows per family.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

use crate::error::AppResult;

#[derive(Debug, Clone)]
pub struct SearchResult {
    pub id: i64,
    pub kind: &'static str,
    pub title: String,
    pub subtitle: Option<String>,
    pub meta: Option<String>,
}

impl SearchResult {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "kind": self.kind,
            "title": self.title,
            "subtitle": self.subtitle,
            "meta": self.meta
        })
    }
}

/// `%term%`, lowercased, exactly like the TS `pattern` helper.
pub(super) fn pattern(query: &str) -> String {
    format!("%{}%", query.trim().to_lowercase())
}

pub(super) fn role_label(is_customer: bool, is_supplier: bool) -> &'static str {
    match (is_customer, is_supplier) {
        (true, true) => "Customer and supplier",
        (true, false) => "Customer",
        (false, true) => "Supplier",
        (false, false) => "Party",
    }
}

/// `(gstRateBps / 100).toFixed(gstRateBps % 100 === 0 ? 0 : 2)` plus the GST suffix.
pub(super) fn gst_label(gst_rate_bps: i64) -> String {
    if gst_rate_bps.rem_euclid(100) == 0 {
        format!("{}% GST", gst_rate_bps / 100)
    } else {
        let whole = gst_rate_bps.div_euclid(100);
        let fraction = gst_rate_bps.rem_euclid(100);
        format!("{whole}.{fraction:02}% GST")
    }
}

pub fn parties(conn: &Connection, company_id: i64, query: &str, limit: i64) -> AppResult<Vec<SearchResult>> {
    let term = pattern(query);
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.phone, p.gstin, p.is_customer, p.is_supplier
         FROM parties p
         WHERE p.company_id = ?1 AND p.is_active = 1
           AND (lower(p.name) LIKE ?2
                OR lower(COALESCE(p.phone, '')) LIKE ?2
                OR lower(COALESCE(p.gstin, '')) LIKE ?2
                OR lower(COALESCE(p.email, '')) LIKE ?2)
         ORDER BY p.name
         LIMIT ?3",
    )?;
    let rows = stmt.query_map(params![company_id, term, limit], |row| {
        let phone: Option<String> = row.get(2)?;
        let gstin: Option<String> = row.get(3)?;
        let is_customer = row.get::<_, i64>(4)? != 0;
        let is_supplier = row.get::<_, i64>(5)? != 0;
        Ok(SearchResult {
            id: row.get(0)?,
            kind: "PARTY",
            title: row.get(1)?,
            subtitle: phone.or(gstin),
            meta: Some(role_label(is_customer, is_supplier).to_string()),
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn items(conn: &Connection, company_id: i64, query: &str, limit: i64) -> AppResult<Vec<SearchResult>> {
    let term = pattern(query);
    let mut stmt = conn.prepare(
        "SELECT i.id, i.name, i.sku, i.hsn_sac, i.gst_rate_bps, i.is_service
         FROM items i
         WHERE i.company_id = ?1 AND i.is_active = 1
           AND (lower(i.name) LIKE ?2
                OR lower(COALESCE(i.sku, '')) LIKE ?2
                OR lower(COALESCE(i.hsn_sac, '')) LIKE ?2)
         ORDER BY i.name
         LIMIT ?3",
    )?;
    let rows = stmt.query_map(params![company_id, term, limit], |row| {
        let sku: Option<String> = row.get(2)?;
        let hsn: Option<String> = row.get(3)?;
        let gst_rate_bps: i64 = row.get(4)?;
        let is_service = row.get::<_, i64>(5)? != 0;

        let mut parts: Vec<String> = Vec::new();
        if let Some(sku) = sku {
            if !sku.is_empty() {
                parts.push(sku);
            }
        }
        if let Some(hsn) = hsn {
            if !hsn.is_empty() {
                parts.push(format!("HSN {hsn}"));
            }
        }
        if is_service {
            parts.push("Service".to_string());
        }

        Ok(SearchResult {
            id: row.get(0)?,
            kind: "ITEM",
            title: row.get(1)?,
            subtitle: if parts.is_empty() {
                None
            } else {
                Some(parts.join(" · "))
            },
            meta: Some(gst_label(gst_rate_bps)),
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn vouchers(conn: &Connection, company_id: i64, query: &str, limit: i64) -> AppResult<Vec<SearchResult>> {
    let term = pattern(query);
    let mut stmt = conn.prepare(
        "SELECT v.id, v.number, v.voucher_type, v.voucher_date, v.status, p.name AS party_name
         FROM vouchers v
         LEFT JOIN parties p ON p.id = v.party_id
         WHERE v.company_id = ?1 AND v.status = 'POSTED'
           AND (lower(v.number) LIKE ?2
                OR lower(COALESCE(v.reference_no, '')) LIKE ?2
                OR lower(COALESCE(v.narration, '')) LIKE ?2
                OR lower(COALESCE(p.name, '')) LIKE ?2)
         ORDER BY v.voucher_date DESC, v.id DESC
         LIMIT ?3",
    )?;
    let rows = stmt.query_map(params![company_id, term, limit], |row| {
        let voucher_type: String = row.get(2)?;
        let date: String = row.get(3)?;
        let party_name: Option<String> = row.get(5)?;

        let mut parts: Vec<String> = vec![voucher_type];
        if let Some(party_name) = party_name {
            if !party_name.is_empty() {
                parts.push(party_name);
            }
        }

        Ok(SearchResult {
            id: row.get(0)?,
            kind: "VOUCHER",
            title: row.get(1)?,
            subtitle: Some(parts.join(" · ")),
            meta: Some(date),
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn accounts(conn: &Connection, company_id: i64, query: &str, limit: i64) -> AppResult<Vec<SearchResult>> {
    let term = pattern(query);
    let mut stmt = conn.prepare(
        "SELECT a.id, a.name, g.name AS group_name, a.system_key
         FROM accounts a
         INNER JOIN account_groups g ON g.id = a.group_id
         WHERE a.company_id = ?1 AND a.is_active = 1
           AND (lower(a.name) LIKE ?2
                OR lower(g.name) LIKE ?2
                OR lower(COALESCE(a.system_key, '')) LIKE ?2)
         ORDER BY g.sort_order, a.name
         LIMIT ?3",
    )?;
    let rows = stmt.query_map(params![company_id, term, limit], |row| {
        Ok(SearchResult {
            id: row.get(0)?,
            kind: "ACCOUNT",
            title: row.get(1)?,
            subtitle: row.get(2)?,
            meta: row.get(3)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}
