//! Starter data: permission catalog, roles and company defaults.
//! Mirrors `src/main/db/seed.ts`. Every statement is idempotent.

use rusqlite::{params, Connection};

use crate::db::permissions::ALL_PERMISSION_CODES;
use crate::error::AppResult;

pub struct SeedRole {
    pub name: &'static str,
    pub is_system: bool,
    pub is_super: bool,
    pub description: &'static str,
    pub permissions: &'static [&'static str],
}

/// Owner and Admin are system roles and super. The others are ordinary and
/// editable through role_permissions rows.
pub const SEED_ROLES: &[SeedRole] = &[
    SeedRole {
        name: "Owner",
        is_system: true,
        is_super: true,
        description: "Full access to every part of the books",
        permissions: &[],
    },
    SeedRole {
        name: "Admin",
        is_system: true,
        is_super: true,
        description: "Full access, including users and settings",
        permissions: &[],
    },
    SeedRole {
        name: "Accountant",
        is_system: false,
        is_super: false,
        description: "Masters, vouchers, payments and reports",
        permissions: &[
            "company.view",
            "party.view",
            "party.create",
            "party.edit",
            "party.deactivate",
            "item.view",
            "item.create",
            "item.edit",
            "item.deactivate",
            "voucher.view",
            "voucher.create",
            "voucher.post",
            "voucher.cancel",
            "receipt.view",
            "receipt.record",
            "payment.view",
            "payment.record",
            "note.view",
            "note.create",
            "journal.view",
            "journal.create",
            "report.view",
            "report.export",
            "user.view",
            "role.view",
            "backup.manage",
        ],
    },
    SeedRole {
        name: "Billing Clerk",
        is_system: false,
        is_super: false,
        description: "Raises bills and records receipts",
        permissions: &[
            "party.view",
            "party.create",
            "item.view",
            "voucher.view",
            "voucher.create",
            "voucher.post",
            "receipt.view",
            "receipt.record",
            "report.view",
        ],
    },
    SeedRole {
        name: "Auditor",
        is_system: false,
        is_super: false,
        description: "Read only access to books and reports",
        permissions: &[
            "company.view",
            "party.view",
            "item.view",
            "voucher.view",
            "receipt.view",
            "payment.view",
            "note.view",
            "journal.view",
            "report.view",
            "report.export",
            "user.view",
            "role.view",
        ],
    },
];

/// Inserts any permission code missing from the catalog table.
pub fn seed_permissions(conn: &Connection) -> AppResult<()> {
    let mut stmt = conn.prepare("INSERT INTO permissions (code) VALUES (?1) ON CONFLICT(code) DO NOTHING")?;
    for code in ALL_PERMISSION_CODES {
        stmt.execute(params![code])?;
    }
    Ok(())
}

/// Creates the starter roles for a company and grants their permissions.
pub fn seed_roles_for_company(conn: &Connection, company_id: i64) -> AppResult<()> {
    for role in SEED_ROLES {
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM roles WHERE company_id = ?1 AND name = ?2",
                params![company_id, role.name],
                |row| row.get(0),
            )
            .ok();

        let role_id = match existing {
            Some(id) => id,
            None => {
                conn.execute(
                    "INSERT INTO roles (company_id, name, is_system_role, is_super, description)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        company_id,
                        role.name,
                        i64::from(role.is_system),
                        i64::from(role.is_super),
                        role.description
                    ],
                )?;
                conn.last_insert_rowid()
            }
        };

        if role.is_super {
            continue;
        }
        for code in role.permissions {
            conn.execute(
                "INSERT INTO role_permissions (role_id, permission_id)
                 SELECT ?1, id FROM permissions WHERE code = ?2
                 ON CONFLICT DO NOTHING",
                params![role_id, code],
            )?;
        }
    }
    Ok(())
}

const UNIT_SEED: &[(&str, &str, i64)] = &[
    ("Nos", "nos", 0),
    ("Pcs", "pcs", 0),
    ("Kg", "kg", 3),
    ("Gm", "gm", 0),
    ("Ltr", "ltr", 3),
    ("Ml", "ml", 0),
    ("Mtr", "mtr", 3),
    ("Box", "box", 0),
    ("Pack", "pack", 0),
    ("Set", "set", 0),
    ("Hrs", "hrs", 2),
];

const GROUP_SEED: &[(&str, &str, i64)] = &[
    ("Capital Account", "EQUITY", 10),
    ("Loans", "LIABILITY", 20),
    ("Current Liabilities", "LIABILITY", 30),
    ("Sundry Creditors", "LIABILITY", 40),
    ("Duties and Taxes", "LIABILITY", 50),
    ("Current Assets", "ASSET", 60),
    ("Cash in Hand", "ASSET", 70),
    ("Bank Accounts", "ASSET", 80),
    ("Sundry Debtors", "ASSET", 90),
    ("Stock in Hand", "ASSET", 100),
    ("Fixed Assets", "ASSET", 110),
    ("Sales", "INCOME", 120),
    ("Sales Returns", "INCOME", 130),
    ("Direct Incomes", "INCOME", 140),
    ("Indirect Incomes", "INCOME", 150),
    ("Purchases", "EXPENSE", 160),
    ("Purchase Returns", "EXPENSE", 170),
    ("Direct Expenses", "EXPENSE", 180),
    ("Indirect Expenses", "EXPENSE", 190),
];

const ACCOUNT_SEED: &[(&str, &str, &str, Option<&str>)] = &[
    ("Cash in Hand", "Cash", "ASSET", Some("CASH")),
    ("Bank Accounts", "Bank", "ASSET", Some("BANK")),
    ("Sales", "Sales", "INCOME", Some("SALES")),
    ("Sales Returns", "Sales Returns", "INCOME", Some("SALES_RETURNS")),
    ("Purchases", "Purchases", "EXPENSE", Some("PURCHASES")),
    ("Purchase Returns", "Purchase Returns", "EXPENSE", Some("PURCHASE_RETURNS")),
    ("Duties and Taxes", "Output CGST", "LIABILITY", Some("OUTPUT_CGST")),
    ("Duties and Taxes", "Output SGST", "LIABILITY", Some("OUTPUT_SGST")),
    ("Duties and Taxes", "Output IGST", "LIABILITY", Some("OUTPUT_IGST")),
    ("Duties and Taxes", "Input CGST", "ASSET", Some("INPUT_CGST")),
    ("Duties and Taxes", "Input SGST", "ASSET", Some("INPUT_SGST")),
    ("Duties and Taxes", "Input IGST", "ASSET", Some("INPUT_IGST")),
    ("Indirect Expenses", "Round Off", "EXPENSE", Some("ROUND_OFF")),
    ("Direct Expenses", "Cost of Goods Sold", "EXPENSE", Some("COGS")),
    ("Stock in Hand", "Inventory", "ASSET", Some("INVENTORY")),
    ("Indirect Expenses", "Stock Adjustment", "EXPENSE", Some("STOCK_ADJUSTMENT")),
    ("Capital Account", "Opening Balance Difference", "EQUITY", Some("OPENING_DIFF")),
    ("Indirect Expenses", "Discount Given", "EXPENSE", Some("DISCOUNT_GIVEN")),
    ("Indirect Incomes", "Discount Received", "INCOME", Some("DISCOUNT_RECEIVED")),
];

/// GST 2.0 slabs, effective 22 September 2025.
const TAX_RATES: &[i64] = &[0, 5, 18, 40];

const PAYMENT_METHOD_SEED: &[&str] = &["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "NEFT", "RTGS"];

/// Seeds the reference data a company needs before its first voucher.
pub fn seed_company_defaults(conn: &Connection, company_id: i64, books_begin_date: &str) -> AppResult<()> {
    for (name, symbol, decimals) in UNIT_SEED {
        conn.execute(
            "INSERT INTO units (company_id, name, symbol, decimals, is_system)
             VALUES (?1, ?2, ?3, ?4, 1)
             ON CONFLICT DO NOTHING",
            params![company_id, name, symbol, decimals],
        )?;
    }

    for (name, nature, sort_order) in GROUP_SEED {
        conn.execute(
            "INSERT INTO account_groups (company_id, name, nature, sort_order, is_system)
             VALUES (?1, ?2, ?3, ?4, 1)
             ON CONFLICT DO NOTHING",
            params![company_id, name, nature, sort_order],
        )?;
    }

    for (group_name, name, account_type, system_key) in ACCOUNT_SEED {
        conn.execute(
            "INSERT INTO accounts (company_id, group_id, name, type, system_key, is_system)
             SELECT ?1, g.id, ?3, ?4, ?5, ?6
             FROM account_groups g
             WHERE g.company_id = ?1 AND g.name = ?2
             ON CONFLICT DO NOTHING",
            params![
                company_id,
                group_name,
                name,
                account_type,
                system_key,
                i64::from(system_key.is_some())
            ],
        )?;
    }

    conn.execute(
        "INSERT INTO stock_groups (company_id, name) VALUES (?1, 'General') ON CONFLICT DO NOTHING",
        params![company_id],
    )?;

    conn.execute(
        "INSERT INTO godowns (company_id, name) VALUES (?1, 'Main Location') ON CONFLICT DO NOTHING",
        params![company_id],
    )?;

    let existing_rates: i64 =
        conn.query_row("SELECT COUNT(*) FROM tax_rates WHERE company_id = ?1", params![company_id], |row| {
            row.get(0)
        })?;
    if existing_rates == 0 {
        for rate in TAX_RATES {
            conn.execute(
                "INSERT INTO tax_rates (company_id, gst_rate_bps, cess_rate_bps, description, effective_from)
                 VALUES (?1, ?2, 0, ?3, ?4)",
                params![
                    company_id,
                    rate * 100,
                    if *rate == 0 { "Exempt".to_string() } else { format!("GST {rate}%") },
                    books_begin_date
                ],
            )?;
        }
    }

    for (index, name) in PAYMENT_METHOD_SEED.iter().enumerate() {
        conn.execute(
            "INSERT INTO payment_methods (company_id, name, sort_order)
             VALUES (?1, ?2, ?3)
             ON CONFLICT DO NOTHING",
            params![company_id, name, index as i64],
        )?;
    }

    Ok(())
}
