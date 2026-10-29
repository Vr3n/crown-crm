//! Masters: parties, items, accounts, units, tax rates and godowns.
//! Mirrors `src/main/application/masters.ts` and `src/main/ipc/masters.ts`.
//!
//! The IPC layer used Zod schemas at the boundary; the equivalent checks live
//! here so callers get the same `VALIDATION_ERROR` codes and message text.

pub mod repo;

use serde_json::{json, Value};

use crate::db::permissions::codes as perm;
use crate::error::{AppError, AppResult};
use crate::identity::app::is_gstin;
use crate::json::{
    arg, int_in_range, opt_bool, opt_i64, opt_str, opt_trimmed, optional_text, patch_str, req_i64,
    req_str, required_text,
};
use crate::state::Ctx;

pub fn dispatch(ctx: &mut Ctx<'_>, channel: &str, args: &[Value]) -> Option<AppResult<Value>> {
    match channel {
        "parties:list" => Some(list_parties(ctx, arg(args, 0))),
        "parties:get" => Some(get_party(ctx, arg(args, 0))),
        "parties:create" => Some(create_party(ctx, arg(args, 0))),
        "parties:update" => Some(update_party(ctx, arg(args, 0))),
        "parties:deactivate" => Some(deactivate_party(ctx, arg(args, 0))),

        "items:list" => Some(list_items(ctx, arg(args, 0))),
        "items:get" => Some(get_item(ctx, arg(args, 0))),
        "items:create" => Some(create_item(ctx, arg(args, 0))),
        "items:update" => Some(update_item(ctx, arg(args, 0))),
        "items:deactivate" => Some(deactivate_item(ctx, arg(args, 0))),

        "accounts:list" => Some(list_accounts(ctx, arg(args, 0))),
        "accounts:groups" => Some(list_account_groups(ctx)),
        "accounts:create" => Some(create_account(ctx, arg(args, 0))),
        "accounts:deactivate" => Some(deactivate_account(ctx, arg(args, 0))),

        "units:list" => Some(list_units(ctx, arg(args, 0))),
        "units:create" => Some(create_unit(ctx, arg(args, 0))),
        "units:update" => Some(update_unit(ctx, arg(args, 0))),
        "units:deactivate" => Some(deactivate_unit(ctx, arg(args, 0))),

        "taxRates:list" => Some(list_tax_rates(ctx, arg(args, 0))),
        "taxRates:create" => Some(create_tax_rate(ctx, arg(args, 0))),
        "taxRates:revise" => Some(revise_tax_rate(ctx, arg(args, 0))),
        "taxRates:retire" => Some(retire_tax_rate(ctx, arg(args, 0))),

        "godowns:list" => Some(list_godowns(ctx)),
        _ => None,
    }
}

/* -------------------------------------------------------------------------- */
/* Input helpers                                                               */
/* -------------------------------------------------------------------------- */

/// `z.number().int().positive()` on the payload's `id`.
fn id_arg(input: &Value) -> AppResult<i64> {
    let id = req_i64(input, "id")?;
    if id <= 0 {
        return Err(AppError::validation("id: Number must be greater than 0"));
    }
    Ok(id)
}

/// Optional integer with a zod-style range check and a default.
fn int_or(value: &Value, key: &str, fallback: i64, min: i64, max: i64) -> AppResult<i64> {
    range_check(key, opt_i64(value, key).unwrap_or(fallback), min, max)
}

/// Patch field: absent (or null) keeps the stored value, a number replaces it.
fn optional_int_range(value: &Value, key: &str, min: i64, max: i64) -> AppResult<Option<i64>> {
    match opt_i64(value, key) {
        None => Ok(None),
        Some(number) => Ok(Some(range_check(key, number, min, max)?)),
    }
}

fn range_check(key: &str, number: i64, min: i64, max: i64) -> AppResult<i64> {
    if number < min || number > max {
        return Err(AppError::validation(format!("{key} must be between {min} and {max}")));
    }
    Ok(number)
}

fn optional_positive_int(value: &Value, key: &str) -> AppResult<Option<i64>> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(raw) => match raw.as_i64() {
            Some(number) if number > 0 => Ok(Some(number)),
            Some(_) => Err(AppError::validation(format!("{key}: Number must be greater than 0"))),
            None => Err(AppError::validation(format!("{key}: Expected number"))),
        },
    }
}

/// Patch field for nullable text: absent keeps, null/"" clears, text is trimmed.
fn patch_text(
    value: &Value,
    key: &str,
    label: &str,
    max: usize,
) -> AppResult<Option<Option<String>>> {
    let Some(patch) = patch_str(value, key) else {
        return Ok(None);
    };
    match patch {
        None => Ok(Some(None)),
        Some(text) => {
            if text.chars().count() > max {
                return Err(AppError::validation(format!(
                    "{label} must be {max} characters or fewer"
                )));
            }
            Ok(Some(Some(text)))
        }
    }
}

/// `normalizeGstin`: trims, upper-cases and validates the 15 character format.
fn normalize_gstin(input: &Value) -> AppResult<Option<String>> {
    let Some(raw) = opt_trimmed(input, "gstin") else {
        return Ok(None);
    };
    let gstin = raw.to_uppercase();
    if !is_gstin(&gstin) {
        return Err(AppError::validation("Enter a valid 15 character GSTIN"));
    }
    Ok(Some(gstin))
}

/// `normalizeGstin` for a patch: absent keeps the stored value, null clears it.
fn patch_gstin(input: &Value) -> AppResult<Option<Option<String>>> {
    let Some(patch) = patch_str(input, "gstin") else {
        return Ok(None);
    };
    match patch {
        None => Ok(Some(None)),
        Some(raw) => {
            let gstin = raw.to_uppercase();
            if !is_gstin(&gstin) {
                return Err(AppError::validation("Enter a valid 15 character GSTIN"));
            }
            Ok(Some(Some(gstin)))
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Business dates                                                              */
/* -------------------------------------------------------------------------- */

fn has_business_date_shape(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes.iter().enumerate().all(|(index, byte)| {
            if index == 4 || index == 7 {
                *byte == b'-'
            } else {
                byte.is_ascii_digit()
            }
        })
}

fn parse_business_date(value: &str) -> Option<chrono::NaiveDate> {
    if !has_business_date_shape(value) {
        return None;
    }
    let mut parts = value.split('-');
    let year: i32 = parts.next()?.parse().ok()?;
    let month: u32 = parts.next()?.parse().ok()?;
    let day: u32 = parts.next()?.parse().ok()?;
    // `Date.UTC` maps years 0-99 onto 1900-1999, so the TypeScript validator
    // rejects them; keep the same behaviour.
    if year < 100 {
        return None;
    }
    chrono::NaiveDate::from_ymd_opt(year, month, day)
}

/// Mirrors `assertValidBusinessDate` (message text included).
fn assert_valid_business_date(value: &str, field: &str) -> AppResult<()> {
    if !has_business_date_shape(value) {
        return Err(AppError::validation(format!("{field} must be a YYYY-MM-DD date")));
    }
    if parse_business_date(value).is_none() {
        return Err(AppError::validation(format!("{field} is not a real calendar date")));
    }
    Ok(())
}

/// Mirrors `addDaysIso`.
fn add_days_iso(date_only: &str, days: i64) -> AppResult<String> {
    assert_valid_business_date(date_only, "date")?;
    let date = parse_business_date(date_only)
        .ok_or_else(|| AppError::validation("date is not a real calendar date"))?;
    let shifted = date
        .checked_add_signed(chrono::Duration::days(days))
        .ok_or_else(|| AppError::validation("date is not a real calendar date"))?;
    Ok(shifted.format("%Y-%m-%d").to_string())
}

/// `formatRate` in basis points: 1800 -> "18%", 1850 -> "18.5%".
fn format_rate_bps(bps: i64) -> String {
    let whole = bps / 100;
    let fraction = bps % 100;
    if fraction == 0 {
        return format!("{whole}%");
    }
    let text = format!("{fraction:02}");
    format!("{whole}.{}%", text.trim_end_matches('0'))
}

fn tax_rate_label(gst_rate_bps: i64, cess_rate_bps: i64) -> String {
    if gst_rate_bps == 0 && cess_rate_bps == 0 {
        return "Exempt".to_string();
    }
    let gst = if gst_rate_bps == 0 {
        "Nil GST".to_string()
    } else {
        format!("GST {}", format_rate_bps(gst_rate_bps))
    };
    if cess_rate_bps > 0 {
        format!("{gst} + {} cess", format_rate_bps(cess_rate_bps))
    } else {
        gst
    }
}

fn unit_usage_message(count: i64) -> String {
    let plural = if count == 1 { "" } else { "s" };
    format!("This unit is used by {count} item{plural}. Change those items to another unit first.")
}

/* -------------------------------------------------------------------------- */
/* Parties                                                                     */
/* -------------------------------------------------------------------------- */

fn list_parties(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::PARTY_VIEW)?;
    let company_id = ctx.company_id()?;

    let query = opt_trimmed(input, "query");
    if let Some(query) = &query {
        if query.chars().count() > 120 {
            return Err(AppError::validation(
                "query: String must contain at most 120 character(s)",
            ));
        }
    }
    let role = opt_str(input, "role").unwrap_or_else(|| "BOTH".to_string());
    if !matches!(role.as_str(), "CUSTOMER" | "SUPPLIER" | "BOTH") {
        return Err(AppError::validation(format!(
            "role: Invalid enum value. Expected 'CUSTOMER' | 'SUPPLIER' | 'BOTH', received '{role}'"
        )));
    }
    let include_inactive = opt_bool(input, "includeInactive").unwrap_or(false);

    let parties = repo::list_parties(
        ctx.db(),
        company_id,
        query.as_deref(),
        &role,
        include_inactive,
    )?;
    Ok(json!(parties.iter().map(repo::Party::to_json).collect::<Vec<_>>()))
}

fn get_party(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::PARTY_VIEW)?;
    let company_id = ctx.company_id()?;
    let id = id_arg(input)?;
    let party = repo::find_party(ctx.db(), company_id, id)?
        .ok_or_else(|| AppError::validation("Party not found"))?;
    Ok(party.to_json())
}

fn create_party(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::PARTY_CREATE)?;
    let company_id = ctx.company_id()?;

    let new = repo::NewParty {
        name: required_text(input, "name", "Party name", 200)?,
        phone: optional_text(input, "phone", "Phone", 24)?,
        email: optional_text(input, "email", "Email", 254)?,
        gstin: normalize_gstin(input)?,
        state_code: optional_text(input, "stateCode", "State code", 2)?,
        billing_address: optional_text(input, "billingAddress", "Billing address", 500)?,
        is_customer: opt_bool(input, "isCustomer").unwrap_or(false),
        is_supplier: opt_bool(input, "isSupplier").unwrap_or(false),
        credit_days: int_or(input, "creditDays", 0, 0, 365)?,
        credit_limit_minor: int_or(input, "creditLimitMinor", 0, 0, i64::MAX)?,
        opening_balance_minor: opt_i64(input, "openingBalanceMinor").unwrap_or(0),
        opening_balance_date: optional_text(input, "openingBalanceDate", "Opening balance date", 10)?,
        notes: optional_text(input, "notes", "Notes", 1000)?,
        // The Electron use case passes `null` here; kept for parity.
        created_by: None,
    };

    let party = ctx.with_tx(|ctx| {
        // The repository throws a plain `Error` in TypeScript, which the IPC
        // layer reports as INTERNAL_ERROR with this message.
        if !new.is_customer && !new.is_supplier {
            return Err(AppError::internal("Select customer, supplier, or both"));
        }
        let id = repo::insert_party(ctx.db(), company_id, &new)?;
        repo::ensure_party_accounts(
            ctx.db(),
            company_id,
            id,
            &new.name,
            new.is_customer,
            new.is_supplier,
        )?;
        repo::find_party(ctx.db(), company_id, id)?
            .ok_or_else(|| AppError::internal("Party could not be created"))
    })?;

    Ok(party.to_json())
}

fn update_party(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::PARTY_EDIT)?;
    let company_id = ctx.company_id()?;
    let id = id_arg(input)?;

    let mut patch = repo::PartyPatch::default();
    if input.get("name").is_some() {
        patch.name = Some(required_text(input, "name", "Party name", 200)?);
    }
    patch.phone = patch_text(input, "phone", "Phone", 24)?;
    patch.email = patch_text(input, "email", "Email", 254)?;
    patch.gstin = patch_gstin(input)?;
    patch.state_code = patch_text(input, "stateCode", "State code", 2)?;
    patch.billing_address = patch_text(input, "billingAddress", "Billing address", 500)?;
    patch.notes = patch_text(input, "notes", "Notes", 1000)?;
    patch.credit_days = optional_int_range(input, "creditDays", 0, 365)?;
    patch.credit_limit_minor = optional_int_range(input, "creditLimitMinor", 0, i64::MAX)?;
    patch.is_customer = opt_bool(input, "isCustomer");
    patch.is_supplier = opt_bool(input, "isSupplier");
    if let Some(opening_balance_minor) = opt_i64(input, "openingBalanceMinor") {
        patch.opening_balance_minor = Some(opening_balance_minor);
        patch.opening_balance_date = patch_text(input, "openingBalanceDate", "Opening balance date", 10)?;
    }

    let party = ctx.with_tx(|ctx| {
        repo::update_party(ctx.db(), company_id, id, &patch)?
            .ok_or_else(|| AppError::not_found("Party not found"))
    })?;

    Ok(party.to_json())
}

fn deactivate_party(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::PARTY_DEACTIVATE)?;
    let company_id = ctx.company_id()?;
    let id = id_arg(input)?;
    ctx.with_tx(|ctx| repo::set_party_active(ctx.db(), company_id, id, false))?;
    Ok(json!(null))
}

/* -------------------------------------------------------------------------- */
/* Items                                                                       */
/* -------------------------------------------------------------------------- */

fn list_items(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::ITEM_VIEW)?;
    let company_id = ctx.company_id()?;

    let query = opt_trimmed(input, "query");
    if let Some(query) = &query {
        if query.chars().count() > 120 {
            return Err(AppError::validation(
                "query: String must contain at most 120 character(s)",
            ));
        }
    }
    let include_inactive = opt_bool(input, "includeInactive").unwrap_or(false);

    let items = repo::list_items(ctx.db(), company_id, query.as_deref(), include_inactive)?;
    Ok(json!(items.iter().map(repo::Item::to_json).collect::<Vec<_>>()))
}

fn get_item(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::ITEM_VIEW)?;
    let company_id = ctx.company_id()?;
    let id = id_arg(input)?;
    let item = repo::find_item(ctx.db(), company_id, id)?
        .ok_or_else(|| AppError::validation("Item not found"))?;
    Ok(item.to_json())
}

fn create_item(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::ITEM_CREATE)?;
    let company_id = ctx.company_id()?;
    let user_id = ctx.user_id()?;

    let name = required_text(input, "name", "Item name", 200)?;
    if name.chars().count() < 2 {
        return Err(AppError::validation("Item name is required"));
    }

    let new = repo::NewItem {
        name,
        sku: optional_text(input, "sku", "SKU", 60)?,
        hsn_sac: optional_text(input, "hsnSac", "HSN/SAC", 20)?,
        uom_id: optional_positive_int(input, "uomId")?,
        gst_rate_bps: int_or(input, "gstRateBps", 0, 0, 5000)?,
        is_service: opt_bool(input, "isService").unwrap_or(false),
        sale_price_minor: int_or(input, "salePriceMinor", 0, 0, i64::MAX)?,
        purchase_price_minor: int_or(input, "purchasePriceMinor", 0, 0, i64::MAX)?,
        opening_qty_e4: int_or(input, "openingQtyE4", 0, 0, i64::MAX)?,
        opening_rate_minor: int_or(input, "openingRateMinor", 0, 0, i64::MAX)?,
        reorder_level_e4: int_or(input, "reorderLevelE4", 0, 0, i64::MAX)?,
        created_by: Some(user_id),
    };

    let item = ctx.with_tx(|ctx| {
        let id = repo::insert_item(ctx.db(), company_id, &new)?;
        repo::find_item(ctx.db(), company_id, id)?
            .ok_or_else(|| AppError::internal("Item could not be created"))
    })?;

    Ok(item.to_json())
}

fn update_item(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::ITEM_EDIT)?;
    let company_id = ctx.company_id()?;
    let id = id_arg(input)?;

    let mut patch = repo::ItemPatch {
        sku: patch_text(input, "sku", "SKU", 60)?,
        hsn_sac: patch_text(input, "hsnSac", "HSN/SAC", 20)?,
        uom_id: match input.get("uomId") {
            None => None,
            Some(Value::Null) => Some(None),
            Some(_) => match optional_positive_int(input, "uomId")? {
                Some(uom_id) => Some(Some(uom_id)),
                None => None,
            },
        },
        gst_rate_bps: optional_int_range(input, "gstRateBps", 0, 5000)?,
        is_service: opt_bool(input, "isService"),
        sale_price_minor: optional_int_range(input, "salePriceMinor", 0, i64::MAX)?,
        purchase_price_minor: optional_int_range(input, "purchasePriceMinor", 0, i64::MAX)?,
        opening_qty_e4: optional_int_range(input, "openingQtyE4", 0, i64::MAX)?,
        opening_rate_minor: optional_int_range(input, "openingRateMinor", 0, i64::MAX)?,
        reorder_level_e4: optional_int_range(input, "reorderLevelE4", 0, i64::MAX)?,
        ..Default::default()
    };
    if input.get("name").is_some() {
        patch.name = Some(required_text(input, "name", "Item name", 200)?);
    }

    let item = ctx.with_tx(|ctx| {
        repo::update_item(ctx.db(), company_id, id, &patch)?
            .ok_or_else(|| AppError::not_found("Item not found"))
    })?;

    Ok(item.to_json())
}

fn deactivate_item(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::ITEM_DEACTIVATE)?;
    let company_id = ctx.company_id()?;
    let id = id_arg(input)?;
    ctx.with_tx(|ctx| repo::set_item_active(ctx.db(), company_id, id, false))?;
    Ok(json!(null))
}

/* -------------------------------------------------------------------------- */
/* Accounts                                                                    */
/* -------------------------------------------------------------------------- */

fn list_accounts(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::COMPANY_VIEW)?;
    let company_id = ctx.company_id()?;
    let include_inactive = opt_bool(input, "includeInactive").unwrap_or(false);
    let accounts = repo::list_accounts(ctx.db(), company_id, include_inactive)?;
    Ok(json!(accounts.iter().map(repo::Account::to_json).collect::<Vec<_>>()))
}

fn list_account_groups(ctx: &mut Ctx<'_>) -> AppResult<Value> {
    ctx.require_permission(perm::COMPANY_VIEW)?;
    let company_id = ctx.company_id()?;
    let groups = repo::list_account_groups(ctx.db(), company_id)?;
    Ok(json!(groups.iter().map(repo::AccountGroup::to_json).collect::<Vec<_>>()))
}

fn create_account(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::SETTINGS_MANAGE)?;
    let company_id = ctx.company_id()?;

    let name = required_text(input, "name", "Account name", 160)?;
    let group_id = optional_positive_int(input, "groupId")?
        .ok_or_else(|| AppError::validation("groupId is required"))?;
    let account_type = opt_str(input, "type").unwrap_or_default();
    if !matches!(
        account_type.as_str(),
        "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE"
    ) {
        return Err(AppError::validation(format!(
            "type: Invalid enum value. Expected 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE', received '{account_type}'"
        )));
    }
    let opening_balance_minor = opt_i64(input, "openingBalanceMinor").unwrap_or(0);
    let opening_balance_side = opt_str(input, "openingBalanceSide").unwrap_or_else(|| "DEBIT".to_string());
    if !matches!(opening_balance_side.as_str(), "DEBIT" | "CREDIT") {
        return Err(AppError::validation(format!(
            "openingBalanceSide: Invalid enum value. Expected 'DEBIT' | 'CREDIT', received '{opening_balance_side}'"
        )));
    }

    let account = ctx.with_tx(|ctx| {
        let id = repo::insert_account(
            ctx.db(),
            company_id,
            group_id,
            &name,
            &account_type,
            opening_balance_minor,
            &opening_balance_side,
        )?;
        repo::list_accounts(ctx.db(), company_id, false)?
            .into_iter()
            .find(|account| account.id == id)
            .ok_or_else(|| AppError::internal("Account could not be created"))
    })?;

    Ok(account.to_json())
}

fn deactivate_account(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::SETTINGS_MANAGE)?;
    let company_id = ctx.company_id()?;
    let id = id_arg(input)?;
    ctx.with_tx(|ctx| repo::set_account_active(ctx.db(), company_id, id, false))?;
    Ok(json!(null))
}

/* -------------------------------------------------------------------------- */
/* Units                                                                       */
/* -------------------------------------------------------------------------- */

fn list_units(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::ITEM_VIEW)?;
    let company_id = ctx.company_id()?;
    let include_inactive = opt_bool(input, "includeInactive").unwrap_or(false);
    let units = repo::list_units(ctx.db(), company_id, include_inactive)?;
    Ok(json!(units.iter().map(repo::Unit::to_json).collect::<Vec<_>>()))
}

fn create_unit(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::SETTINGS_MANAGE)?;
    let company_id = ctx.company_id()?;

    let name = required_text(input, "name", "Unit name", 40)?;
    let symbol = required_text(input, "symbol", "Symbol", 10)?;
    let decimals = int_or(input, "decimals", 0, 0, 4)?;

    if let Some(duplicate) =
        repo::find_unit_by_name_or_symbol(ctx.db(), company_id, &name, &symbol, None)?
    {
        return Err(AppError::validation(format!(
            "\"{}\" already uses that unit name or symbol",
            duplicate.name
        )));
    }

    let unit = ctx.with_tx(|ctx| {
        let id = repo::insert_unit(ctx.db(), company_id, &name, &symbol, decimals)?;
        repo::find_unit(ctx.db(), company_id, id)?
            .ok_or_else(|| AppError::internal("Unit could not be created"))
    })?;

    Ok(unit.to_json())
}

fn update_unit(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::SETTINGS_MANAGE)?;
    let company_id = ctx.company_id()?;
    let id = id_arg(input)?;

    let existing = repo::find_unit(ctx.db(), company_id, id)?
        .ok_or_else(|| AppError::validation("Unit not found"))?;

    let name = if input.get("name").is_some() {
        Some(required_text(input, "name", "Unit name", 40)?)
    } else {
        None
    };
    let symbol = if input.get("symbol").is_some() {
        Some(required_text(input, "symbol", "Symbol", 10)?)
    } else {
        None
    };
    let decimals = optional_int_range(input, "decimals", 0, 4)?;
    let is_active = opt_bool(input, "isActive");

    let next_name = name.clone().unwrap_or_else(|| existing.name.clone());
    let next_symbol = symbol.clone().unwrap_or_else(|| existing.symbol.clone());
    if name.is_some() || symbol.is_some() {
        if let Some(duplicate) = repo::find_unit_by_name_or_symbol(
            ctx.db(),
            company_id,
            &next_name,
            &next_symbol,
            Some(id),
        )? {
            return Err(AppError::validation(format!(
                "\"{}\" already uses that unit name or symbol",
                duplicate.name
            )));
        }
    }

    if is_active == Some(false) && existing.is_active && existing.usage_count > 0 {
        return Err(AppError::validation(unit_usage_message(existing.usage_count)));
    }

    let patch = repo::UnitPatch {
        name,
        symbol,
        decimals,
        is_active,
    };
    let unit = ctx.with_tx(|ctx| {
        repo::update_unit(ctx.db(), company_id, id, &patch)?
            .ok_or_else(|| AppError::validation("Unit not found"))
    })?;

    Ok(unit.to_json())
}

fn deactivate_unit(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::SETTINGS_MANAGE)?;
    let company_id = ctx.company_id()?;
    let id = id_arg(input)?;

    let unit = ctx.with_tx(|ctx| {
        let existing = repo::find_unit(ctx.db(), company_id, id)?
            .ok_or_else(|| AppError::validation("Unit not found"))?;
        if !existing.is_active {
            return Ok(existing);
        }
        if existing.usage_count > 0 {
            return Err(AppError::validation(unit_usage_message(existing.usage_count)));
        }
        let patch = repo::UnitPatch { is_active: Some(false), ..Default::default() };
        repo::update_unit(ctx.db(), company_id, id, &patch)?
            .ok_or_else(|| AppError::validation("Unit not found"))
    })?;

    Ok(unit.to_json())
}

/* -------------------------------------------------------------------------- */
/* Tax rates                                                                   */
/* -------------------------------------------------------------------------- */

/// The business date used to decide which row is current.
fn resolve_as_of(input: &Value) -> AppResult<String> {
    match opt_trimmed(input, "asOf") {
        None => Ok(crate::state::today_iso()),
        Some(as_of) => {
            assert_valid_business_date(&as_of, "as of date")?;
            Ok(as_of)
        }
    }
}

struct NormalizedTaxRate {
    gst_rate_bps: i64,
    cess_rate_bps: i64,
    description: String,
    effective_from: String,
}

/// `normalizeTaxRate`: validates the start date and falls back to a label.
fn normalize_tax_rate(input: &Value) -> AppResult<NormalizedTaxRate> {
    let effective_from = req_str(input, "effectiveFrom")?;
    assert_valid_business_date(&effective_from, "effective from")?;
    let gst_rate_bps = int_in_range(input, "gstRateBps", 0, 10000)?;
    let cess_rate_bps = int_or(input, "cessRateBps", 0, 0, 10000)?;
    let description = optional_text(input, "description", "Description", 120)?
        .unwrap_or_else(|| tax_rate_label(gst_rate_bps, cess_rate_bps));
    Ok(NormalizedTaxRate { gst_rate_bps, cess_rate_bps, description, effective_from })
}

fn list_tax_rates(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::ITEM_VIEW)?;
    let company_id = ctx.company_id()?;
    let as_of = resolve_as_of(input)?;
    let include_history = opt_bool(input, "includeHistory").unwrap_or(false);
    let rates = repo::list_tax_rates(ctx.db(), company_id, &as_of, include_history)?;
    Ok(json!(rates.iter().map(repo::TaxRate::to_json).collect::<Vec<_>>()))
}

fn create_tax_rate(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::SETTINGS_MANAGE)?;
    let company_id = ctx.company_id()?;
    let normalized = normalize_tax_rate(input)?;

    let overlap = repo::find_overlapping(
        ctx.db(),
        company_id,
        normalized.gst_rate_bps,
        normalized.cess_rate_bps,
        &normalized.effective_from,
        None,
        None,
    )?;
    if let Some(overlap) = overlap {
        return Err(AppError::validation(format!(
            "A {} rate already runs from {}. Revise that rate instead of adding an overlapping one.",
            tax_rate_label(normalized.gst_rate_bps, normalized.cess_rate_bps),
            overlap.effective_from
        )));
    }

    let new = repo::NewTaxRate {
        gst_rate_bps: normalized.gst_rate_bps,
        cess_rate_bps: normalized.cess_rate_bps,
        description: normalized.description,
        effective_from: normalized.effective_from,
    };
    let created = ctx.with_tx(|ctx| repo::insert_tax_rate(ctx.db(), company_id, &new))?;

    Ok(created.to_json())
}

fn revise_tax_rate(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::SETTINGS_MANAGE)?;
    let company_id = ctx.company_id()?;
    let id = id_arg(input)?;

    let created = ctx.with_tx(|ctx| {
        let today = crate::state::today_iso();
        let existing = repo::find_tax_rate(ctx.db(), company_id, id, &today)?
            .ok_or_else(|| AppError::validation("Tax rate not found"))?;
        if existing.effective_to.is_some() {
            return Err(AppError::validation(
                "This rate has already ended. Add a new rate instead.",
            ));
        }
        let effective_from = req_str(input, "effectiveFrom")?;
        if effective_from <= existing.effective_from {
            return Err(AppError::validation(format!(
                "The new rate must start after {}",
                existing.effective_from
            )));
        }

        let normalized = normalize_tax_rate(input)?;
        let overlap = repo::find_overlapping(
            ctx.db(),
            company_id,
            normalized.gst_rate_bps,
            normalized.cess_rate_bps,
            &normalized.effective_from,
            None,
            Some(existing.id),
        )?;
        if let Some(overlap) = overlap {
            return Err(AppError::validation(format!(
                "A {} rate already runs from {}. Revise that rate instead.",
                tax_rate_label(normalized.gst_rate_bps, normalized.cess_rate_bps),
                overlap.effective_from
            )));
        }

        let end_date = add_days_iso(&normalized.effective_from, -1)?;
        repo::set_effective_to(ctx.db(), company_id, existing.id, &end_date)?;

        let new = repo::NewTaxRate {
            gst_rate_bps: normalized.gst_rate_bps,
            cess_rate_bps: normalized.cess_rate_bps,
            description: normalized.description,
            effective_from: normalized.effective_from,
        };
        repo::insert_tax_rate(ctx.db(), company_id, &new)
    })?;

    Ok(created.to_json())
}

fn retire_tax_rate(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::SETTINGS_MANAGE)?;
    let company_id = ctx.company_id()?;
    let id = id_arg(input)?;
    let effective_from = req_str(input, "effectiveFrom")?;

    let updated = ctx.with_tx(|ctx| {
        let today = crate::state::today_iso();
        let existing = repo::find_tax_rate(ctx.db(), company_id, id, &today)?
            .ok_or_else(|| AppError::validation("Tax rate not found"))?;
        if existing.effective_to.is_some() {
            return Err(AppError::validation("This rate has already ended"));
        }
        if effective_from <= existing.effective_from {
            return Err(AppError::validation(format!(
                "The end date must be after {}",
                existing.effective_from
            )));
        }

        let end_date = add_days_iso(&effective_from, -1)?;
        repo::set_effective_to(ctx.db(), company_id, existing.id, &end_date)?;

        repo::find_tax_rate(ctx.db(), company_id, existing.id, &crate::state::today_iso())?
            .ok_or_else(|| AppError::validation("Tax rate not found"))
    })?;

    Ok(updated.to_json())
}

/* -------------------------------------------------------------------------- */
/* Godowns                                                                     */
/* -------------------------------------------------------------------------- */

fn list_godowns(ctx: &mut Ctx<'_>) -> AppResult<Value> {
    ctx.require_permission(perm::ITEM_VIEW)?;
    let company_id = ctx.company_id()?;
    let godowns = repo::list_godowns(ctx.db(), company_id)?;
    Ok(json!(godowns.iter().map(repo::Godown::to_json).collect::<Vec<_>>()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_rates_like_the_renderer() {
        assert_eq!(format_rate_bps(1800), "18%");
        assert_eq!(format_rate_bps(1850), "18.5%");
        assert_eq!(format_rate_bps(1005), "10.05%");
        assert_eq!(format_rate_bps(0), "0%");
    }

    #[test]
    fn builds_tax_rate_labels() {
        assert_eq!(tax_rate_label(0, 0), "Exempt");
        assert_eq!(tax_rate_label(1800, 0), "GST 18%");
        assert_eq!(tax_rate_label(0, 500), "Nil GST + 5% cess");
        assert_eq!(tax_rate_label(1800, 50), "GST 18% + 0.5% cess");
    }

    #[test]
    fn adds_days_across_month_ends() {
        assert_eq!(add_days_iso("2026-03-01", -1).ok().as_deref(), Some("2026-02-28"));
        assert_eq!(add_days_iso("2024-03-01", -1).ok().as_deref(), Some("2024-02-29"));
    }

    #[test]
    fn rejects_impossible_business_dates() {
        let impossible = assert_valid_business_date("2026-02-30", "effective from").err();
        assert_eq!(
            impossible.map(|error| error.message).as_deref(),
            Some("effective from is not a real calendar date")
        );

        let malformed = assert_valid_business_date("30-02-2026", "effective from").err();
        assert_eq!(
            malformed.map(|error| error.message).as_deref(),
            Some("effective from must be a YYYY-MM-DD date")
        );

        assert!(assert_valid_business_date("2026-02-28", "effective from").is_ok());
    }

    #[test]
    fn pluralises_unit_usage() {
        assert_eq!(
            unit_usage_message(1),
            "This unit is used by 1 item. Change those items to another unit first."
        );
        assert_eq!(
            unit_usage_message(3),
            "This unit is used by 3 items. Change those items to another unit first."
        );
    }
}
