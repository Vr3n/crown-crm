//! Data access for tenancy and access. Mirrors `src/main/repositories/identity.ts`.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct Company {
    pub id: i64,
    pub slug: String,
    pub name: String,
    pub legal_name: Option<String>,
    pub gstin: Option<String>,
    pub pan: Option<String>,
    pub state_code: String,
    pub address: Option<String>,
    pub city: Option<String>,
    pub pincode: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub currency: String,
    pub fy_start_month: i64,
    pub books_begin_date: String,
    pub logo: Option<String>,
    pub invoice_terms: Option<String>,
    pub costing_method: String,
    pub round_off_mode: String,
    pub allow_negative_stock: bool,
    pub status: String,
    pub numbering_setup_at: Option<String>,
    pub onboarding_completed_at: Option<String>,
}

impl Company {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "slug": self.slug,
            "name": self.name,
            "legalName": self.legal_name,
            "gstin": self.gstin,
            "pan": self.pan,
            "stateCode": self.state_code,
            "address": self.address,
            "city": self.city,
            "pincode": self.pincode,
            "phone": self.phone,
            "email": self.email,
            "currency": self.currency,
            "fyStartMonth": self.fy_start_month,
            "booksBeginDate": self.books_begin_date,
            "logo": self.logo,
            "invoiceTerms": self.invoice_terms,
            "costingMethod": self.costing_method,
            "roundOffMode": self.round_off_mode,
            "allowNegativeStock": self.allow_negative_stock,
            "status": self.status,
            "numberingSetupAt": self.numbering_setup_at,
            "onboardingCompletedAt": self.onboarding_completed_at
        })
    }
}

const COMPANY_COLUMNS: &str = "id, slug, name, legal_name, gstin, pan, state_code, address, city, pincode,
    phone, email, currency, fy_start_month, books_begin_date, logo, invoice_terms,
    costing_method, round_off_mode, allow_negative_stock, status, numbering_setup_at,
    onboarding_completed_at";

pub fn map_company(row: &rusqlite::Row<'_>) -> rusqlite::Result<Company> {
    Ok(Company {
        id: row.get(0)?,
        slug: row.get(1)?,
        name: row.get(2)?,
        legal_name: row.get(3)?,
        gstin: row.get(4)?,
        pan: row.get(5)?,
        state_code: row.get(6)?,
        address: row.get(7)?,
        city: row.get(8)?,
        pincode: row.get(9)?,
        phone: row.get(10)?,
        email: row.get(11)?,
        currency: row.get(12)?,
        fy_start_month: row.get(13)?,
        books_begin_date: row.get(14)?,
        logo: row.get(15)?,
        invoice_terms: row.get(16)?,
        costing_method: row.get(17)?,
        round_off_mode: row.get(18)?,
        allow_negative_stock: row.get::<_, i64>(19)? != 0,
        status: row.get(20)?,
        numbering_setup_at: row.get(21)?,
        onboarding_completed_at: row.get(22)?,
    })
}

pub struct NewCompany {
    pub slug: String,
    pub name: String,
    pub gstin: Option<String>,
    pub state_code: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub currency: String,
    pub books_begin_date: String,
}

pub fn create_company(conn: &Connection, input: &NewCompany) -> AppResult<Company> {
    conn.execute(
        "INSERT INTO companies (slug, name, gstin, state_code, phone, email, currency, books_begin_date, invoice_terms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL)",
        params![
            input.slug,
            input.name,
            input.gstin,
            input.state_code,
            input.phone,
            input.email,
            input.currency,
            input.books_begin_date
        ],
    )?;
    let id = conn.last_insert_rowid();
    find_company(conn, id)?.ok_or_else(|| AppError::internal("Company insert disappeared"))
}

pub fn find_company(conn: &Connection, id: i64) -> AppResult<Option<Company>> {
    let sql = format!("SELECT {COMPANY_COLUMNS} FROM companies WHERE id = ?1");
    let company = conn.query_row(&sql, params![id], map_company).optional()?;
    Ok(company)
}

pub fn find_first_company(conn: &Connection) -> AppResult<Option<Company>> {
    let sql = format!("SELECT {COMPANY_COLUMNS} FROM companies ORDER BY id LIMIT 1");
    let company = conn.query_row(&sql, [], map_company).optional()?;
    Ok(company)
}

pub fn count_companies(conn: &Connection) -> AppResult<i64> {
    Ok(conn.query_row("SELECT COUNT(*) FROM companies", [], |row| row.get(0))?)
}

/// Patch semantics: `None` keeps the stored value, `Some(None)` clears it.
#[derive(Default)]
pub struct CompanyPatch {
    pub name: Option<String>,
    pub legal_name: Option<Option<String>>,
    pub gstin: Option<Option<String>>,
    pub pan: Option<Option<String>>,
    pub state_code: Option<String>,
    pub address: Option<Option<String>>,
    pub city: Option<Option<String>>,
    pub pincode: Option<Option<String>>,
    pub phone: Option<Option<String>>,
    pub email: Option<Option<String>>,
    pub invoice_terms: Option<Option<String>>,
    pub fy_start_month: Option<i64>,
    pub books_begin_date: Option<String>,
    pub logo: Option<Option<String>>,
    pub costing_method: Option<String>,
    pub round_off_mode: Option<String>,
    pub allow_negative_stock: Option<bool>,
}

pub fn update_company(conn: &Connection, id: i64, patch: &CompanyPatch) -> AppResult<Option<Company>> {
    let mut sets: Vec<&str> = Vec::new();
    let mut values: Vec<rusqlite::types::Value> = Vec::new();

    macro_rules! set {
        ($flag:expr, $col:literal, $value:expr) => {
            if $flag.is_some() {
                sets.push(concat!($col, " = ?"));
                values.push($value);
            }
        };
    }

    set!(patch.name.as_ref(), "name", patch.name.clone().map(Into::into).unwrap_or(rusqlite::types::Value::Null));
    set!(
        patch.legal_name.as_ref(),
        "legal_name",
        patch.legal_name.clone().flatten().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.gstin.as_ref(),
        "gstin",
        patch.gstin.clone().flatten().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.pan.as_ref(),
        "pan",
        patch.pan.clone().flatten().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.state_code.as_ref(),
        "state_code",
        patch.state_code.clone().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.address.as_ref(),
        "address",
        patch.address.clone().flatten().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.city.as_ref(),
        "city",
        patch.city.clone().flatten().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.pincode.as_ref(),
        "pincode",
        patch.pincode.clone().flatten().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.phone.as_ref(),
        "phone",
        patch.phone.clone().flatten().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.email.as_ref(),
        "email",
        patch.email.clone().flatten().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.invoice_terms.as_ref(),
        "invoice_terms",
        patch.invoice_terms.clone().flatten().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.fy_start_month,
        "fy_start_month",
        patch.fy_start_month.map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.books_begin_date.as_ref(),
        "books_begin_date",
        patch.books_begin_date.clone().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.logo.as_ref(),
        "logo",
        patch.logo.clone().flatten().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.costing_method.as_ref(),
        "costing_method",
        patch.costing_method.clone().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.round_off_mode.as_ref(),
        "round_off_mode",
        patch.round_off_mode.clone().map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );
    set!(
        patch.allow_negative_stock,
        "allow_negative_stock",
        patch.allow_negative_stock.map(|v| i64::from(v)).map(Into::into).unwrap_or(rusqlite::types::Value::Null)
    );

    if sets.is_empty() {
        return find_company(conn, id);
    }

    let sql = format!("UPDATE companies SET {} WHERE id = ?", sets.join(", "));
    values.push(id.into());
    conn.execute(&sql, rusqlite::params_from_iter(values))?;
    find_company(conn, id)
}

pub fn exists_with_owner_credentials(conn: &Connection, name: &str, email: &str) -> AppResult<bool> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM companies c
             WHERE c.name = ?1 AND EXISTS (
               SELECT 1 FROM company_users cu
               JOIN users u ON u.id = cu.user_id
               JOIN roles r ON r.id = cu.role_id
               WHERE cu.company_id = c.id AND r.is_super = 1 AND lower(u.email) = ?2
             )
             LIMIT 1",
            params![name, email.trim().to_lowercase()],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

#[derive(Debug, Clone)]
// Mirrors the TypeScript UserRow: every column the read model carried stays
// available even when a caller does not read it yet.
#[allow(dead_code)]
pub struct User {
    pub id: i64,
    pub full_name: String,
    pub email: String,
    pub password_hash: String,
    pub status: String,
}

pub fn create_user(conn: &Connection, full_name: &str, email: &str, password_hash: &str) -> AppResult<User> {
    conn.execute(
        "INSERT INTO users (full_name, email, password_hash) VALUES (?1, ?2, ?3)",
        params![full_name, email, password_hash],
    )?;
    find_user(conn, conn.last_insert_rowid())?
        .ok_or_else(|| AppError::internal("User insert disappeared"))
}

pub fn find_user(conn: &Connection, id: i64) -> AppResult<Option<User>> {
    let user = conn
        .query_row(
            "SELECT id, full_name, email, password_hash, status FROM users WHERE id = ?1",
            params![id],
            |row| {
                Ok(User {
                    id: row.get(0)?,
                    full_name: row.get(1)?,
                    email: row.get(2)?,
                    password_hash: row.get(3)?,
                    status: row.get(4)?,
                })
            },
        )
        .optional()?;
    Ok(user)
}

pub fn update_user_name(conn: &Connection, id: i64, full_name: &str) -> AppResult<()> {
    conn.execute("UPDATE users SET full_name = ?1 WHERE id = ?2", params![full_name, id])?;
    Ok(())
}

pub fn update_user_status(conn: &Connection, id: i64, status: &str) -> AppResult<()> {
    conn.execute("UPDATE users SET status = ?1 WHERE id = ?2", params![status, id])?;
    Ok(())
}

pub fn update_user_password(conn: &Connection, id: i64, password_hash: &str) -> AppResult<()> {
    conn.execute("UPDATE users SET password_hash = ?1 WHERE id = ?2", params![password_hash, id])?;
    Ok(())
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Role {
    pub id: i64,
    pub company_id: i64,
    pub name: String,
    pub is_system_role: bool,
    pub is_super: bool,
    pub description: Option<String>,
}

pub fn map_role(row: &rusqlite::Row<'_>) -> rusqlite::Result<Role> {
    Ok(Role {
        id: row.get(0)?,
        company_id: row.get(1)?,
        name: row.get(2)?,
        is_system_role: row.get::<_, i64>(3)? != 0,
        is_super: row.get::<_, i64>(4)? != 0,
        description: row.get(5)?,
    })
}

const ROLE_COLUMNS: &str = "id, company_id, name, is_system_role, is_super, description";

pub fn find_role(conn: &Connection, company_id: i64, id: i64) -> AppResult<Option<Role>> {
    let sql = format!("SELECT {ROLE_COLUMNS} FROM roles WHERE company_id = ?1 AND id = ?2");
    Ok(conn.query_row(&sql, params![company_id, id], map_role).optional()?)
}

pub fn find_role_by_name(conn: &Connection, company_id: i64, name: &str) -> AppResult<Option<Role>> {
    let sql = format!("SELECT {ROLE_COLUMNS} FROM roles WHERE company_id = ?1 AND name = ?2");
    Ok(conn.query_row(&sql, params![company_id, name], map_role).optional()?)
}

pub fn find_role_by_name_insensitive(
    conn: &Connection,
    company_id: i64,
    name: &str,
    exclude_id: Option<i64>,
) -> AppResult<Option<Role>> {
    let sql = match exclude_id {
        Some(_) => format!(
            "SELECT {ROLE_COLUMNS} FROM roles WHERE company_id = ?1 AND lower(name) = ?2 AND id <> ?3"
        ),
        None => format!("SELECT {ROLE_COLUMNS} FROM roles WHERE company_id = ?1 AND lower(name) = ?2"),
    };
    let normalized = name.trim().to_lowercase();
    let role = match exclude_id {
        Some(id) => conn.query_row(&sql, params![company_id, normalized, id], map_role).optional()?,
        None => conn.query_row(&sql, params![company_id, normalized], map_role).optional()?,
    };
    Ok(role)
}

pub fn list_roles(conn: &Connection, company_id: i64) -> AppResult<Vec<Role>> {
    let sql = format!("SELECT {ROLE_COLUMNS} FROM roles WHERE company_id = ?1 ORDER BY id");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![company_id], map_role)?;
    let mut roles = Vec::new();
    for row in rows {
        roles.push(row?);
    }
    Ok(roles)
}

pub fn create_role(conn: &Connection, company_id: i64, name: &str, description: Option<&str>) -> AppResult<Role> {
    conn.execute(
        "INSERT INTO roles (company_id, name, description, is_system_role, is_super)
         VALUES (?1, ?2, ?3, 0, 0)",
        params![company_id, name, description],
    )?;
    let id = conn.last_insert_rowid();
    find_role(conn, company_id, id)?.ok_or_else(|| AppError::internal("Role insert disappeared"))
}

pub fn update_role(
    conn: &Connection,
    company_id: i64,
    id: i64,
    name: Option<&str>,
    description: Option<Option<&str>>,
) -> AppResult<Option<Role>> {
    let mut sets: Vec<&str> = Vec::new();
    let mut values: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(name) = name {
        sets.push("name = ?");
        values.push(name.to_string().into());
    }
    if let Some(description) = description {
        sets.push("description = ?");
        values.push(description.map(|d| d.to_string()).into());
    }
    if sets.is_empty() {
        return find_role(conn, company_id, id);
    }
    let sql = format!("UPDATE roles SET {} WHERE company_id = ? AND id = ?", sets.join(", "));
    values.push(company_id.into());
    values.push(id.into());
    conn.execute(&sql, rusqlite::params_from_iter(values))?;
    find_role(conn, company_id, id)
}

pub fn delete_role(conn: &Connection, company_id: i64, id: i64) -> AppResult<bool> {
    let changed = conn.execute("DELETE FROM roles WHERE company_id = ?1 AND id = ?2", params![company_id, id])?;
    Ok(changed > 0)
}

pub fn set_role_permissions(conn: &Connection, role_id: i64, codes: &[String]) -> AppResult<()> {
    conn.execute("DELETE FROM role_permissions WHERE role_id = ?1", params![role_id])?;
    let mut insert = conn.prepare(
        "INSERT INTO role_permissions (role_id, permission_id)
         SELECT ?1, id FROM permissions WHERE code = ?2",
    )?;
    for code in codes {
        insert.execute(params![role_id, code])?;
    }
    Ok(())
}

pub fn role_member_count(conn: &Connection, company_id: i64, role_id: i64) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM company_users WHERE company_id = ?1 AND role_id = ?2",
        params![company_id, role_id],
        |row| row.get(0),
    )?)
}

/// Resolves the permission codes a role grants. Super roles return every code.
pub fn role_permission_codes(conn: &Connection, role_id: i64) -> AppResult<Vec<String>> {
    let is_super: Option<i64> = conn
        .query_row("SELECT is_super FROM roles WHERE id = ?1", params![role_id], |row| row.get(0))
        .optional()?;
    let Some(is_super) = is_super else {
        return Ok(Vec::new());
    };
    if is_super != 0 {
        return all_permission_codes(conn);
    }
    let mut stmt = conn.prepare(
        "SELECT p.code FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = ?1
         ORDER BY p.code",
    )?;
    let rows = stmt.query_map(params![role_id], |row| row.get::<_, String>(0))?;
    let mut codes = Vec::new();
    for row in rows {
        codes.push(row?);
    }
    Ok(codes)
}

pub fn all_permission_codes(conn: &Connection) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare("SELECT code FROM permissions ORDER BY code")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut codes = Vec::new();
    for row in rows {
        codes.push(row?);
    }
    Ok(codes)
}

pub struct PermissionRecord {
    pub code: String,
    pub description: Option<String>,
}

pub fn list_permissions(conn: &Connection) -> AppResult<Vec<PermissionRecord>> {
    let mut stmt = conn.prepare("SELECT code, description FROM permissions ORDER BY code")?;
    let rows = stmt.query_map([], |row| {
        Ok(PermissionRecord { code: row.get(0)?, description: row.get(1)? })
    })?;
    let mut permissions = Vec::new();
    for row in rows {
        permissions.push(row?);
    }
    Ok(permissions)
}

/// Returns the subset of `codes` that exist in the catalog.
pub fn existing_permission_codes(conn: &Connection, codes: &[String]) -> AppResult<Vec<String>> {
    let mut found = Vec::new();
    let mut stmt = conn.prepare("SELECT 1 FROM permissions WHERE code = ?1")?;
    for code in codes {
        if stmt.exists(params![code])? {
            found.push(code.clone());
        }
    }
    Ok(found)
}

pub fn app_meta_get(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM app_meta WHERE key = ?1", params![key], |row| row.get(0))
        .optional()?)
}

pub fn app_meta_set(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn app_meta_delete(conn: &Connection, key: &str) -> AppResult<()> {
    conn.execute("DELETE FROM app_meta WHERE key = ?1", params![key])?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct StaffListRow {
    pub id: i64,
    pub user_id: i64,
    pub full_name: String,
    pub email: String,
    pub role_id: i64,
    pub role_name: String,
    pub is_super: bool,
    pub is_system_role: bool,
    pub status: String,
    pub joined_at: String,
}

impl StaffListRow {
    pub fn to_json(&self, is_self: bool) -> Value {
        json!({
            "id": self.id,
            "userId": self.user_id,
            "fullName": self.full_name,
            "email": self.email,
            "roleId": self.role_id,
            "roleName": self.role_name,
            "isSuper": self.is_super,
            "isSystemRole": self.is_system_role,
            "status": self.status,
            "joinedAt": self.joined_at,
            "isSelf": is_self
        })
    }
}

fn map_staff_list(row: &rusqlite::Row<'_>) -> rusqlite::Result<StaffListRow> {
    Ok(StaffListRow {
        id: row.get(0)?,
        user_id: row.get(1)?,
        full_name: row.get(2)?,
        email: row.get(3)?,
        role_id: row.get(4)?,
        role_name: row.get(5)?,
        is_super: row.get::<_, i64>(6)? != 0,
        is_system_role: row.get::<_, i64>(7)? != 0,
        status: row.get(8)?,
        joined_at: row.get(9)?,
    })
}

pub fn list_staff(conn: &Connection, company_id: i64) -> AppResult<Vec<StaffListRow>> {
    let mut stmt = conn.prepare(
        "SELECT cu.id, cu.user_id, u.full_name, u.email, r.id, r.name, r.is_super,
                r.is_system_role, cu.status, cu.joined_at
         FROM company_users cu
         JOIN users u ON u.id = cu.user_id
         JOIN roles r ON r.id = cu.role_id
         WHERE cu.company_id = ?1
         ORDER BY u.full_name",
    )?;
    let rows = stmt.query_map(params![company_id], map_staff_list)?;
    let mut staff = Vec::new();
    for row in rows {
        staff.push(row?);
    }
    Ok(staff)
}

#[allow(dead_code)]
pub struct StaffTarget {
    pub staff_id: i64,
    pub user_id: i64,
    pub user_full_name: String,
    pub user_status: String,
    pub staff_status: String,
    pub role_id: i64,
    pub role_name: String,
    pub role_is_super: bool,
    pub role_is_system: bool,
}

pub fn find_staff_target(conn: &Connection, company_id: i64, staff_id: i64) -> AppResult<Option<StaffTarget>> {
    Ok(conn
        .query_row(
            "SELECT cu.id, cu.user_id, u.full_name, u.status, cu.status, r.id, r.name, r.is_super, r.is_system_role
             FROM company_users cu
             JOIN users u ON u.id = cu.user_id
             JOIN roles r ON r.id = cu.role_id
             WHERE cu.company_id = ?1 AND cu.id = ?2",
            params![company_id, staff_id],
            |row| {
                Ok(StaffTarget {
                    staff_id: row.get(0)?,
                    user_id: row.get(1)?,
                    user_full_name: row.get(2)?,
                    user_status: row.get(3)?,
                    staff_status: row.get(4)?,
                    role_id: row.get(5)?,
                    role_name: row.get(6)?,
                    role_is_super: row.get::<_, i64>(7)? != 0,
                    role_is_system: row.get::<_, i64>(8)? != 0,
                })
            },
        )
        .optional()?)
}

pub fn email_exists_in_company(conn: &Connection, company_id: i64, email: &str) -> AppResult<bool> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM company_users cu JOIN users u ON u.id = cu.user_id
             WHERE cu.company_id = ?1 AND lower(u.email) = ?2 LIMIT 1",
            params![company_id, email.trim().to_lowercase()],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

pub fn create_membership(conn: &Connection, company_id: i64, user_id: i64, role_id: i64) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO company_users (company_id, user_id, role_id) VALUES (?1, ?2, ?3)",
        params![company_id, user_id, role_id],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_membership(
    conn: &Connection,
    staff_id: i64,
    role_id: Option<i64>,
    status: Option<&str>,
) -> AppResult<()> {
    if let Some(role_id) = role_id {
        conn.execute("UPDATE company_users SET role_id = ?1 WHERE id = ?2", params![role_id, staff_id])?;
    }
    if let Some(status) = status {
        conn.execute("UPDATE company_users SET status = ?1 WHERE id = ?2", params![status, staff_id])?;
    }
    Ok(())
}

pub fn count_active_supers(conn: &Connection, company_id: i64, exclude_staff_id: Option<i64>) -> AppResult<i64> {
    let sql = match exclude_staff_id {
        Some(_) => {
            "SELECT COUNT(*) FROM company_users cu
             JOIN users u ON u.id = cu.user_id
             JOIN roles r ON r.id = cu.role_id
             WHERE cu.company_id = ?1 AND cu.status = 'ACTIVE' AND u.status = 'ACTIVE'
               AND r.is_super = 1 AND cu.id <> ?2"
        }
        None => {
            "SELECT COUNT(*) FROM company_users cu
             JOIN users u ON u.id = cu.user_id
             JOIN roles r ON r.id = cu.role_id
             WHERE cu.company_id = ?1 AND cu.status = 'ACTIVE' AND u.status = 'ACTIVE'
               AND r.is_super = 1"
        }
    };
    let count = match exclude_staff_id {
        Some(id) => conn.query_row(sql, params![company_id, id], |row| row.get(0))?,
        None => conn.query_row(sql, params![company_id], |row| row.get(0))?,
    };
    Ok(count)
}

/// Active membership for login, with the password hash needed to verify it.
#[allow(dead_code)]
pub struct LoginMembership {
    pub user_id: i64,
    pub user_full_name: String,
    pub user_email: String,
    pub password_hash: String,
    pub role_id: i64,
    pub role_name: String,
    pub is_super: bool,
}

pub fn find_login_membership(conn: &Connection, company_id: i64, email: &str) -> AppResult<Option<LoginMembership>> {
    Ok(conn
        .query_row(
            "SELECT u.id, u.full_name, u.email, u.password_hash, r.id, r.name, r.is_super
             FROM company_users cu
             JOIN users u ON u.id = cu.user_id
             JOIN roles r ON r.id = cu.role_id
             WHERE cu.company_id = ?1 AND cu.status = 'ACTIVE' AND u.status = 'ACTIVE'
               AND lower(u.email) = ?2
             LIMIT 1",
            params![company_id, email.trim().to_lowercase()],
            |row| {
                Ok(LoginMembership {
                    user_id: row.get(0)?,
                    user_full_name: row.get(1)?,
                    user_email: row.get(2)?,
                    password_hash: row.get(3)?,
                    role_id: row.get(4)?,
                    role_name: row.get(5)?,
                    is_super: row.get::<_, i64>(6)? != 0,
                })
            },
        )
        .optional()?)
}

pub fn find_active_membership(
    conn: &Connection,
    company_id: i64,
    user_id: i64,
) -> AppResult<Option<(i64, String, bool)>> {
    Ok(conn
        .query_row(
            "SELECT r.id, r.name, r.is_super
             FROM company_users cu
             JOIN users u ON u.id = cu.user_id
             JOIN roles r ON r.id = cu.role_id
             JOIN companies c ON c.id = cu.company_id
             WHERE cu.company_id = ?1 AND cu.user_id = ?2
               AND cu.status = 'ACTIVE' AND u.status = 'ACTIVE' AND c.status = 'ACTIVE'
             LIMIT 1",
            params![company_id, user_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get::<_, i64>(2)? != 0)),
        )
        .optional()?)
}
