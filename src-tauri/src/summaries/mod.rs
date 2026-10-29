//! Page summaries (parties, items, vouchers).
//!
//! Mirrors `src/main/repositories/summaries.ts` and
//! `src/main/application/summaries.ts`. The TS handlers only require an
//! authenticated company, so no permission code is checked here.

mod repo;

use std::collections::HashMap;

use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::json::{arg, opt_str, req_str};
use crate::state::{today_iso, Ctx};

const AGEING_BUCKETS: [&str; 5] = ["Not due", "1-30", "31-60", "61-90", "90+"];
const MONTH_NAMES: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const VOUCHER_TYPES: [&str; 9] = [
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

fn parse_date(value: &str) -> Option<chrono::NaiveDate> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

fn days_between(from: &str, to: &str) -> i64 {
    match (parse_date(from), parse_date(to)) {
        (Some(start), Some(end)) => (end - start).num_days(),
        _ => 0,
    }
}

fn bucket_index(due_date: Option<&str>, today: &str) -> usize {
    let Some(due_date) = due_date else {
        return 0;
    };
    let overdue = days_between(due_date, today);
    if overdue <= 0 {
        0
    } else if overdue <= 30 {
        1
    } else if overdue <= 60 {
        2
    } else if overdue <= 90 {
        3
    } else {
        4
    }
}

/// `Math.round(numerator / denominator)` for a positive denominator.
fn round_div(numerator: i64, denominator: i64) -> i64 {
    if denominator <= 0 {
        return 0;
    }
    let quotient = numerator.div_euclid(denominator);
    let remainder = numerator.rem_euclid(denominator);
    if remainder * 2 >= denominator {
        quotient + 1
    } else {
        quotient
    }
}

fn short_month(month: &str) -> String {
    let month_number: i64 = month
        .split('-')
        .nth(1)
        .and_then(|part| part.parse().ok())
        .unwrap_or(1);
    MONTH_NAMES
        .get(((month_number - 1).rem_euclid(12)) as usize)
        .copied()
        .unwrap_or("Jan")
        .to_string()
}

fn party_summary(ctx: &Ctx<'_>) -> AppResult<Value> {
    let company_id = ctx.company_id()?;
    let db = ctx.db();
    let rows = repo::party_balances(db, company_id)?;

    let customers: Vec<&repo::PartyBalanceRow> = rows.iter().filter(|party| party.is_customer).collect();
    let suppliers: Vec<&repo::PartyBalanceRow> = rows.iter().filter(|party| party.is_supplier).collect();

    let receivable_minor: i64 = customers.iter().map(|party| party.balance_minor.max(0)).sum();
    let payable_minor: i64 = suppliers
        .iter()
        .map(|party| party.balance_minor.saturating_neg().max(0))
        .sum();
    let over_limit_count = customers
        .iter()
        .filter(|party| party.credit_limit_minor > 0 && party.balance_minor > party.credit_limit_minor)
        .count();

    let mut top_receivables: Vec<&repo::PartyBalanceRow> = customers
        .iter()
        .copied()
        .filter(|party| party.balance_minor > 0)
        .collect();
    top_receivables.sort_by(|a, b| b.balance_minor.cmp(&a.balance_minor));
    top_receivables.truncate(6);
    let top_receivables: Vec<Value> = top_receivables
        .into_iter()
        .map(|party| {
            json!({
                "id": party.id,
                "name": party.name,
                "balanceMinor": party.balance_minor,
                "isCustomer": true,
                "isSupplier": party.is_supplier
            })
        })
        .collect();

    let mut top_payables: Vec<&repo::PartyBalanceRow> = suppliers
        .iter()
        .copied()
        .filter(|party| party.balance_minor < 0)
        .collect();
    top_payables.sort_by(|a, b| a.balance_minor.cmp(&b.balance_minor));
    top_payables.truncate(6);
    let top_payables: Vec<Value> = top_payables
        .into_iter()
        .map(|party| {
            json!({
                "id": party.id,
                "name": party.name,
                "balanceMinor": party.balance_minor.saturating_neg(),
                "isCustomer": party.is_customer,
                "isSupplier": true
            })
        })
        .collect();

    let today = today_iso();
    let mut receivable_buckets = [0i64; 5];
    let mut payable_buckets = [0i64; 5];
    let mut overdue_receivable_minor = 0i64;
    let mut overdue_payable_minor = 0i64;

    for bill in repo::open_bills(db, company_id)? {
        if bill.open_minor == 0 {
            continue;
        }
        let index = bucket_index(bill.due_date.as_deref(), &today);
        let is_sales = bill.voucher_type == "SALES";
        if is_sales {
            receivable_buckets[index] += bill.open_minor;
        } else {
            payable_buckets[index] += bill.open_minor;
        }

        if let Some(due_date) = bill.due_date.as_deref() {
            if due_date < today.as_str() {
                if is_sales {
                    overdue_receivable_minor += bill.open_minor;
                } else {
                    overdue_payable_minor += bill.open_minor;
                }
            }
        }
    }

    let ageing: Vec<Value> = AGEING_BUCKETS
        .iter()
        .enumerate()
        .map(|(index, bucket)| {
            json!({
                "bucket": bucket,
                "receivableMinor": receivable_buckets[index],
                "payableMinor": payable_buckets[index]
            })
        })
        .collect();

    Ok(json!({
        "customerCount": customers.len(),
        "supplierCount": suppliers.len(),
        "receivableMinor": receivable_minor,
        "payableMinor": payable_minor,
        "overdueReceivableMinor": overdue_receivable_minor,
        "overduePayableMinor": overdue_payable_minor,
        "overLimitCount": over_limit_count,
        "topReceivables": top_receivables,
        "topPayables": top_payables,
        "ageing": ageing
    }))
}

fn item_summary(ctx: &Ctx<'_>) -> AppResult<Value> {
    let company_id = ctx.company_id()?;
    let db = ctx.db();
    let items = repo::active_items(db, company_id)?;
    let stock: HashMap<i64, (i64, i64)> = repo::stock_summary(db, company_id)?
        .into_iter()
        .map(|(id, qty, value)| (id, (qty, value)))
        .collect();

    let mut inventory_value_minor = 0i64;
    let mut low_stock_count = 0i64;
    let mut out_of_stock_count = 0i64;
    let mut top_items: Vec<(i64, String, i64, i64)> = Vec::new();

    for item in &items {
        if item.is_service {
            continue;
        }
        let (qty, value) = stock.get(&item.id).copied().unwrap_or((item.stock_qty_e4, 0));
        inventory_value_minor += value;
        top_items.push((item.id, item.name.clone(), value, qty));

        if qty <= 0 {
            out_of_stock_count += 1;
        } else if item.reorder_level_e4 > 0 && qty <= item.reorder_level_e4 {
            low_stock_count += 1;
        }
    }

    top_items.sort_by(|a, b| b.2.cmp(&a.2));
    top_items.truncate(8);
    let top_items: Vec<Value> = top_items
        .into_iter()
        .map(|(id, name, value, qty)| {
            json!({
                "id": id,
                "name": name,
                "valueMinor": value,
                "qtyE4": qty
            })
        })
        .collect();

    Ok(json!({
        "itemCount": items.len(),
        "serviceCount": items.iter().filter(|item| item.is_service).count(),
        "inventoryValueMinor": inventory_value_minor,
        "lowStockCount": low_stock_count,
        "outOfStockCount": out_of_stock_count,
        "topItems": top_items
    }))
}

fn voucher_summary(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    let company_id = ctx.company_id()?;
    let db = ctx.db();

    let voucher_type = opt_str(input, "type");
    if let Some(value) = voucher_type.as_deref() {
        if !VOUCHER_TYPES.contains(&value) {
            return Err(AppError::validation("type: invalid voucher type"));
        }
    }
    let from = req_str(input, "from")?;
    if from.chars().count() > 10 {
        return Err(AppError::validation("from: must be at most 10 characters"));
    }
    let to = req_str(input, "to")?;
    if to.chars().count() > 10 {
        return Err(AppError::validation("to: must be at most 10 characters"));
    }

    let (count, total_minor) = repo::voucher_aggregate(db, company_id, voucher_type.as_deref(), &from, &to)?;
    let average_minor = if count > 0 {
        round_div(total_minor, count)
    } else {
        0
    };

    let monthly: Vec<Value> = repo::voucher_monthly(db, company_id, voucher_type.as_deref(), &from, &to)?
        .into_iter()
        .map(|row| {
            json!({
                "month": row.month,
                "label": short_month(&row.month),
                "totalMinor": row.total_minor
            })
        })
        .collect();

    let top_parties: Vec<Value> =
        repo::voucher_top_parties(db, company_id, voucher_type.as_deref(), &from, &to)?
            .into_iter()
            .map(|party| {
                json!({
                    "id": party.id,
                    "name": party.name,
                    "totalMinor": party.total_minor
                })
            })
            .collect();

    let outstanding_minor = match voucher_type.as_deref() {
        Some(value) if value == "SALES" || value == "PURCHASE" => {
            repo::outstanding_total(db, company_id, value)?
        }
        _ => 0,
    };

    Ok(json!({
        "count": count,
        "totalMinor": total_minor,
        "averageMinor": average_minor,
        "outstandingMinor": outstanding_minor,
        "monthly": monthly,
        "topParties": top_parties
    }))
}

pub fn dispatch(ctx: &mut Ctx<'_>, channel: &str, args: &[Value]) -> Option<AppResult<Value>> {
    match channel {
        "parties:summary" => Some(party_summary(ctx)),
        "items:summary" => Some(item_summary(ctx)),
        "vouchers:summary" => Some(voucher_summary(ctx, arg(args, 0))),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rounding_matches_math_round() {
        assert_eq!(round_div(10, 4), 3);
        assert_eq!(round_div(9, 4), 2);
        assert_eq!(round_div(0, 5), 0);
        assert_eq!(round_div(-1, 2), 0);
        assert_eq!(round_div(-3, 2), -1);
        assert_eq!(round_div(5, 0), 0);
    }

    #[test]
    fn labels_and_buckets() {
        assert_eq!(short_month("2026-10"), "Oct");
        assert_eq!(short_month("2026-01"), "Jan");
        assert_eq!(bucket_index(Some("2026-09-29"), "2026-10-29"), 1);
        assert_eq!(bucket_index(None, "2026-10-29"), 0);
    }
}
