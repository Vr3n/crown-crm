//! Data access for masters. Mirrors `src/main/repositories/masters.ts`.
//!
//! Every function takes the caller's connection: the use cases in `mod.rs` own
//! the transaction boundary (`ctx.with_tx`), so repositories compose without
//! opening nested writes.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

/* -------------------------------------------------------------------------- */
/* Parties                                                                     */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone)]
pub struct Party {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gstin: Option<String>,
    pub state_code: Option<String>,
    pub billing_address: Option<String>,
    pub notes: Option<String>,
    pub is_customer: bool,
    pub is_supplier: bool,
    pub credit_days: i64,
    pub credit_limit_minor: i64,
    pub opening_balance_minor: i64,
    pub is_active: bool,
    pub balance_minor: i64,
}

impl Party {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "phone": self.phone,
            "email": self.email,
            "gstin": self.gstin,
            "stateCode": self.state_code,
            "billingAddress": self.billing_address,
            "notes": self.notes,
            "isCustomer": self.is_customer,
            "isSupplier": self.is_supplier,
            "creditDays": self.credit_days,
            "creditLimitMinor": self.credit_limit_minor,
            "openingBalanceMinor": self.opening_balance_minor,
            "isActive": self.is_active,
            "balanceMinor": self.balance_minor
        })
    }
}

/// Balance comes from posted ledger lines tagged to one of the party's accounts.
const PARTY_SELECT: &str = "SELECT p.id, p.name, p.phone, p.email, p.gstin, p.state_code,
       p.billing_address, p.notes, p.is_customer, p.is_supplier, p.credit_days,
       p.credit_limit_minor, p.opening_balance_minor, p.is_active,
       COALESCE((
         SELECT SUM(l.debit_minor - l.credit_minor)
         FROM ledger_lines l
         JOIN party_accounts pa ON pa.account_id = l.account_id
         JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
         WHERE pa.party_id = p.id AND l.company_id = p.company_id
       ), 0) AS balance_minor
     FROM parties p";

fn map_party(row: &rusqlite::Row<'_>) -> rusqlite::Result<Party> {
    Ok(Party {
        id: row.get(0)?,
        name: row.get(1)?,
        phone: row.get(2)?,
        email: row.get(3)?,
        gstin: row.get(4)?,
        state_code: row.get(5)?,
        billing_address: row.get(6)?,
        notes: row.get(7)?,
        is_customer: row.get::<_, i64>(8)? != 0,
        is_supplier: row.get::<_, i64>(9)? != 0,
        credit_days: row.get(10)?,
        credit_limit_minor: row.get(11)?,
        opening_balance_minor: row.get(12)?,
        is_active: row.get::<_, i64>(13)? != 0,
        balance_minor: row.get(14)?,
    })
}

pub fn list_parties(
    conn: &Connection,
    company_id: i64,
    query: Option<&str>,
    role: &str,
    include_inactive: bool,
) -> AppResult<Vec<Party>> {
    let mut clauses: Vec<&str> = vec!["p.company_id = ?"];
    let mut values: Vec<SqlValue> = vec![company_id.into()];

    if !include_inactive {
        clauses.push("p.is_active = 1");
    }
    match role {
        "CUSTOMER" => clauses.push("p.is_customer = 1"),
        "SUPPLIER" => clauses.push("p.is_supplier = 1"),
        _ => {}
    }
    if let Some(query) = query {
        let pattern = format!("%{}%", query.to_lowercase());
        clauses.push(
            "(lower(p.name) LIKE ? OR lower(COALESCE(p.phone, '')) LIKE ? OR lower(COALESCE(p.gstin, '')) LIKE ?)",
        );
        values.push(pattern.clone().into());
        values.push(pattern.clone().into());
        values.push(pattern.into());
    }

    let sql = format!(
        "{PARTY_SELECT} WHERE {} ORDER BY p.name COLLATE NOCASE",
        clauses.join(" AND ")
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(values), map_party)?;
    let mut parties = Vec::new();
    for row in rows {
        parties.push(row?);
    }
    Ok(parties)
}

pub fn find_party(conn: &Connection, company_id: i64, id: i64) -> AppResult<Option<Party>> {
    let sql = format!("{PARTY_SELECT} WHERE p.company_id = ?1 AND p.id = ?2");
    Ok(conn.query_row(&sql, params![company_id, id], map_party).optional()?)
}

pub struct NewParty {
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gstin: Option<String>,
    pub state_code: Option<String>,
    pub billing_address: Option<String>,
    pub is_customer: bool,
    pub is_supplier: bool,
    pub credit_days: i64,
    pub credit_limit_minor: i64,
    pub opening_balance_minor: i64,
    pub opening_balance_date: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<i64>,
}

pub fn insert_party(conn: &Connection, company_id: i64, input: &NewParty) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO parties (company_id, name, phone, email, gstin, state_code, billing_address,
           is_customer, is_supplier, credit_days, credit_limit_minor, opening_balance_minor,
           opening_balance_date, notes, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            company_id,
            input.name,
            input.phone,
            input.email,
            input.gstin,
            input.state_code,
            input.billing_address,
            i64::from(input.is_customer),
            i64::from(input.is_supplier),
            input.credit_days,
            input.credit_limit_minor,
            input.opening_balance_minor,
            input.opening_balance_date,
            input.notes,
            input.created_by
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Patch semantics: `None` keeps the stored value, `Some(None)` clears it.
#[derive(Default)]
pub struct PartyPatch {
    pub name: Option<String>,
    pub phone: Option<Option<String>>,
    pub email: Option<Option<String>>,
    pub gstin: Option<Option<String>>,
    pub state_code: Option<Option<String>>,
    pub billing_address: Option<Option<String>>,
    pub notes: Option<Option<String>>,
    pub credit_days: Option<i64>,
    pub credit_limit_minor: Option<i64>,
    pub opening_balance_minor: Option<i64>,
    pub opening_balance_date: Option<Option<String>>,
    pub is_customer: Option<bool>,
    pub is_supplier: Option<bool>,
}

/// Applies a patch, then keeps the party's ledger account names in step with
/// the party name and creates any missing debtor/creditor account.
pub fn update_party(
    conn: &Connection,
    company_id: i64,
    id: i64,
    patch: &PartyPatch,
) -> AppResult<Option<Party>> {
    if patch.opening_balance_minor.is_some() {
        let posted = conn
            .query_row(
                "SELECT 1 FROM vouchers WHERE company_id = ?1 AND voucher_type = 'OPENING' LIMIT 1",
                params![company_id],
                |_| Ok(()),
            )
            .optional()?;
        if posted.is_some() {
            return Err(AppError::internal(
                "Opening balances are already posted and cannot be changed",
            ));
        }
    }

    let mut sets: Vec<&str> = vec!["updated_at = datetime('now')"];
    let mut values: Vec<SqlValue> = Vec::new();

    if let Some(name) = &patch.name {
        sets.push("name = ?");
        values.push(name.clone().into());
    }
    if let Some(phone) = &patch.phone {
        sets.push("phone = ?");
        values.push(phone.clone().into());
    }
    if let Some(email) = &patch.email {
        sets.push("email = ?");
        values.push(email.clone().into());
    }
    if let Some(gstin) = &patch.gstin {
        sets.push("gstin = ?");
        values.push(gstin.clone().into());
    }
    if let Some(state_code) = &patch.state_code {
        sets.push("state_code = ?");
        values.push(state_code.clone().into());
    }
    if let Some(billing_address) = &patch.billing_address {
        sets.push("billing_address = ?");
        values.push(billing_address.clone().into());
    }
    if let Some(credit_days) = patch.credit_days {
        sets.push("credit_days = ?");
        values.push(credit_days.into());
    }
    if let Some(credit_limit_minor) = patch.credit_limit_minor {
        sets.push("credit_limit_minor = ?");
        values.push(credit_limit_minor.into());
    }
    if let Some(opening_balance_minor) = patch.opening_balance_minor {
        sets.push("opening_balance_minor = ?");
        values.push(opening_balance_minor.into());
    }
    if let Some(opening_balance_date) = &patch.opening_balance_date {
        sets.push("opening_balance_date = ?");
        values.push(opening_balance_date.clone().into());
    }
    if let Some(notes) = &patch.notes {
        sets.push("notes = ?");
        values.push(notes.clone().into());
    }
    if let Some(is_customer) = patch.is_customer {
        sets.push("is_customer = ?");
        values.push(i64::from(is_customer).into());
    }
    if let Some(is_supplier) = patch.is_supplier {
        sets.push("is_supplier = ?");
        values.push(i64::from(is_supplier).into());
    }

    let sql = format!("UPDATE parties SET {} WHERE company_id = ? AND id = ?", sets.join(", "));
    values.push(company_id.into());
    values.push(id.into());
    conn.execute(&sql, params_from_iter(values))?;

    if patch.is_customer.is_some() || patch.is_supplier.is_some() {
        if let Some(party) = find_party(conn, company_id, id)? {
            ensure_party_accounts(
                conn,
                company_id,
                party.id,
                &party.name,
                party.is_customer,
                party.is_supplier,
            )?;
        }
    }

    if patch.name.is_some() {
        if let Some(party) = find_party(conn, company_id, id)? {
            let accounts = party_accounts_for(conn, company_id, id)?;
            if let Some(debtor) = accounts.debtor {
                conn.execute(
                    "UPDATE accounts SET name = ?1 WHERE company_id = ?2 AND id = ?3",
                    params![party.name, company_id, debtor],
                )?;
            }
            if let Some(creditor) = accounts.creditor {
                let name = if party.is_customer {
                    format!("{} (Creditor)", party.name)
                } else {
                    party.name.clone()
                };
                conn.execute(
                    "UPDATE accounts SET name = ?1 WHERE company_id = ?2 AND id = ?3",
                    params![name, company_id, creditor],
                )?;
            }
        }
    }

    find_party(conn, company_id, id)
}

pub fn set_party_active(conn: &Connection, company_id: i64, id: i64, active: bool) -> AppResult<()> {
    conn.execute(
        "UPDATE parties SET is_active = ?1 WHERE company_id = ?2 AND id = ?3",
        params![i64::from(active), company_id, id],
    )?;
    Ok(())
}

#[derive(Default)]
pub struct PartyAccounts {
    pub debtor: Option<i64>,
    pub creditor: Option<i64>,
}

pub fn party_accounts_for(
    conn: &Connection,
    company_id: i64,
    party_id: i64,
) -> AppResult<PartyAccounts> {
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

/// Creates the party's sundry debtor/creditor ledger accounts when missing.
pub fn ensure_party_accounts(
    conn: &Connection,
    company_id: i64,
    party_id: i64,
    party_name: &str,
    is_customer: bool,
    is_supplier: bool,
) -> AppResult<()> {
    let debtor_group: Option<i64> = conn
        .query_row(
            "SELECT id FROM account_groups WHERE company_id = ?1 AND name = 'Sundry Debtors'",
            params![company_id],
            |row| row.get(0),
        )
        .optional()?;
    let creditor_group: Option<i64> = conn
        .query_row(
            "SELECT id FROM account_groups WHERE company_id = ?1 AND name = 'Sundry Creditors'",
            params![company_id],
            |row| row.get(0),
        )
        .optional()?;
    let (Some(debtor_group), Some(creditor_group)) = (debtor_group, creditor_group) else {
        return Err(AppError::internal("Party groups are missing"));
    };

    let existing = party_accounts_for(conn, company_id, party_id)?;

    if is_customer && existing.debtor.is_none() {
        conn.execute(
            "INSERT INTO accounts (company_id, group_id, name, type) VALUES (?1, ?2, ?3, 'ASSET')",
            params![company_id, debtor_group, party_name],
        )?;
        let account_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO party_accounts (company_id, party_id, account_id, role)
             VALUES (?1, ?2, ?3, 'DEBTOR')",
            params![company_id, party_id, account_id],
        )?;
    }

    if is_supplier && existing.creditor.is_none() {
        let name = if is_customer {
            format!("{party_name} (Creditor)")
        } else {
            party_name.to_string()
        };
        conn.execute(
            "INSERT INTO accounts (company_id, group_id, name, type) VALUES (?1, ?2, ?3, 'LIABILITY')",
            params![company_id, creditor_group, name],
        )?;
        let account_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO party_accounts (company_id, party_id, account_id, role)
             VALUES (?1, ?2, ?3, 'CREDITOR')",
            params![company_id, party_id, account_id],
        )?;
    }

    Ok(())
}

/* -------------------------------------------------------------------------- */
/* Items                                                                       */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone)]
pub struct Item {
    pub id: i64,
    pub name: String,
    pub sku: Option<String>,
    pub hsn_sac: Option<String>,
    pub uom: Option<String>,
    pub uom_id: Option<i64>,
    pub gst_rate_bps: i64,
    pub cess_rate_bps: i64,
    pub is_service: bool,
    pub sale_price_minor: i64,
    pub purchase_price_minor: i64,
    pub sale_price_includes_tax: bool,
    pub purchase_price_includes_tax: bool,
    pub opening_qty_e4: i64,
    pub opening_rate_minor: i64,
    pub stock_qty_e4: i64,
    pub reorder_level_e4: i64,
    pub stock_group_id: Option<i64>,
    pub stock_group: Option<String>,
    pub is_active: bool,
}

impl Item {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "sku": self.sku,
            "hsnSac": self.hsn_sac,
            "uom": self.uom,
            "uomId": self.uom_id,
            "gstRateBps": self.gst_rate_bps,
            "cessRateBps": self.cess_rate_bps,
            "isService": self.is_service,
            "salePriceMinor": self.sale_price_minor,
            "purchasePriceMinor": self.purchase_price_minor,
            "salePriceIncludesTax": self.sale_price_includes_tax,
            "purchasePriceIncludesTax": self.purchase_price_includes_tax,
            "openingQtyE4": self.opening_qty_e4,
            "openingRateMinor": self.opening_rate_minor,
            "stockQtyE4": self.stock_qty_e4,
            "reorderLevelE4": self.reorder_level_e4,
            "stockGroupId": self.stock_group_id,
            "stockGroup": self.stock_group,
            "isActive": self.is_active
        })
    }
}

const ITEM_SELECT: &str = "SELECT i.id, i.name, i.sku, i.hsn_sac, i.uom_id, i.gst_rate_bps,
       i.is_service, i.sale_price_minor, i.purchase_price_minor, i.opening_qty_e4,
       i.opening_rate_minor, i.reorder_level_e4, i.stock_group_id, i.is_active,
       u.name AS uom_name, sg.name AS stock_group,
       COALESCE((
         SELECT SUM(m.qty_in_e4 - m.qty_out_e4)
         FROM stock_movements m
         JOIN vouchers v ON v.id = m.voucher_id AND v.status = 'POSTED'
         WHERE m.item_id = i.id
       ), 0) AS stock_qty,
       i.cess_rate_bps, i.sale_price_includes_tax, i.purchase_price_includes_tax
     FROM items i
     LEFT JOIN units u ON u.id = i.uom_id
     LEFT JOIN stock_groups sg ON sg.id = i.stock_group_id";

fn map_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<Item> {
    Ok(Item {
        id: row.get(0)?,
        name: row.get(1)?,
        sku: row.get(2)?,
        hsn_sac: row.get(3)?,
        uom_id: row.get(4)?,
        gst_rate_bps: row.get(5)?,
        is_service: row.get::<_, i64>(6)? != 0,
        sale_price_minor: row.get(7)?,
        purchase_price_minor: row.get(8)?,
        opening_qty_e4: row.get(9)?,
        opening_rate_minor: row.get(10)?,
        reorder_level_e4: row.get(11)?,
        stock_group_id: row.get(12)?,
        is_active: row.get::<_, i64>(13)? != 0,
        uom: row.get(14)?,
        stock_group: row.get(15)?,
        stock_qty_e4: row.get(16)?,
        cess_rate_bps: row.get(17)?,
        sale_price_includes_tax: row.get::<_, i64>(18)? != 0,
        purchase_price_includes_tax: row.get::<_, i64>(19)? != 0,
    })
}

pub fn list_items(
    conn: &Connection,
    company_id: i64,
    query: Option<&str>,
    include_inactive: bool,
) -> AppResult<Vec<Item>> {
    let mut clauses: Vec<&str> = vec!["i.company_id = ?"];
    let mut values: Vec<SqlValue> = vec![company_id.into()];

    if !include_inactive {
        clauses.push("i.is_active = 1");
    }
    if let Some(query) = query {
        let pattern = format!("%{}%", query.to_lowercase());
        clauses.push(
            "(lower(i.name) LIKE ? OR lower(COALESCE(i.sku, '')) LIKE ? OR lower(COALESCE(i.hsn_sac, '')) LIKE ?)",
        );
        values.push(pattern.clone().into());
        values.push(pattern.clone().into());
        values.push(pattern.into());
    }

    let sql = format!(
        "{ITEM_SELECT} WHERE {} ORDER BY i.name COLLATE NOCASE",
        clauses.join(" AND ")
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(values), map_item)?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

pub fn find_item(conn: &Connection, company_id: i64, id: i64) -> AppResult<Option<Item>> {
    let sql = format!("{ITEM_SELECT} WHERE i.company_id = ?1 AND i.id = ?2");
    Ok(conn.query_row(&sql, params![company_id, id], map_item).optional()?)
}

pub struct NewItem {
    pub name: String,
    pub sku: Option<String>,
    pub hsn_sac: Option<String>,
    pub uom_id: Option<i64>,
    pub gst_rate_bps: i64,
    pub cess_rate_bps: i64,
    pub is_service: bool,
    pub sale_price_minor: i64,
    pub purchase_price_minor: i64,
    pub sale_price_includes_tax: bool,
    pub purchase_price_includes_tax: bool,
    pub opening_qty_e4: i64,
    pub opening_rate_minor: i64,
    pub reorder_level_e4: i64,
    pub created_by: Option<i64>,
}

pub fn insert_item(conn: &Connection, company_id: i64, input: &NewItem) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO items (company_id, name, sku, hsn_sac, uom_id, gst_rate_bps, cess_rate_bps,
           is_service, sale_price_minor, purchase_price_minor, sale_price_includes_tax,
           purchase_price_includes_tax, opening_qty_e4, opening_rate_minor, reorder_level_e4,
           created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            company_id,
            input.name,
            input.sku,
            input.hsn_sac,
            input.uom_id,
            input.gst_rate_bps,
            input.cess_rate_bps,
            i64::from(input.is_service),
            input.sale_price_minor,
            input.purchase_price_minor,
            i64::from(input.sale_price_includes_tax),
            i64::from(input.purchase_price_includes_tax),
            input.opening_qty_e4,
            input.opening_rate_minor,
            input.reorder_level_e4,
            input.created_by
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Patch semantics: `None` keeps the stored value, `Some(None)` clears it.
#[derive(Default)]
pub struct ItemPatch {
    pub name: Option<String>,
    pub sku: Option<Option<String>>,
    pub hsn_sac: Option<Option<String>>,
    pub uom_id: Option<Option<i64>>,
    pub gst_rate_bps: Option<i64>,
    pub cess_rate_bps: Option<i64>,
    pub is_service: Option<bool>,
    pub sale_price_minor: Option<i64>,
    pub purchase_price_minor: Option<i64>,
    pub sale_price_includes_tax: Option<bool>,
    pub purchase_price_includes_tax: Option<bool>,
    pub opening_qty_e4: Option<i64>,
    pub opening_rate_minor: Option<i64>,
    pub reorder_level_e4: Option<i64>,
}

pub fn update_item(
    conn: &Connection,
    company_id: i64,
    id: i64,
    patch: &ItemPatch,
) -> AppResult<Option<Item>> {
    if patch.opening_qty_e4.is_some() || patch.opening_rate_minor.is_some() {
        let has_stock = conn
            .query_row(
                "SELECT 1 FROM stock_movements WHERE company_id = ?1 AND item_id = ?2 LIMIT 1",
                params![company_id, id],
                |_| Ok(()),
            )
            .optional()?;
        if has_stock.is_some() {
            return Err(AppError::internal(
                "Opening stock cannot change after the item has movements",
            ));
        }
    }

    let mut sets: Vec<&str> = vec!["updated_at = datetime('now')"];
    let mut values: Vec<SqlValue> = Vec::new();

    if let Some(name) = &patch.name {
        sets.push("name = ?");
        values.push(name.clone().into());
    }
    if let Some(sku) = &patch.sku {
        sets.push("sku = ?");
        values.push(sku.clone().into());
    }
    if let Some(hsn_sac) = &patch.hsn_sac {
        sets.push("hsn_sac = ?");
        values.push(hsn_sac.clone().into());
    }
    if let Some(uom_id) = &patch.uom_id {
        sets.push("uom_id = ?");
        values.push(uom_id.clone().into());
    }
    if let Some(gst_rate_bps) = patch.gst_rate_bps {
        sets.push("gst_rate_bps = ?");
        values.push(gst_rate_bps.into());
    }
    if let Some(cess_rate_bps) = patch.cess_rate_bps {
        sets.push("cess_rate_bps = ?");
        values.push(cess_rate_bps.into());
    }
    if let Some(is_service) = patch.is_service {
        sets.push("is_service = ?");
        values.push(i64::from(is_service).into());
    }
    if let Some(sale_price_minor) = patch.sale_price_minor {
        sets.push("sale_price_minor = ?");
        values.push(sale_price_minor.into());
    }
    if let Some(purchase_price_minor) = patch.purchase_price_minor {
        sets.push("purchase_price_minor = ?");
        values.push(purchase_price_minor.into());
    }
    if let Some(sale_price_includes_tax) = patch.sale_price_includes_tax {
        sets.push("sale_price_includes_tax = ?");
        values.push(i64::from(sale_price_includes_tax).into());
    }
    if let Some(purchase_price_includes_tax) = patch.purchase_price_includes_tax {
        sets.push("purchase_price_includes_tax = ?");
        values.push(i64::from(purchase_price_includes_tax).into());
    }
    if let Some(opening_qty_e4) = patch.opening_qty_e4 {
        sets.push("opening_qty_e4 = ?");
        values.push(opening_qty_e4.into());
    }
    if let Some(opening_rate_minor) = patch.opening_rate_minor {
        sets.push("opening_rate_minor = ?");
        values.push(opening_rate_minor.into());
    }
    if let Some(reorder_level_e4) = patch.reorder_level_e4 {
        sets.push("reorder_level_e4 = ?");
        values.push(reorder_level_e4.into());
    }

    let sql = format!("UPDATE items SET {} WHERE company_id = ? AND id = ?", sets.join(", "));
    values.push(company_id.into());
    values.push(id.into());
    conn.execute(&sql, params_from_iter(values))?;

    find_item(conn, company_id, id)
}

pub fn set_item_active(conn: &Connection, company_id: i64, id: i64, active: bool) -> AppResult<()> {
    conn.execute(
        "UPDATE items SET is_active = ?1 WHERE company_id = ?2 AND id = ?3",
        params![i64::from(active), company_id, id],
    )?;
    Ok(())
}

/* -------------------------------------------------------------------------- */
/* Accounts                                                                    */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone)]
pub struct Account {
    pub id: i64,
    pub name: String,
    pub group_name: String,
    pub account_type: String,
    pub system_key: Option<String>,
    pub is_system: bool,
    pub is_active: bool,
    pub balance_minor: i64,
}

impl Account {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "groupName": self.group_name,
            "type": self.account_type,
            "systemKey": self.system_key,
            "isSystem": self.is_system,
            "isActive": self.is_active,
            "balanceMinor": self.balance_minor
        })
    }
}

#[derive(Debug, Clone)]
pub struct AccountGroup {
    pub id: i64,
    pub name: String,
    pub nature: String,
}

impl AccountGroup {
    pub fn to_json(&self) -> Value {
        json!({ "id": self.id, "name": self.name, "nature": self.nature })
    }
}

const ACCOUNT_SELECT: &str = "SELECT a.id, a.name, g.name AS group_name, a.type, a.system_key,
       a.is_system, a.is_active,
       COALESCE((
         SELECT SUM(l.debit_minor - l.credit_minor)
         FROM ledger_lines l
         JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
         WHERE l.account_id = a.id
       ), 0) AS balance_minor
     FROM accounts a
     JOIN account_groups g ON g.id = a.group_id";

fn map_account(row: &rusqlite::Row<'_>) -> rusqlite::Result<Account> {
    Ok(Account {
        id: row.get(0)?,
        name: row.get(1)?,
        group_name: row.get(2)?,
        account_type: row.get(3)?,
        system_key: row.get(4)?,
        is_system: row.get::<_, i64>(5)? != 0,
        is_active: row.get::<_, i64>(6)? != 0,
        balance_minor: row.get(7)?,
    })
}

pub fn list_accounts(
    conn: &Connection,
    company_id: i64,
    include_inactive: bool,
) -> AppResult<Vec<Account>> {
    let filter = if include_inactive { "" } else { " AND a.is_active = 1" };
    let sql = format!(
        "{ACCOUNT_SELECT} WHERE a.company_id = ?1{filter} ORDER BY g.sort_order, a.name COLLATE NOCASE"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![company_id], map_account)?;
    let mut accounts = Vec::new();
    for row in rows {
        accounts.push(row?);
    }
    Ok(accounts)
}

pub fn list_account_groups(conn: &Connection, company_id: i64) -> AppResult<Vec<AccountGroup>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, nature FROM account_groups WHERE company_id = ?1 ORDER BY sort_order",
    )?;
    let rows = stmt.query_map(params![company_id], |row| {
        Ok(AccountGroup { id: row.get(0)?, name: row.get(1)?, nature: row.get(2)? })
    })?;
    let mut groups = Vec::new();
    for row in rows {
        groups.push(row?);
    }
    Ok(groups)
}

pub fn insert_account(
    conn: &Connection,
    company_id: i64,
    group_id: i64,
    name: &str,
    account_type: &str,
    opening_balance_minor: i64,
    opening_balance_side: &str,
) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO accounts (company_id, group_id, name, type, opening_balance_minor,
           opening_balance_side)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            company_id,
            group_id,
            name,
            account_type,
            opening_balance_minor,
            opening_balance_side
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn set_account_active(
    conn: &Connection,
    company_id: i64,
    id: i64,
    active: bool,
) -> AppResult<()> {
    conn.execute(
        "UPDATE accounts SET is_active = ?1 WHERE company_id = ?2 AND id = ?3",
        params![i64::from(active), company_id, id],
    )?;
    Ok(())
}

/* -------------------------------------------------------------------------- */
/* Units                                                                       */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone)]
pub struct Unit {
    pub id: i64,
    pub name: String,
    pub symbol: String,
    pub decimals: i64,
    pub is_system: bool,
    pub is_active: bool,
    pub usage_count: i64,
}

impl Unit {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "symbol": self.symbol,
            "decimals": self.decimals,
            "isSystem": self.is_system,
            "isActive": self.is_active,
            "usageCount": self.usage_count
        })
    }
}

const UNIT_SELECT: &str = "SELECT u.id, u.name, u.symbol, u.decimals, u.is_system, u.is_active,
       (SELECT COUNT(*) FROM items i
         WHERE i.company_id = u.company_id AND i.uom_id = u.id) AS usage_count
     FROM units u";

fn map_unit(row: &rusqlite::Row<'_>) -> rusqlite::Result<Unit> {
    Ok(Unit {
        id: row.get(0)?,
        name: row.get(1)?,
        symbol: row.get(2)?,
        decimals: row.get(3)?,
        is_system: row.get::<_, i64>(4)? != 0,
        is_active: row.get::<_, i64>(5)? != 0,
        usage_count: row.get(6)?,
    })
}

pub fn list_units(
    conn: &Connection,
    company_id: i64,
    include_inactive: bool,
) -> AppResult<Vec<Unit>> {
    let filter = if include_inactive { "" } else { " AND u.is_active = 1" };
    let sql = format!(
        "{UNIT_SELECT} WHERE u.company_id = ?1{filter} ORDER BY u.name COLLATE NOCASE, u.id"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![company_id], map_unit)?;
    let mut units = Vec::new();
    for row in rows {
        units.push(row?);
    }
    Ok(units)
}

pub fn find_unit(conn: &Connection, company_id: i64, id: i64) -> AppResult<Option<Unit>> {
    let sql = format!("{UNIT_SELECT} WHERE u.company_id = ?1 AND u.id = ?2");
    Ok(conn.query_row(&sql, params![company_id, id], map_unit).optional()?)
}

/// Case-insensitive duplicate check across both the label and the symbol.
pub fn find_unit_by_name_or_symbol(
    conn: &Connection,
    company_id: i64,
    name: &str,
    symbol: &str,
    exclude_id: Option<i64>,
) -> AppResult<Option<Unit>> {
    let exclude = if exclude_id.is_some() { " AND u.id != ?4" } else { "" };
    let sql = format!(
        "{UNIT_SELECT}
         WHERE u.company_id = ?1
           AND (u.name = ?2 COLLATE NOCASE OR u.symbol = ?3 COLLATE NOCASE){exclude}
         LIMIT 1"
    );
    let found = match exclude_id {
        Some(id) => conn
            .query_row(&sql, params![company_id, name, symbol, id], map_unit)
            .optional()?,
        None => conn
            .query_row(&sql, params![company_id, name, symbol], map_unit)
            .optional()?,
    };
    Ok(found)
}

pub fn insert_unit(
    conn: &Connection,
    company_id: i64,
    name: &str,
    symbol: &str,
    decimals: i64,
) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO units (company_id, name, symbol, decimals) VALUES (?1, ?2, ?3, ?4)",
        params![company_id, name, symbol, decimals],
    )?;
    Ok(conn.last_insert_rowid())
}

#[derive(Default)]
pub struct UnitPatch {
    pub name: Option<String>,
    pub symbol: Option<String>,
    pub decimals: Option<i64>,
    pub is_active: Option<bool>,
}

pub fn update_unit(
    conn: &Connection,
    company_id: i64,
    id: i64,
    patch: &UnitPatch,
) -> AppResult<Option<Unit>> {
    let mut sets: Vec<&str> = Vec::new();
    let mut values: Vec<SqlValue> = Vec::new();

    if let Some(name) = &patch.name {
        sets.push("name = ?");
        values.push(name.clone().into());
    }
    if let Some(symbol) = &patch.symbol {
        sets.push("symbol = ?");
        values.push(symbol.clone().into());
    }
    if let Some(decimals) = patch.decimals {
        sets.push("decimals = ?");
        values.push(decimals.into());
    }
    if let Some(is_active) = patch.is_active {
        sets.push("is_active = ?");
        values.push(i64::from(is_active).into());
    }

    if !sets.is_empty() {
        let sql = format!("UPDATE units SET {} WHERE company_id = ? AND id = ?", sets.join(", "));
        values.push(company_id.into());
        values.push(id.into());
        conn.execute(&sql, params_from_iter(values))?;
    }

    find_unit(conn, company_id, id)
}

/* -------------------------------------------------------------------------- */
/* Tax rates                                                                   */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone)]
pub struct TaxRate {
    pub id: i64,
    pub gst_rate_bps: i64,
    pub cess_rate_bps: i64,
    pub description: Option<String>,
    pub effective_from: String,
    pub effective_to: Option<String>,
    pub is_current: bool,
}

impl TaxRate {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "gstRateBps": self.gst_rate_bps,
            "cessRateBps": self.cess_rate_bps,
            "description": self.description,
            "effectiveFrom": self.effective_from,
            "effectiveTo": self.effective_to,
            "isCurrent": self.is_current
        })
    }
}

const TAX_RATE_SELECT: &str = "SELECT id, gst_rate_bps, cess_rate_bps, description, effective_from,
       effective_to
     FROM tax_rates";

fn map_tax_rate(row: &rusqlite::Row<'_>, as_of: &str) -> rusqlite::Result<TaxRate> {
    let effective_from: String = row.get(4)?;
    let effective_to: Option<String> = row.get(5)?;
    let is_current = effective_from.as_str() <= as_of
        && effective_to.as_deref().map(|end| end >= as_of).unwrap_or(true);
    Ok(TaxRate {
        id: row.get(0)?,
        gst_rate_bps: row.get(1)?,
        cess_rate_bps: row.get(2)?,
        description: row.get(3)?,
        effective_from,
        effective_to,
        is_current,
    })
}

/// Current rows by default; `include_history` returns ended and future
/// revisions too.
pub fn list_tax_rates(
    conn: &Connection,
    company_id: i64,
    as_of: &str,
    include_history: bool,
) -> AppResult<Vec<TaxRate>> {
    let filter = if include_history {
        ""
    } else {
        " AND effective_from <= ?2 AND (effective_to IS NULL OR effective_to >= ?2)"
    };
    let sql = format!(
        "{TAX_RATE_SELECT}
         WHERE company_id = ?1{filter}
         ORDER BY effective_from DESC, gst_rate_bps DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rates = Vec::new();
    if include_history {
        let rows = stmt.query_map(params![company_id], |row| map_tax_rate(row, as_of))?;
        for row in rows {
            rates.push(row?);
        }
    } else {
        let rows = stmt.query_map(params![company_id, as_of], |row| map_tax_rate(row, as_of))?;
        for row in rows {
            rates.push(row?);
        }
    }
    Ok(rates)
}

pub fn find_tax_rate(
    conn: &Connection,
    company_id: i64,
    id: i64,
    as_of: &str,
) -> AppResult<Option<TaxRate>> {
    let sql = format!("{TAX_RATE_SELECT} WHERE company_id = ?1 AND id = ?2");
    Ok(conn
        .query_row(&sql, params![company_id, id], |row| map_tax_rate(row, as_of))
        .optional()?)
}

/// Finds a date-range collision for the same GST/cess combination. Ranges are
/// inclusive at both ends, so touching rows must be separated by one day.
pub fn find_overlapping(
    conn: &Connection,
    company_id: i64,
    gst_rate_bps: i64,
    cess_rate_bps: i64,
    effective_from: &str,
    effective_to: Option<&str>,
    exclude_id: Option<i64>,
) -> AppResult<Option<TaxRate>> {
    let upper_bound = effective_to.unwrap_or("9999-12-31");
    let exclude = if exclude_id.is_some() { " AND id != ?6" } else { "" };
    let sql = format!(
        "{TAX_RATE_SELECT}
         WHERE company_id = ?1 AND gst_rate_bps = ?2 AND cess_rate_bps = ?3
           AND effective_from <= ?4
           AND (effective_to IS NULL OR effective_to >= ?5){exclude}
         LIMIT 1"
    );
    let found = match exclude_id {
        Some(id) => conn
            .query_row(
                &sql,
                params![company_id, gst_rate_bps, cess_rate_bps, upper_bound, effective_from, id],
                |row| map_tax_rate(row, effective_from),
            )
            .optional()?,
        None => conn
            .query_row(
                &sql,
                params![company_id, gst_rate_bps, cess_rate_bps, upper_bound, effective_from],
                |row| map_tax_rate(row, effective_from),
            )
            .optional()?,
    };
    Ok(found)
}

pub struct NewTaxRate {
    pub gst_rate_bps: i64,
    pub cess_rate_bps: i64,
    pub description: String,
    pub effective_from: String,
}

pub fn insert_tax_rate(
    conn: &Connection,
    company_id: i64,
    input: &NewTaxRate,
) -> AppResult<TaxRate> {
    conn.execute(
        "INSERT INTO tax_rates (company_id, gst_rate_bps, cess_rate_bps, description, effective_from)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            company_id,
            input.gst_rate_bps,
            input.cess_rate_bps,
            input.description,
            input.effective_from
        ],
    )?;
    let id = conn.last_insert_rowid();
    find_tax_rate(conn, company_id, id, &input.effective_from)?
        .ok_or_else(|| AppError::internal("Tax rate could not be created"))
}

pub fn set_effective_to(
    conn: &Connection,
    company_id: i64,
    id: i64,
    effective_to: &str,
) -> AppResult<()> {
    conn.execute(
        "UPDATE tax_rates SET effective_to = ?1 WHERE company_id = ?2 AND id = ?3",
        params![effective_to, company_id, id],
    )?;
    Ok(())
}

/* -------------------------------------------------------------------------- */
/* Godowns                                                                     */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone)]
pub struct Godown {
    pub id: i64,
    pub name: String,
}

impl Godown {
    pub fn to_json(&self) -> Value {
        json!({ "id": self.id, "name": self.name })
    }
}

pub fn list_godowns(conn: &Connection, company_id: i64) -> AppResult<Vec<Godown>> {
    let mut stmt = conn.prepare("SELECT id, name FROM godowns WHERE company_id = ?1 ORDER BY id")?;
    let rows =
        stmt.query_map(params![company_id], |row| Ok(Godown { id: row.get(0)?, name: row.get(1)? }))?;
    let mut godowns = Vec::new();
    for row in rows {
        godowns.push(row?);
    }
    Ok(godowns)
}
