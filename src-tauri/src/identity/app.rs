//! Identity use cases: first-run setup, login, session, company profile and
//! staff creation. Mirrors `src/main/application/identity.ts`.

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::audit;
use crate::auth::{hash_password, verify_password};
use crate::db::permissions::codes as perm;
use crate::db::seed::{seed_company_defaults, seed_roles_for_company};
use crate::error::{AppError, AppResult};
use crate::identity::repo;
use crate::json::{
    arg, opt_bool, opt_i64, opt_str, patch_str, required_text, req_str,
};
use crate::numbering;
use crate::state::{Ctx, Session};

const REMEMBERED_SESSION_KEY: &str = "remembered_session";
const MAX_COMPANY_LOGO_DATA_URL_LENGTH: usize = 512 * 1024;

pub fn is_gstin(value: &str) -> bool {
    let chars: Vec<char> = value.chars().collect();
    chars.len() == 15
        && chars[0].is_ascii_digit()
        && chars[1].is_ascii_digit()
        && chars[2..7].iter().all(|c| c.is_ascii_uppercase())
        && chars[7..11].iter().all(|c| c.is_ascii_digit())
        && chars[11].is_ascii_uppercase()
        && (chars[12].is_ascii_alphanumeric())
        && chars[13] == 'Z'
        && chars[14].is_ascii_alphanumeric()
}

pub fn is_pan(value: &str) -> bool {
    let chars: Vec<char> = value.chars().collect();
    chars.len() == 10
        && chars[0..5].iter().all(|c| c.is_ascii_uppercase())
        && chars[5..9].iter().all(|c| c.is_ascii_digit())
        && chars[9].is_ascii_uppercase()
}

fn is_state_code(value: &str) -> bool {
    value.len() == 2 && value.chars().all(|c| c.is_ascii_digit())
}

fn is_pincode(value: &str) -> bool {
    value.len() == 6 && value.chars().all(|c| c.is_ascii_digit())
}

fn is_email(value: &str) -> bool {
    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && !domain.is_empty()
        && domain.contains('.')
        && !value.chars().any(|c| c.is_whitespace())
}

fn is_date_iso(value: &str) -> bool {
    let chars: Vec<char> = value.chars().collect();
    chars.len() == 10
        && chars[4] == '-'
        && chars[7] == '-'
        && chars.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

fn is_logo_data_url(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("data:image/") else {
        return false;
    };
    let Some((kind, payload)) = rest.split_once(";base64,") else {
        return false;
    };
    matches!(kind, "png" | "jpeg" | "webp")
        && !payload.is_empty()
        && payload.chars().all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=')
}

pub fn slugify(name: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in name.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            last_dash = false;
        } else if !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

/// Builds the session context for a company/user pair and resolves the role's
/// permission codes.
pub fn build_session(conn: &Connection, company_id: i64, user_id: i64) -> AppResult<Session> {
    let company = repo::find_company(conn, company_id)?
        .ok_or_else(|| AppError::not_found("Company or user not found"))?;
    let user = repo::find_user(conn, user_id)?.ok_or_else(|| AppError::not_found("Company or user not found"))?;

    let membership = conn
        .query_row(
            "SELECT r.id, r.name, r.is_super FROM company_users cu JOIN roles r ON r.id = cu.role_id
             WHERE cu.company_id = ?1 AND cu.user_id = ?2",
            rusqlite::params![company_id, user_id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)? != 0)),
        )
        .ok()
        .ok_or_else(|| AppError::not_found("No staff membership found"))?;

    let permissions = repo::role_permission_codes(conn, membership.0)?;

    Ok(Session {
        company_id: company.id,
        company_slug: company.slug,
        company_name: company.name,
        user_id: user.id,
        user_full_name: user.full_name,
        user_email: user.email,
        role_id: membership.0,
        role_name: membership.1,
        is_super: membership.2,
        permissions,
    })
}

fn remember_login(conn: &Connection, company_id: i64, user_id: i64) -> AppResult<()> {
    let value = json!({ "companyId": company_id, "userId": user_id }).to_string();
    repo::app_meta_set(conn, REMEMBERED_SESSION_KEY, &value)
}

fn forget_login(conn: &Connection) -> AppResult<()> {
    repo::app_meta_delete(conn, REMEMBERED_SESSION_KEY)
}

/// Restores the remembered login before the window loads, so the renderer's
/// first status call does not flash the login screen.
pub fn restore_remembered_login(conn: &Connection) -> AppResult<Option<Session>> {
    let Some(raw) = repo::app_meta_get(conn, REMEMBERED_SESSION_KEY)? else {
        return Ok(None);
    };
    let Ok(remembered) = serde_json::from_str::<Value>(&raw) else {
        let _ = forget_login(conn);
        return Ok(None);
    };
    let company_id = remembered.get("companyId").and_then(|v| v.as_i64());
    let user_id = remembered.get("userId").and_then(|v| v.as_i64());
    let (Some(company_id), Some(user_id)) = (company_id, user_id) else {
        let _ = forget_login(conn);
        return Ok(None);
    };
    if repo::find_active_membership(conn, company_id, user_id)?.is_none() {
        let _ = forget_login(conn);
        return Ok(None);
    }
    Ok(Some(build_session(conn, company_id, user_id)?))
}

pub fn auth_status(conn: &Connection, session: Option<&Session>) -> AppResult<&'static str> {
    if repo::count_companies(conn)? == 0 {
        return Ok("SETUP_REQUIRED");
    }
    Ok(if session.is_some() { "AUTHENTICATED" } else { "LOGIN_REQUIRED" })
}

pub fn setup_company(conn: &mut Connection, input: &Value) -> AppResult<Session> {
    let name = required_text(input, "name", "Company name", 120)?;
    let owner_full_name = required_text(input, "ownerFullName", "Owner full name", 120)?;
    let owner_email = required_text(input, "ownerEmail", "Owner email", 254)?.to_lowercase();
    let owner_password = req_str(input, "ownerPassword")?;
    if owner_password.len() < 8 {
        return Err(AppError::validation("Password must be at least 8 characters"));
    }
    let state_code = opt_str(input, "stateCode").unwrap_or_else(|| "27".to_string());
    if !is_state_code(&state_code) {
        return Err(AppError::validation("State code must be two digits"));
    }
    let gstin = opt_str(input, "gstin")
        .map(|v| v.trim().to_uppercase())
        .filter(|v| !v.is_empty());
    if let Some(gstin) = &gstin {
        if !is_gstin(gstin) {
            return Err(AppError::validation("Enter a valid 15 character GSTIN"));
        }
    }
    let books_begin_date = opt_str(input, "booksBeginDate").unwrap_or_else(crate::state::today_iso);
    if !is_date_iso(&books_begin_date) {
        return Err(AppError::validation("Books begin date must be YYYY-MM-DD"));
    }
    let slug = opt_str(input, "slug")
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| slugify(&name));
    if slug.is_empty() || !slug.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err(AppError::validation(
            "Slug may only contain lowercase letters, numbers, and hyphens",
        ));
    }

    conn.execute_batch("BEGIN IMMEDIATE")?;
    let result = (|| -> AppResult<Session> {
        if repo::count_companies(conn)? > 0 {
            return Err(AppError::validation("A company has already been set up on this machine"));
        }
        let company = repo::create_company(
            conn,
            &repo::NewCompany {
                slug,
                name,
                gstin,
                state_code,
                phone: opt_str(input, "phone").map(|v| v.trim().to_string()).filter(|v| !v.is_empty()),
                email: Some(owner_email.clone()),
                currency: opt_str(input, "currency").unwrap_or_else(|| "INR".to_string()),
                books_begin_date: books_begin_date.clone(),
            },
        )?;

        seed_roles_for_company(conn, company.id)?;
        seed_company_defaults(conn, company.id, &books_begin_date)?;
        numbering::ensure_defaults(conn, company.id)?;

        let owner_role = repo::find_role_by_name(conn, company.id, "Owner")?
            .ok_or_else(|| AppError::not_found("Owner role not found"))?;

        let password_hash = hash_password(&owner_password)?;
        let user = repo::create_user(conn, &owner_full_name, &owner_email, &password_hash)?;
        repo::create_membership(conn, company.id, user.id, owner_role.id)?;
        remember_login(conn, company.id, user.id)?;

        build_session(conn, company.id, user.id)
    })();

    match result {
        Ok(session) => {
            conn.execute_batch("COMMIT")?;
            Ok(session)
        }
        Err(err) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(err)
        }
    }
}

pub fn login(conn: &Connection, input: &Value) -> AppResult<Session> {
    let email = required_text(input, "email", "Email", 254)?.to_lowercase();
    let password = req_str(input, "password")?;

    let company = repo::find_first_company(conn)?
        .ok_or_else(|| AppError::not_found("No company set up. Run setup first."))?;

    let membership = repo::find_login_membership(conn, company.id, &email)?;
    let Some(membership) = membership else {
        return Err(AppError::unauthorized("Invalid email or password"));
    };
    if !verify_password(&password, &membership.password_hash) {
        return Err(AppError::unauthorized("Invalid email or password"));
    }

    let session = build_session(conn, company.id, membership.user_id)?;
    remember_login(conn, company.id, membership.user_id)?;
    Ok(session)
}

pub fn check_company_exists(conn: &Connection, input: &Value) -> AppResult<bool> {
    let name = required_text(input, "name", "Company name", 120)?;
    let email = required_text(input, "ownerEmail", "Owner email", 254)?;
    repo::exists_with_owner_credentials(conn, &name, &email)
}

pub fn create_staff_member(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::USER_CREATE)?;
    let company_id = ctx.company_id()?;
    let actor_user_id = ctx.user_id()?;

    let full_name = required_text(input, "fullName", "Full name", 120)?;
    let email = required_text(input, "email", "Email", 254)?.to_lowercase();
    let password = req_str(input, "password")?;
    if password.len() < 8 {
        return Err(AppError::validation("Password must be at least 8 characters"));
    }
    if repo::email_exists_in_company(ctx.db(), company_id, &email)? {
        return Err(AppError::validation("A user with this email already exists in this company"));
    }

    let role_id = opt_i64(input, "roleId");
    let role_name = opt_str(input, "roleName");
    let role = match role_id {
        Some(id) => repo::find_role(ctx.db(), company_id, id)?,
        None => {
            let name = role_name.unwrap_or_default();
            repo::find_role_by_name(ctx.db(), company_id, &name)?
        }
    };
    let role = role.ok_or_else(|| {
        AppError::not_found(match role_id {
            Some(_) => "Role not found".to_string(),
            None => format!("Role \"{}\" not found", opt_str(input, "roleName").unwrap_or_default()),
        })
    })?;
    let role_codes = repo::role_permission_codes(ctx.db(), role.id)?;
    crate::access::guards::assert_can_assign_role(ctx.require_session()?, &role, &role_codes)?;

    let password_hash = hash_password(&password)?;
    let user_id = ctx.with_tx(|ctx| {
        let user = repo::create_user(ctx.db(), &full_name, &email, &password_hash)?;
        let staff_id = repo::create_membership(ctx.db(), company_id, user.id, role.id)?;
        audit::record(
            ctx.db(),
            company_id,
            "USER",
            user.id,
            "CREATE",
            None,
            Some(&json!({
                "fullName": full_name,
                "email": email,
                "roleId": role.id,
                "staffId": staff_id
            })),
            Some(actor_user_id),
        )?;
        Ok(user.id)
    })?;

    Ok(json!({ "userId": user_id }))
}

pub fn update_company(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::COMPANY_MANAGE)?;
    let company_id = ctx.company_id()?;

    let mut patch = repo::CompanyPatch::default();

    if let Some(name) = opt_str(input, "name") {
        let name = name.trim().to_string();
        if name.chars().count() < 2 {
            return Err(AppError::validation("Company name must be at least 2 characters"));
        }
        patch.name = Some(name);
    }
    if input.get("legalName").is_some() {
        let legal_name = patch_str(input, "legalName").flatten();
        if let Some(value) = &legal_name {
            if value.chars().count() < 2 {
                return Err(AppError::validation("Legal name must be at least 2 characters"));
            }
        }
        patch.legal_name = Some(legal_name);
    }
    if input.get("gstin").is_some() {
        let gstin = patch_str(input, "gstin").flatten().map(|v| v.to_uppercase());
        if let Some(value) = &gstin {
            if !is_gstin(value) {
                return Err(AppError::validation("Enter a valid 15 character GSTIN"));
            }
        }
        patch.gstin = Some(gstin);
    }
    if input.get("pan").is_some() {
        let pan = patch_str(input, "pan").flatten().map(|v| v.to_uppercase());
        if let Some(value) = &pan {
            if !is_pan(value) {
                return Err(AppError::validation("Enter a valid 10 character PAN"));
            }
        }
        patch.pan = Some(pan);
    }
    if let Some(state_code) = opt_str(input, "stateCode") {
        if !is_state_code(&state_code) {
            return Err(AppError::validation("State code must be two digits"));
        }
        patch.state_code = Some(state_code);
    }
    if input.get("address").is_some() {
        patch.address = Some(patch_str(input, "address").flatten());
    }
    if input.get("city").is_some() {
        patch.city = Some(patch_str(input, "city").flatten());
    }
    if input.get("pincode").is_some() {
        let pincode = patch_str(input, "pincode").flatten();
        if let Some(value) = &pincode {
            if !is_pincode(value) {
                return Err(AppError::validation("Pincode must be six digits"));
            }
        }
        patch.pincode = Some(pincode);
    }
    if input.get("phone").is_some() {
        patch.phone = Some(patch_str(input, "phone").flatten());
    }
    if input.get("email").is_some() {
        let email = patch_str(input, "email").flatten().map(|v| v.to_lowercase());
        if let Some(value) = &email {
            if !is_email(value) {
                return Err(AppError::validation("Enter a valid email address"));
            }
        }
        patch.email = Some(email);
    }
    if input.get("invoiceTerms").is_some() {
        let terms = patch_str(input, "invoiceTerms").flatten();
        if let Some(value) = &terms {
            if value.chars().count() > 2000 {
                return Err(AppError::validation("Terms must be 2000 characters or fewer"));
            }
        }
        patch.invoice_terms = Some(terms);
    }
    if let Some(month) = opt_i64(input, "fyStartMonth") {
        if !(1..=12).contains(&month) {
            return Err(AppError::validation("Financial year start month must be between 1 and 12"));
        }
        patch.fy_start_month = Some(month);
    }
    if let Some(date) = opt_str(input, "booksBeginDate") {
        if !is_date_iso(&date) {
            return Err(AppError::validation("Books begin date must be YYYY-MM-DD"));
        }
        patch.books_begin_date = Some(date);
    }
    if input.get("logo").is_some() {
        let logo = patch_str(input, "logo").flatten();
        if let Some(value) = &logo {
            if value.chars().count() > MAX_COMPANY_LOGO_DATA_URL_LENGTH {
                return Err(AppError::validation("Logo is too large. Use an image under 512 KB."));
            }
            if !is_logo_data_url(value) {
                return Err(AppError::validation("Logo must be a PNG, JPEG or WebP image"));
            }
        }
        patch.logo = Some(logo);
    }
    if let Some(method) = opt_str(input, "costingMethod") {
        if !matches!(method.as_str(), "WEIGHTED_AVERAGE" | "FIFO") {
            return Err(AppError::validation("Unknown costing method"));
        }
        patch.costing_method = Some(method);
    }
    if let Some(mode) = opt_str(input, "roundOffMode") {
        if !matches!(mode.as_str(), "INVOICE" | "LINE" | "NONE") {
            return Err(AppError::validation("Unknown round off mode"));
        }
        patch.round_off_mode = Some(mode);
    }
    if let Some(allow) = opt_bool(input, "allowNegativeStock") {
        patch.allow_negative_stock = Some(allow);
    }

    let updated = repo::update_company(ctx.db(), company_id, &patch)?
        .ok_or_else(|| AppError::not_found("Company not found"))?;
    Ok(updated.to_json())
}

pub fn company_profile(ctx: &Ctx<'_>) -> AppResult<Value> {
    let company_id = ctx.company_id()?;
    Ok(match repo::find_company(ctx.db(), company_id)? {
        Some(company) => company.to_json(),
        None => Value::Null,
    })
}

pub fn dispatch(ctx: &mut Ctx<'_>, channel: &str, args: &[Value]) -> Option<AppResult<Value>> {
    match channel {
        "identity:status" => Some(auth_status(ctx.db(), ctx.session()).map(|status| json!(status))),
        "identity:session" => Some(Ok(match ctx.session() {
            Some(session) => session.to_json(),
            None => Value::Null,
        })),
        "identity:setup" => Some((|| {
            let input = arg(args, 0).clone();
            let session = setup_company(&mut ctx.inner.conn, &input)?;
            let payload = session.to_json();
            ctx.set_session(Some(session));
            Ok(payload)
        })()),
        "identity:login" => Some((|| {
            let input = arg(args, 0).clone();
            let session = login(ctx.db(), &input)?;
            let payload = session.to_json();
            ctx.set_session(Some(session));
            Ok(payload)
        })()),
        "identity:logout" => Some((|| {
            ctx.set_session(None);
            forget_login(ctx.db())?;
            Ok(json!(true))
        })()),
        "identity:createStaff" => Some(create_staff_member(ctx, arg(args, 0))),
        "identity:checkCompanyExists" => Some(check_company_exists(ctx.db(), arg(args, 0)).map(|v| json!(v))),
        "identity:company" => Some(company_profile(ctx)),
        "identity:updateCompany" => Some(update_company(ctx, arg(args, 0))),
        _ => None,
    }
}
