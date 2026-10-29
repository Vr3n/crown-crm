//! Dashboard summary.
//!
//! Mirrors `src/main/repositories/dashboard.ts` and `src/main/ipc/dashboard.ts`.
//! Every figure is a query over rows; nothing is stored. The Electron handler
//! checks no permission beyond an authenticated session, so neither does this.

mod repo;

use chrono::{Duration, NaiveDate};
use serde_json::{json, Value};

use crate::error::AppResult;
use crate::state::{today_iso, Ctx};

const AGEING_BUCKETS: [&str; 5] = ["Not due", "1-30", "31-60", "61-90", "90+"];
const MONTH_NAMES: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

fn parse_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

/// Whole days from `from` to `to`, like the TS `daysBetween`.
fn days_between(from: &str, to: &str) -> i64 {
    match (parse_date(from), parse_date(to)) {
        (Some(start), Some(end)) => (end - start).num_days(),
        _ => 0,
    }
}

fn add_days(iso: &str, days: i64) -> String {
    match parse_date(iso) {
        Some(date) => (date + Duration::days(days)).format("%Y-%m-%d").to_string(),
        None => iso.to_string(),
    }
}

/// Index into `AGEING_BUCKETS` for a bill due on `due_date`.
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

/// Last `count` months ending with the month of `from`, oldest first.
fn last_months(count: i64, from: &str) -> Vec<String> {
    let mut parts = from.split('-');
    let year: i64 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(1970);
    let month: i64 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(1);

    let mut months = Vec::new();
    for index in (0..count).rev() {
        let total = year * 12 + (month - 1) - index;
        let month_year = total.div_euclid(12);
        let month_number = total.rem_euclid(12) + 1;
        months.push(format!("{month_year}-{month_number:02}"));
    }
    months
}

/// `toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })`.
fn month_label(month: &str) -> String {
    let mut parts = month.split('-');
    let year: i64 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(1970);
    let month_number: i64 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(1);
    let name = MONTH_NAMES
        .get(((month_number - 1).rem_euclid(12)) as usize)
        .copied()
        .unwrap_or("Jan");
    format!("{name} {:02}", year.rem_euclid(100))
}

fn summary(ctx: &Ctx<'_>) -> AppResult<Value> {
    let company_id = ctx.company_id()?;
    let db = ctx.db();
    let today = today_iso();

    let party_count = repo::count_parties(db, company_id)?;
    let item_count = repo::count_items(db, company_id)?;
    let purchase_count = repo::posted_count(db, company_id, "PURCHASE")?;
    let sales_count = repo::posted_count(db, company_id, "SALES")?;
    let opening_count = repo::posted_count(db, company_id, "OPENING")?;
    let (numbering_setup_at, _onboarding_completed_at) = repo::setup_flags(db, company_id)?;
    let numbering_done = numbering_setup_at.map(|value| !value.is_empty()).unwrap_or(false);

    let steps = vec![
        json!({
            "id": "numbering",
            "label": "Number your vouchers",
            "detail": "Series and starting numbers are set.",
            "href": "/settings/numbering",
            "cta": "Open numbering",
            "done": numbering_done
        }),
        json!({
            "id": "parties",
            "label": "Add parties",
            "detail": "Customers, suppliers and their credit terms.",
            "href": "/parties?action=new",
            "cta": "Add a party",
            "done": party_count > 0
        }),
        json!({
            "id": "items",
            "label": "Add items",
            "detail": "HSN, unit, GST rate and selling price.",
            "href": "/items?action=new",
            "cta": "Add an item",
            "done": item_count > 0
        }),
        json!({
            "id": "opening",
            "label": "Post opening balances",
            "detail": "What the books carried in on day one.",
            "href": "/settings/company?action=opening",
            "cta": "Post opening",
            "done": opening_count > 0
        }),
        json!({
            "id": "purchase",
            "label": "Post a purchase bill",
            "detail": "Stock in, ledger written, payable recorded.",
            "href": "/purchases/new",
            "cta": "New bill",
            "done": purchase_count > 0
        }),
        json!({
            "id": "sale",
            "label": "Post a sales invoice",
            "detail": "Stock out, GST recorded, receivable created.",
            "href": "/sales/new",
            "cta": "New invoice",
            "done": sales_count > 0
        }),
    ];
    let done_steps = steps
        .iter()
        .filter(|step| {
            step.get("done")
                .and_then(|value| value.as_bool())
                .unwrap_or(false)
        })
        .count();

    let open_bills = repo::open_bills(db, company_id)?;
    let mut receivable_buckets = [0i64; 5];
    let mut payable_buckets = [0i64; 5];

    let soon = add_days(&today, 7);
    let mut overdue_count: i64 = 0;
    let mut due_soon_count: i64 = 0;

    for bill in &open_bills {
        if bill.open_minor == 0 {
            continue;
        }
        let index = bucket_index(bill.due_date.as_deref(), &today);
        if bill.voucher_type == "SALES" {
            receivable_buckets[index] += bill.open_minor;
        } else {
            payable_buckets[index] += bill.open_minor;
        }

        if let Some(due_date) = bill.due_date.as_deref() {
            if due_date < today.as_str() {
                overdue_count += 1;
            }
            if bill.voucher_type == "PURCHASE" && due_date >= today.as_str() && due_date <= soon.as_str() {
                due_soon_count += 1;
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

    let mut attention: Vec<Value> = Vec::new();
    if overdue_count > 0 {
        attention.push(json!({
            "id": "overdue",
            "tone": "destructive",
            "title": format!(
                "{overdue_count} invoice{} overdue",
                if overdue_count == 1 { "" } else { "s" }
            ),
            "detail": "Follow up on the oldest receivables first.",
            "href": "/reports/receivables"
        }));
    }
    if due_soon_count > 0 {
        attention.push(json!({
            "id": "due-soon",
            "tone": "warning",
            "title": format!(
                "{due_soon_count} supplier bill{} due this week",
                if due_soon_count == 1 { "" } else { "s" }
            ),
            "detail": "Check the cash position before paying.",
            "href": "/reports/payables"
        }));
    }
    if attention.is_empty() {
        attention.push(json!({
            "id": "clear",
            "tone": "info",
            "title": "Nothing overdue",
            "detail": "Every open bill is still inside its credit period.",
            "href": "/reports/ageing"
        }));
    }

    let recent_vouchers: Vec<Value> = repo::recent_vouchers(db, company_id)?
        .into_iter()
        .map(|voucher| {
            json!({
                "id": voucher.id,
                "type": voucher.voucher_type,
                "number": voucher.number,
                "date": voucher.date,
                "partyName": voucher.party_name,
                "totalMinor": voucher.total_minor
            })
        })
        .collect();

    // Six months ending with the current one, then filled from the grouped query.
    let mut monthly: Vec<(String, String, i64, i64)> = last_months(6, &today)
        .into_iter()
        .map(|month| {
            let label = month_label(&month);
            (month, label, 0, 0)
        })
        .collect();
    for row in repo::monthly_totals(db, company_id)? {
        let Some(entry) = monthly.iter_mut().find(|entry| entry.0 == row.month) else {
            continue;
        };
        match row.voucher_type.as_str() {
            "SALES" => entry.2 = row.amount,
            "PURCHASE" => entry.3 = row.amount,
            _ => {}
        }
    }
    let monthly: Vec<Value> = monthly
        .into_iter()
        .map(|(month, label, sales, purchases)| {
            json!({
                "month": month,
                "label": label,
                "salesMinor": sales,
                "purchasesMinor": purchases
            })
        })
        .collect();

    Ok(json!({
        "partyCount": party_count,
        "itemCount": item_count,
        "voucherCount": repo::count_vouchers(db, company_id)?,
        "receivableMinor": repo::outstanding_total(db, company_id, "SALES")?,
        "payableMinor": repo::outstanding_total(db, company_id, "PURCHASE")?,
        "cashBankMinor": repo::cash_bank_total(db, company_id)?,
        "setup": {
            "done": done_steps,
            "total": steps.len(),
            "steps": steps
        },
        "attention": attention,
        "recentVouchers": recent_vouchers,
        "monthly": monthly,
        "ageing": ageing
    }))
}

pub fn dispatch(ctx: &mut Ctx<'_>, channel: &str, args: &[Value]) -> Option<AppResult<Value>> {
    let _ = args;
    match channel {
        "dashboard:summary" => Some(summary(ctx)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn last_months_rolls_over_the_year() {
        assert_eq!(
            last_months(3, "2026-01-15"),
            vec!["2025-11", "2025-12", "2026-01"]
        );
        assert_eq!(last_months(1, "2026-10-29"), vec!["2026-10"]);
    }

    #[test]
    fn month_labels_match_the_renderer() {
        assert_eq!(month_label("2026-10"), "Oct 26");
        assert_eq!(month_label("2005-01"), "Jan 05");
    }

    #[test]
    fn dues_bucket_against_today() {
        assert_eq!(bucket_index(None, "2026-10-29"), 0);
        assert_eq!(bucket_index(Some("2026-10-29"), "2026-10-29"), 0);
        assert_eq!(bucket_index(Some("2026-10-30"), "2026-10-29"), 0);
        assert_eq!(bucket_index(Some("2026-09-29"), "2026-10-29"), 1);
        assert_eq!(bucket_index(Some("2026-08-30"), "2026-10-29"), 2);
        assert_eq!(bucket_index(Some("2026-07-31"), "2026-10-29"), 3);
        assert_eq!(bucket_index(Some("2026-04-01"), "2026-10-29"), 4);
    }

    #[test]
    fn date_math_matches_javascript() {
        assert_eq!(days_between("2026-10-01", "2026-10-08"), 7);
        assert_eq!(days_between("2026-10-08", "2026-10-01"), -7);
        assert_eq!(add_days("2026-12-29", 7), "2027-01-05");
        assert_eq!(add_days("not-a-date", 7), "not-a-date");
    }
}
