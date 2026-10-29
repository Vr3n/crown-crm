//! Voucher numbering: settings, sequence allocation and the next-number preview.
//! Mirrors `src/shared/numbering.ts`, `src/main/domain/numbering.ts` and
//! `src/main/repositories/numbering.ts`.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::json::{arg, array, opt_bool, opt_i64, opt_str, req_str};
use crate::state::Ctx;

pub const VOUCHER_TYPE_ORDER: &[&str] = &[
    "SALES",
    "PURCHASE",
    "RECEIPT",
    "PAYMENT",
    "CREDIT_NOTE",
    "DEBIT_NOTE",
    "JOURNAL",
    "CONTRA",
    "OPENING",
];

pub struct Defaults {
    pub label: &'static str,
    pub series: &'static str,
    pub prefix: &'static str,
    pub suffix: &'static str,
    pub padding: i64,
    pub start_number: i64,
}

pub fn defaults(voucher_type: &str) -> Option<Defaults> {
    let value = match voucher_type {
        "SALES" => Defaults { label: "Sales invoice", series: "INV", prefix: "INV/", suffix: "", padding: 4, start_number: 1 },
        "PURCHASE" => Defaults { label: "Purchase bill", series: "PUR", prefix: "PUR/", suffix: "", padding: 4, start_number: 1 },
        "RECEIPT" => Defaults { label: "Receipt", series: "RCT", prefix: "RCT/", suffix: "", padding: 4, start_number: 1 },
        "PAYMENT" => Defaults { label: "Payment", series: "PAY", prefix: "PAY/", suffix: "", padding: 4, start_number: 1 },
        "CREDIT_NOTE" => Defaults { label: "Credit note", series: "CN", prefix: "CN/", suffix: "", padding: 4, start_number: 1 },
        "DEBIT_NOTE" => Defaults { label: "Debit note", series: "DN", prefix: "DN/", suffix: "", padding: 4, start_number: 1 },
        "JOURNAL" => Defaults { label: "Journal", series: "JV", prefix: "JV/", suffix: "", padding: 4, start_number: 1 },
        "CONTRA" => Defaults { label: "Contra", series: "CTR", prefix: "CTR/", suffix: "", padding: 4, start_number: 1 },
        "OPENING" => Defaults { label: "Opening balances", series: "OPN", prefix: "OPN/", suffix: "", padding: 4, start_number: 1 },
        _ => return None,
    };
    Some(value)
}

pub fn is_voucher_type(value: &str) -> bool {
    defaults(value).is_some()
}

/// Ensures every voucher type has a settings row. Idempotent.
pub fn ensure_defaults(conn: &Connection, company_id: i64) -> AppResult<()> {
    for voucher_type in VOUCHER_TYPE_ORDER {
        let Some(item) = defaults(voucher_type) else { continue };
        conn.execute(
            "INSERT INTO voucher_number_settings
               (company_id, voucher_type, series, prefix, suffix, padding, start_number, reset_period)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'YEARLY')
             ON CONFLICT DO NOTHING",
            params![company_id, voucher_type, item.series, item.prefix, item.suffix, item.padding, item.start_number],
        )?;
    }
    Ok(())
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Setting {
    pub voucher_type: String,
    pub series: String,
    pub prefix: String,
    pub suffix: String,
    pub padding: i64,
    pub start_number: i64,
    pub reset_period: String,
    pub manual_override: bool,
}

pub fn get_setting(conn: &Connection, company_id: i64, voucher_type: &str) -> AppResult<Setting> {
    let Some(fallback) = defaults(voucher_type) else {
        return Err(AppError::validation(format!("Unknown voucher type: {voucher_type}")));
    };
    let row = conn
        .query_row(
            "SELECT series, prefix, suffix, padding, start_number, reset_period, manual_override
             FROM voucher_number_settings WHERE company_id = ?1 AND voucher_type = ?2",
            params![company_id, voucher_type],
            |row| {
                Ok(Setting {
                    voucher_type: voucher_type.to_string(),
                    series: row.get(0)?,
                    prefix: row.get(1)?,
                    suffix: row.get(2)?,
                    padding: row.get(3)?,
                    start_number: row.get(4)?,
                    reset_period: row.get(5)?,
                    manual_override: row.get::<_, i64>(6)? != 0,
                })
            },
        )
        .optional()?;

    Ok(row.unwrap_or_else(|| Setting {
        voucher_type: voucher_type.to_string(),
        series: fallback.series.to_string(),
        prefix: fallback.prefix.to_string(),
        suffix: fallback.suffix.to_string(),
        padding: fallback.padding,
        start_number: fallback.start_number,
        reset_period: "YEARLY".to_string(),
        manual_override: false,
    }))
}

pub fn financial_year_label(date_iso: &str, start_month: i64) -> String {
    let mut parts = date_iso.split('-');
    let year: i64 = parts.next().and_then(|p| p.parse().ok()).unwrap_or(1970);
    let month: i64 = parts.next().and_then(|p| p.parse().ok()).unwrap_or(1);
    let start_year = if month >= start_month { year } else { year - 1 };
    format!("{start_year}-{:02}", (start_year + 1).rem_euclid(100))
}

pub fn resolve_tokens(template: &str, date: &str, fy: &str) -> String {
    let mut parts = date.split('-');
    let year = parts.next().unwrap_or("");
    let month = parts.next().unwrap_or("");
    let day = parts.next().unwrap_or("");

    let yyyymm = if year.is_empty() || month.is_empty() {
        "{YYYYMM}".to_string()
    } else {
        format!("{year}{month}")
    };
    let yy = if year.len() >= 2 { &year[year.len() - 2..] } else { "{YY}" };
    let fy_short = if fy.is_empty() {
        "{FY_SHORT}".to_string()
    } else {
        fy.split('-')
            .map(|part| part[part.len().saturating_sub(2)..].to_string())
            .collect::<Vec<_>>()
            .join("-")
    };

    // Longest tokens first so `{FY_SHORT}` is not eaten by `{FY}`.
    template
        .replace("{YYYYMM}", &yyyymm)
        .replace("{YYYY}", if year.is_empty() { "{YYYY}" } else { year })
        .replace("{YY}", yy)
        .replace("{MM}", if month.is_empty() { "{MM}" } else { month })
        .replace("{DD}", if day.is_empty() { "{DD}" } else { day })
        .replace("{FY_SHORT}", &fy_short)
        .replace("{FY}", if fy.is_empty() { "{FY}" } else { fy })
}

pub fn format_number(prefix: &str, value: i64, padding: i64, suffix: &str, date: &str, fy: &str) -> String {
    let width = padding.max(1) as usize;
    let padded = format!("{value:0width$}");
    format!("{}{}{}", resolve_tokens(prefix, date, fy), padded, resolve_tokens(suffix, date, fy))
}

pub fn next_sequence_value(last_value: i64, start_number: i64) -> i64 {
    let floor = (start_number - 1).max(0);
    last_value.max(floor) + 1
}

pub fn sequence_period(date: &str, fy: &str, reset: &str) -> String {
    match reset {
        "MONTHLY" => date.chars().take(7).collect(),
        "YEARLY" => fy.to_string(),
        _ => "ALL".to_string(),
    }
}

pub fn validate_setting(series: &str, prefix: &str, suffix: &str, padding: i64, start_number: i64) -> Option<String> {
    let series = series.trim().to_uppercase();
    let valid_series = series.len() >= 2
        && series.len() <= 8
        && series.chars().next().is_some_and(|c| c.is_ascii_uppercase())
        && series.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit());
    if !valid_series {
        return Some("Series must be 2 to 8 letters or digits, starting with a letter".to_string());
    }
    for (value, label) in [(prefix, "Prefix"), (suffix, "Suffix")] {
        if value.chars().count() > 40
            || !value.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '-' | '{' | '}'))
        {
            return Some(format!("{label} may use letters, digits, /, - and the date tokens"));
        }
        if let Some(token) = unknown_tokens(value).first() {
            return Some(format!(
                "Unknown token {token}. Use {{YYYY}}, {{YY}}, {{MM}}, {{DD}}, {{YYYYMM}}, {{FY}}, {{FY_SHORT}}"
            ));
        }
    }
    if !(1..=8).contains(&padding) {
        return Some("Width must be between 1 and 8 digits".to_string());
    }
    if !(1..=99_999_999).contains(&start_number) {
        return Some("Starting number must be between 1 and 99999999".to_string());
    }
    let length = format_number(prefix, 1, padding, suffix, "2026-07-13", "2026-27").chars().count();
    if length > 16 {
        return Some(format!(
            "The number is {length} characters. GST allows 16. Shorten the prefix or width"
        ));
    }
    None
}

fn unknown_tokens(template: &str) -> Vec<String> {
    const KNOWN: &[&str] = &["{YYYY}", "{YY}", "{MM}", "{DD}", "{YYYYMM}", "{FY}", "{FY_SHORT}"];
    let mut found = Vec::new();
    let mut rest = template;
    while let Some(start) = rest.find('{') {
        let Some(end_rel) = rest[start..].find('}') else { break };
        let token = &rest[start..start + end_rel + 1];
        if !KNOWN.contains(&token) {
            found.push(token.to_string());
        }
        rest = &rest[start + end_rel + 1..];
    }
    found
}

fn company_fy_start_month(conn: &Connection, company_id: i64) -> AppResult<i64> {
    Ok(conn
        .query_row("SELECT fy_start_month FROM companies WHERE id = ?1", params![company_id], |row| row.get(0))
        .optional()?
        .unwrap_or(4))
}

pub fn list(conn: &Connection, company_id: i64) -> AppResult<Vec<Value>> {
    ensure_defaults(conn, company_id)?;
    let start_month = company_fy_start_month(conn, company_id)?;
    let today = crate::state::today_iso();
    let fy = financial_year_label(&today, start_month);

    let mut rows = Vec::new();
    for voucher_type in VOUCHER_TYPE_ORDER {
        let setting = get_setting(conn, company_id, voucher_type)?;
        let Some(item) = defaults(voucher_type) else { continue };
        let period = sequence_period(&today, &fy, &setting.reset_period);

        let last_value: i64 = conn
            .query_row(
                "SELECT last_value FROM voucher_sequences
                 WHERE company_id = ?1 AND voucher_type = ?2 AND series = ?3 AND fy = ?4",
                params![company_id, voucher_type, setting.series, period],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or(0);

        let used_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM vouchers WHERE company_id = ?1 AND voucher_type = ?2",
            params![company_id, voucher_type],
            |row| row.get(0),
        )?;

        let next = next_sequence_value(last_value, setting.start_number);
        rows.push(json!({
            "voucherType": voucher_type,
            "label": item.label,
            "series": setting.series,
            "prefix": setting.prefix,
            "suffix": setting.suffix,
            "padding": setting.padding,
            "startNumber": setting.start_number,
            "resetPeriod": setting.reset_period,
            "manualOverride": setting.manual_override,
            "fy": fy,
            "nextNumber": format_number(&setting.prefix, next, setting.padding, &setting.suffix, &today, &fy),
            "lastUsed": last_value,
            "usedCount": used_count
        }));
    }
    Ok(rows)
}

pub fn update(conn: &Connection, company_id: i64, items: &[Value]) -> AppResult<()> {
    for item in items {
        let voucher_type = req_str(item, "voucherType")?;
        if !is_voucher_type(&voucher_type) {
            return Err(AppError::validation(format!("Unknown voucher type: {voucher_type}")));
        }
        let series = req_str(item, "series")?.trim().to_uppercase();
        let prefix = opt_str(item, "prefix").unwrap_or_default().trim().to_string();
        let suffix = opt_str(item, "suffix").unwrap_or_default().trim().to_string();
        let padding = opt_i64(item, "padding").unwrap_or(4);
        let start_number = opt_i64(item, "startNumber").unwrap_or(1);
        let reset_period = opt_str(item, "resetPeriod").unwrap_or_else(|| "YEARLY".to_string());
        let manual_override = opt_bool(item, "manualOverride").unwrap_or(false);

        if !matches!(reset_period.as_str(), "YEARLY" | "MONTHLY" | "NEVER") {
            return Err(AppError::validation(format!("{voucher_type}: Unknown reset period")));
        }
        if let Some(problem) = validate_setting(&series, &prefix, &suffix, padding, start_number) {
            return Err(AppError::validation(format!("{voucher_type}: {problem}")));
        }

        conn.execute(
            "INSERT INTO voucher_number_settings
               (company_id, voucher_type, series, prefix, suffix, padding, start_number, reset_period, manual_override)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(company_id, voucher_type) DO UPDATE SET
               series = excluded.series,
               prefix = excluded.prefix,
               suffix = excluded.suffix,
               padding = excluded.padding,
               start_number = excluded.start_number,
               reset_period = excluded.reset_period,
               manual_override = excluded.manual_override,
               updated_at = datetime('now')",
            params![
                company_id,
                voucher_type,
                series,
                prefix,
                suffix,
                padding,
                start_number,
                reset_period,
                i64::from(manual_override)
            ],
        )?;

        // Keep the open sequence row in step so the next number uses the new
        // prefix and width without consuming or renumbering anything.
        conn.execute(
            "UPDATE voucher_sequences SET prefix = ?1, suffix = ?2, padding = ?3
             WHERE company_id = ?4 AND voucher_type = ?5 AND series = ?6",
            params![prefix, suffix, padding, company_id, voucher_type, series],
        )?;
    }
    Ok(())
}

pub fn mark_setup_complete(conn: &Connection, company_id: i64) -> AppResult<()> {
    conn.execute("UPDATE companies SET numbering_setup_at = datetime('now') WHERE id = ?1", params![company_id])?;
    Ok(())
}

pub fn mark_onboarding_complete(conn: &Connection, company_id: i64) -> AppResult<()> {
    conn.execute(
        "UPDATE companies SET onboarding_completed_at = datetime('now') WHERE id = ?1",
        params![company_id],
    )?;
    Ok(())
}

/// Allocates the next voucher number for a type and date, advancing the
/// sequence. Must run inside the caller's transaction.
pub fn allocate_number(
    conn: &Connection,
    company_id: i64,
    voucher_type: &str,
    date: &str,
    manual_number: Option<i64>,
) -> AppResult<(String, String, String)> {
    ensure_defaults(conn, company_id)?;
    let setting = get_setting(conn, company_id, voucher_type)?;
    let start_month = company_fy_start_month(conn, company_id)?;
    let fy = financial_year_label(date, start_month);
    let period = sequence_period(date, &fy, &setting.reset_period);

    let mut last_value: Option<i64> = conn
        .query_row(
            "SELECT last_value FROM voucher_sequences
             WHERE company_id = ?1 AND voucher_type = ?2 AND series = ?3 AND fy = ?4",
            params![company_id, voucher_type, setting.series, period],
            |row| row.get(0),
        )
        .optional()?;

    if last_value.is_none() {
        conn.execute(
            "INSERT INTO voucher_sequences (company_id, voucher_type, series, fy, prefix, suffix, padding, last_value)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                company_id,
                voucher_type,
                setting.series,
                period,
                setting.prefix,
                setting.suffix,
                setting.padding,
                (setting.start_number - 1).max(0)
            ],
        )?;
        last_value = Some((setting.start_number - 1).max(0));
    }

    let last_value = last_value.unwrap_or(0);
    let mut next = next_sequence_value(last_value, setting.start_number);

    if let Some(manual) = manual_number {
        if !setting.manual_override {
            return Err(AppError::validation("Manual voucher numbers are turned off for this series"));
        }
        if manual < setting.start_number {
            return Err(AppError::validation(format!(
                "Voucher number must be {} or higher",
                setting.start_number
            )));
        }
        if manual <= last_value {
            return Err(AppError::validation(format!("Voucher number must be greater than {last_value}")));
        }
        next = manual;
    }

    let number = format_number(&setting.prefix, next, setting.padding, &setting.suffix, date, &fy);
    if number.chars().count() > 16 {
        return Err(AppError::validation(format!(
            "Voucher number \"{number}\" is {} characters. GST allows 16. Shorten the prefix or width",
            number.chars().count()
        )));
    }

    conn.execute(
        "UPDATE voucher_sequences SET last_value = ?1, prefix = ?2, suffix = ?3, padding = ?4
         WHERE company_id = ?5 AND voucher_type = ?6 AND series = ?7 AND fy = ?8",
        params![next, setting.prefix, setting.suffix, setting.padding, company_id, voucher_type, setting.series, period],
    )?;

    Ok((number, fy, setting.series))
}

pub fn dispatch(ctx: &mut Ctx<'_>, channel: &str, args: &[Value]) -> Option<AppResult<Value>> {
    match channel {
        "numbering:list" => Some((|| {
            ctx.require_permission(crate::db::permissions::codes::SETTINGS_MANAGE)?;
            let company_id = ctx.company_id()?;
            Ok(json!(list(ctx.db(), company_id)?))
        })()),
        "numbering:update" => Some((|| {
            ctx.require_permission(crate::db::permissions::codes::SETTINGS_MANAGE)?;
            let company_id = ctx.company_id()?;
            let input = arg(args, 0);
            let items = array(input, "items").to_vec();
            if items.is_empty() {
                return Err(AppError::validation("At least one numbering setting is required"));
            }
            ctx.with_tx(|ctx| {
                update(ctx.db(), company_id, &items)?;
                mark_setup_complete(ctx.db(), company_id)?;
                mark_onboarding_complete(ctx.db(), company_id)?;
                Ok(())
            })?;
            Ok(json!(list(ctx.db(), company_id)?))
        })()),
        _ => None,
    }
}
