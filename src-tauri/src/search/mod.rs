//! Global search across parties, items, vouchers and accounts.
//!
//! Mirrors `src/main/application/search.ts`. A family is only searched when the
//! signed-in role holds its view permission, so the palette can never leak a
//! name the role cannot open elsewhere.

mod repo;

use serde_json::{json, Value};

use crate::db::permissions::codes as perm;
use crate::error::{AppError, AppResult};
use crate::json::{arg, opt_trimmed};
use crate::state::Ctx;

/// One group at a time, capped so the palette stays quick to scan.
const SEARCH_GROUP_LIMIT: i64 = 5;

fn query(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    let company_id = ctx.company_id()?;
    let query = opt_trimmed(input, "query")
        .ok_or_else(|| AppError::validation("query: must be at least 1 character"))?;
    if query.chars().count() > 120 {
        return Err(AppError::validation("query: must be at most 120 characters"));
    }

    let mut groups: Vec<Value> = Vec::new();
    let mut total: i64 = 0;

    if ctx.has_permission(perm::PARTY_VIEW) {
        let items = repo::parties(ctx.db(), company_id, &query, SEARCH_GROUP_LIMIT)?;
        if !items.is_empty() {
            total += items.len() as i64;
            groups.push(json!({
                "kind": "PARTY",
                "label": "Parties",
                "items": items.iter().map(|item| item.to_json()).collect::<Vec<_>>()
            }));
        }
    }
    if ctx.has_permission(perm::ITEM_VIEW) {
        let items = repo::items(ctx.db(), company_id, &query, SEARCH_GROUP_LIMIT)?;
        if !items.is_empty() {
            total += items.len() as i64;
            groups.push(json!({
                "kind": "ITEM",
                "label": "Items",
                "items": items.iter().map(|item| item.to_json()).collect::<Vec<_>>()
            }));
        }
    }
    if ctx.has_permission(perm::VOUCHER_VIEW) {
        let items = repo::vouchers(ctx.db(), company_id, &query, SEARCH_GROUP_LIMIT)?;
        if !items.is_empty() {
            total += items.len() as i64;
            groups.push(json!({
                "kind": "VOUCHER",
                "label": "Vouchers",
                "items": items.iter().map(|item| item.to_json()).collect::<Vec<_>>()
            }));
        }
    }
    if ctx.has_permission(perm::COMPANY_VIEW) {
        let items = repo::accounts(ctx.db(), company_id, &query, SEARCH_GROUP_LIMIT)?;
        if !items.is_empty() {
            total += items.len() as i64;
            groups.push(json!({
                "kind": "ACCOUNT",
                "label": "Accounts",
                "items": items.iter().map(|item| item.to_json()).collect::<Vec<_>>()
            }));
        }
    }

    Ok(json!({
        "query": query,
        "groups": groups,
        "total": total
    }))
}

pub fn dispatch(ctx: &mut Ctx<'_>, channel: &str, args: &[Value]) -> Option<AppResult<Value>> {
    match channel {
        "search:query" => Some(query(ctx, arg(args, 0))),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gst_meta_has_the_same_decimals_as_tofixed() {
        assert_eq!(repo::gst_label(1800), "18% GST");
        assert_eq!(repo::gst_label(1250), "12.50% GST");
        assert_eq!(repo::gst_label(500), "5% GST");
        assert_eq!(repo::gst_label(0), "0% GST");
    }

    #[test]
    fn pattern_is_trimmed_and_lowercased() {
        assert_eq!(repo::pattern("  Acme "), "%acme%");
    }

    #[test]
    fn role_labels_cover_every_combination() {
        assert_eq!(repo::role_label(true, true), "Customer and supplier");
        assert_eq!(repo::role_label(true, false), "Customer");
        assert_eq!(repo::role_label(false, true), "Supplier");
        assert_eq!(repo::role_label(false, false), "Party");
    }
}
