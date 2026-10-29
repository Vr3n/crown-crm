//! Reports: trial balance, P&L, balance sheet, receivables, payables, ageing,
//! statement, registers and stock.
//!
//! Mirrors `src/main/application/reports.ts`. Every report is a read over
//! posted rows; nothing is stored and nothing is written here.

mod repo;

use std::collections::HashMap;

use serde_json::{json, Value};

use crate::db::permissions::codes as perm;
use crate::error::{AppError, AppResult};
use crate::json::{arg, opt_str, req_i64, req_str};
use crate::state::Ctx;

fn is_date_iso(value: &str) -> bool {
    let chars: Vec<char> = value.chars().collect();
    chars.len() == 10
        && chars[4] == '-'
        && chars[7] == '-'
        && chars
            .iter()
            .enumerate()
            .all(|(index, ch)| index == 4 || index == 7 || ch.is_ascii_digit())
}

/// `rangeSchema` from `src/main/ipc/reports.ts`.
fn date_range(input: &Value) -> AppResult<(String, String)> {
    let from = req_str(input, "from")?;
    if !is_date_iso(&from) {
        return Err(AppError::validation("from: must be YYYY-MM-DD"));
    }
    let to = req_str(input, "to")?;
    if !is_date_iso(&to) {
        return Err(AppError::validation("to: must be YYYY-MM-DD"));
    }
    Ok((from, to))
}

/// `asOfSchema`: asOf plus a basis that defaults to DUE_DATE.
fn as_of_input(input: &Value) -> AppResult<(String, String)> {
    let as_of = req_str(input, "asOf")?;
    if !is_date_iso(&as_of) {
        return Err(AppError::validation("asOf: must be YYYY-MM-DD"));
    }
    let basis = opt_str(input, "basis").unwrap_or_else(|| "DUE_DATE".to_string());
    if !matches!(basis.as_str(), "BILL_DATE" | "DUE_DATE") {
        return Err(AppError::validation("basis: must be BILL_DATE or DUE_DATE"));
    }
    Ok((as_of, basis))
}

fn positive_id(input: &Value, key: &str) -> AppResult<i64> {
    let id = req_i64(input, key)?;
    if id <= 0 {
        return Err(AppError::validation(format!("{key}: must be a positive integer")));
    }
    Ok(id)
}

fn trial_balance_rows(ctx: &Ctx<'_>) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_VIEW)?;
    let company_id = ctx.company_id()?;
    let rows = repo::trial_balance(ctx.db(), company_id)?;
    Ok(json!(rows
        .iter()
        .map(|row| row.to_json(row.debit_minor, row.credit_minor))
        .collect::<Vec<_>>()))
}

/// Shared by profit & loss and the balance sheet, so the balance sheet's
/// nested `this.profitLoss(...)` call re-checks the permission exactly once
/// more, the way the TypeScript does.
fn profit_loss_report(ctx: &Ctx<'_>, from: &str, to: &str) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_VIEW)?;
    let company_id = ctx.company_id()?;
    let rows = repo::period_balances(ctx.db(), company_id, from, to)?;

    let mut income: Vec<Value> = Vec::new();
    let mut expenses: Vec<Value> = Vec::new();
    let mut total_income_minor: i64 = 0;
    let mut total_expense_minor: i64 = 0;

    for row in rows.iter().filter(|row| row.account_type == "INCOME") {
        let credit = row.credit_minor - row.debit_minor;
        if credit != 0 {
            total_income_minor += credit;
            income.push(row.to_json(0, credit));
        }
    }
    for row in rows.iter().filter(|row| row.account_type == "EXPENSE") {
        let debit = row.debit_minor - row.credit_minor;
        if debit != 0 {
            total_expense_minor += debit;
            expenses.push(row.to_json(debit, 0));
        }
    }

    Ok(json!({
        "income": income,
        "expenses": expenses,
        "totalIncomeMinor": total_income_minor,
        "totalExpenseMinor": total_expense_minor,
        "netProfitMinor": total_income_minor - total_expense_minor
    }))
}

fn balance_sheet_report(ctx: &Ctx<'_>, from: &str, to: &str) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_VIEW)?;
    let company_id = ctx.company_id()?;
    let rows = repo::period_balances(ctx.db(), company_id, from, to)?;

    let mut assets: Vec<Value> = Vec::new();
    let mut liabilities: Vec<Value> = Vec::new();
    let mut equity: Vec<Value> = Vec::new();
    let mut total_assets_minor: i64 = 0;
    let mut total_liabilities_minor: i64 = 0;
    let mut total_equity_minor: i64 = 0;

    for row in rows.iter().filter(|row| row.account_type == "ASSET") {
        let debit = row.debit_minor - row.credit_minor;
        if debit != 0 {
            total_assets_minor += debit;
            assets.push(row.to_json(debit, 0));
        }
    }
    for row in rows.iter().filter(|row| row.account_type == "LIABILITY") {
        let credit = row.credit_minor - row.debit_minor;
        if credit != 0 {
            total_liabilities_minor += credit;
            liabilities.push(row.to_json(0, credit));
        }
    }
    for row in rows.iter().filter(|row| row.account_type == "EQUITY") {
        let credit = row.credit_minor - row.debit_minor;
        if credit != 0 {
            total_equity_minor += credit;
            equity.push(row.to_json(0, credit));
        }
    }

    let profit = profit_loss_report(ctx, from, to)?;
    let profit_minor = profit
        .get("netProfitMinor")
        .and_then(|value| value.as_i64())
        .unwrap_or(0);
    total_equity_minor += profit_minor;

    Ok(json!({
        "assets": assets,
        "liabilities": liabilities,
        "equity": equity,
        "totalAssetsMinor": total_assets_minor,
        "totalLiabilitiesMinor": total_liabilities_minor,
        "totalEquityMinor": total_equity_minor,
        "differenceMinor": total_assets_minor - (total_liabilities_minor + total_equity_minor)
    }))
}

/// Groups open bills into `ReceivableRow`s, sorted by total descending. Ties
/// keep the bill order (voucher date, then id), like the stable `Array.sort`.
fn group_bills(bills: &[repo::OpenBill]) -> Vec<Value> {
    let mut order: Vec<i64> = Vec::new();
    let mut rows: HashMap<i64, (String, i64, i64, i64)> = HashMap::new();

    for bill in bills {
        if !rows.contains_key(&bill.party_id) {
            order.push(bill.party_id);
            rows.insert(bill.party_id, (bill.party_name.clone(), 0, 0, 0));
        }
        if let Some(row) = rows.get_mut(&bill.party_id) {
            if bill.days_overdue > 0 {
                row.2 += bill.outstanding_minor;
            } else {
                row.1 += bill.outstanding_minor;
            }
            row.3 += bill.outstanding_minor;
        }
    }

    let mut out: Vec<(i64, String, i64, i64, i64)> = order
        .into_iter()
        .filter_map(|party_id| {
            rows.get(&party_id)
                .map(|row| (party_id, row.0.clone(), row.1, row.2, row.3))
        })
        .collect();
    out.sort_by(|a, b| b.4.cmp(&a.4));

    out.into_iter()
        .map(|(party_id, party_name, not_due, overdue, total)| {
            json!({
                "partyId": party_id,
                "partyName": party_name,
                "notDueMinor": not_due,
                "overdueMinor": overdue,
                "totalMinor": total
            })
        })
        .collect()
}

/// `splitBucket` in `application/reports.ts`: bucket by days overdue.
fn split_bucket(days: i64) -> usize {
    if days <= 30 {
        0
    } else if days <= 60 {
        1
    } else if days <= 90 {
        2
    } else if days <= 180 {
        3
    } else {
        4
    }
}

fn ageing_rows(bills: &[repo::OpenBill]) -> Vec<Value> {
    let mut order: Vec<i64> = Vec::new();
    let mut rows: HashMap<i64, (String, [i64; 5], i64)> = HashMap::new();

    for bill in bills {
        let entry = rows.entry(bill.party_id).or_insert_with(|| {
            order.push(bill.party_id);
            (bill.party_name.clone(), [0, 0, 0, 0, 0], 0)
        });
        entry.1[split_bucket(bill.days_overdue)] += bill.outstanding_minor;
        entry.2 += bill.outstanding_minor;
    }

    let mut out: Vec<(i64, String, [i64; 5], i64)> = order
        .into_iter()
        .filter_map(|party_id| {
            rows.get(&party_id)
                .map(|row| (party_id, row.0.clone(), row.1, row.2))
        })
        .collect();
    out.sort_by(|a, b| b.3.cmp(&a.3));

    out.into_iter()
        .map(|(party_id, party_name, buckets, total)| {
            json!({
                "partyId": party_id,
                "partyName": party_name,
                "bucketsMinor": buckets,
                "totalMinor": total
            })
        })
        .collect()
}

fn receivables_report(ctx: &Ctx<'_>, as_of: &str, basis: &str) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_VIEW)?;
    let company_id = ctx.company_id()?;
    let bills = repo::outstanding_bills(ctx.db(), company_id, as_of, basis, "RECEIVABLE")?;
    Ok(json!(group_bills(&bills)))
}

fn payables_report(ctx: &Ctx<'_>, as_of: &str) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_VIEW)?;
    let company_id = ctx.company_id()?;
    let bills = repo::outstanding_bills(ctx.db(), company_id, as_of, "DUE_DATE", "PAYABLE")?;
    Ok(json!(group_bills(&bills)))
}

fn ageing_report(ctx: &Ctx<'_>, as_of: &str, basis: &str) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_VIEW)?;
    let company_id = ctx.company_id()?;
    let bills = repo::outstanding_bills(ctx.db(), company_id, as_of, basis, "RECEIVABLE")?;
    Ok(json!(ageing_rows(&bills)))
}

fn statement_report(ctx: &Ctx<'_>, party_id: i64, from: &str, to: &str) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_VIEW)?;
    let company_id = ctx.company_id()?;
    let mut balance = repo::party_opening(ctx.db(), company_id, party_id, from)?;
    let rows = repo::party_statement(ctx.db(), company_id, party_id, from, to)?;

    let out: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            balance += row.debit_minor - row.credit_minor;
            json!({
                "date": row.date,
                "type": row.voucher_type,
                "number": row.number,
                "narration": row.narration,
                "debitMinor": row.debit_minor,
                "creditMinor": row.credit_minor,
                "balanceMinor": balance
            })
        })
        .collect();
    Ok(json!(out))
}

fn register_report(ctx: &Ctx<'_>, voucher_type: &str, from: &str, to: &str) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_VIEW)?;
    let company_id = ctx.company_id()?;
    let rows = repo::register(ctx.db(), company_id, voucher_type, from, to)?;
    Ok(json!(rows.iter().map(|row| row.to_json()).collect::<Vec<_>>()))
}

fn stock_report(ctx: &Ctx<'_>) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_VIEW)?;
    let company_id = ctx.company_id()?;
    let rows = repo::stock_summary(ctx.db(), company_id)?;
    Ok(json!(rows.iter().map(|row| row.to_json()).collect::<Vec<_>>()))
}

fn stock_movements_report(ctx: &Ctx<'_>, item_id: i64, from: &str, to: &str) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_VIEW)?;
    let company_id = ctx.company_id()?;
    let rows = repo::stock_movements(ctx.db(), company_id, item_id, from, to)?;
    Ok(json!(rows.iter().map(|row| row.to_json()).collect::<Vec<_>>()))
}

fn channel_profit_loss(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    let (from, to) = date_range(input)?;
    profit_loss_report(ctx, &from, &to)
}

fn channel_balance_sheet(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    let (from, to) = date_range(input)?;
    balance_sheet_report(ctx, &from, &to)
}

fn channel_receivables(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    let (as_of, basis) = as_of_input(input)?;
    receivables_report(ctx, &as_of, &basis)
}

fn channel_payables(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    // Payables always age on the due date, whatever basis the caller sent.
    let (as_of, _basis) = as_of_input(input)?;
    payables_report(ctx, &as_of)
}

fn channel_ageing(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    let (as_of, basis) = as_of_input(input)?;
    ageing_report(ctx, &as_of, &basis)
}

fn channel_statement(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    let party_id = positive_id(input, "partyId")?;
    let (from, to) = date_range(input)?;
    statement_report(ctx, party_id, &from, &to)
}

fn channel_register(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    let voucher_type = req_str(input, "type")?;
    if !matches!(voucher_type.as_str(), "SALES" | "PURCHASE") {
        return Err(AppError::validation("type: must be SALES or PURCHASE"));
    }
    let (from, to) = date_range(input)?;
    register_report(ctx, &voucher_type, &from, &to)
}

fn channel_stock_movements(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    let item_id = positive_id(input, "itemId")?;
    let (from, to) = date_range(input)?;
    stock_movements_report(ctx, item_id, &from, &to)
}

pub fn dispatch(ctx: &mut Ctx<'_>, channel: &str, args: &[Value]) -> Option<AppResult<Value>> {
    let input = arg(args, 0);
    match channel {
        "reports:trialBalance" => Some(trial_balance_rows(ctx)),
        "reports:profitLoss" => Some(channel_profit_loss(ctx, input)),
        "reports:balanceSheet" => Some(channel_balance_sheet(ctx, input)),
        "reports:receivables" => Some(channel_receivables(ctx, input)),
        "reports:payables" => Some(channel_payables(ctx, input)),
        "reports:ageing" => Some(channel_ageing(ctx, input)),
        "reports:statement" => Some(channel_statement(ctx, input)),
        "reports:register" => Some(channel_register(ctx, input)),
        "reports:stock" => Some(stock_report(ctx)),
        "reports:stock-movements" => Some(channel_stock_movements(ctx, input)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buckets_by_days_overdue() {
        assert_eq!(split_bucket(0), 0);
        assert_eq!(split_bucket(30), 0);
        assert_eq!(split_bucket(31), 1);
        assert_eq!(split_bucket(60), 1);
        assert_eq!(split_bucket(61), 2);
        assert_eq!(split_bucket(90), 2);
        assert_eq!(split_bucket(91), 3);
        assert_eq!(split_bucket(180), 3);
        assert_eq!(split_bucket(181), 4);
    }

    #[test]
    fn date_range_requires_iso_dates() {
        assert!(date_range(&json!({ "from": "2026-04-01", "to": "2027-03-31" })).is_ok());
        assert!(date_range(&json!({ "from": "01-04-2026", "to": "2027-03-31" })).is_err());
        assert!(date_range(&json!({ "to": "2027-03-31" })).is_err());
    }

    #[test]
    fn as_of_basis_defaults_to_due_date() {
        let defaulted = as_of_input(&json!({ "asOf": "2026-10-29" }));
        assert!(matches!(defaulted, Ok((_, ref basis)) if basis.as_str() == "DUE_DATE"));
        assert!(as_of_input(&json!({ "asOf": "2026-10-29", "basis": "BILL_DATE" })).is_ok());
        assert!(as_of_input(&json!({ "asOf": "2026-10-29", "basis": "OTHER" })).is_err());
    }

    #[test]
    fn bill_rows_group_and_sort_by_total() {
        let bills = vec![
            repo::OpenBill {
                party_id: 1,
                party_name: "A".to_string(),
                outstanding_minor: 500,
                days_overdue: 0,
            },
            repo::OpenBill {
                party_id: 2,
                party_name: "B".to_string(),
                outstanding_minor: 900,
                days_overdue: 10,
            },
            repo::OpenBill {
                party_id: 1,
                party_name: "A".to_string(),
                outstanding_minor: 700,
                days_overdue: 5,
            },
        ];
        let rows = group_bills(&bills);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["partyId"], 1);
        assert_eq!(rows[0]["notDueMinor"], 500);
        assert_eq!(rows[0]["overdueMinor"], 700);
        assert_eq!(rows[0]["totalMinor"], 1200);
        assert_eq!(rows[1]["partyId"], 2);
    }

    #[test]
    fn ageing_rows_bucket_each_bill() {
        let bills = vec![repo::OpenBill {
            party_id: 7,
            party_name: "Seven".to_string(),
            outstanding_minor: 1200,
            days_overdue: 95,
        }];
        let rows = ageing_rows(&bills);
        assert_eq!(rows[0]["bucketsMinor"], json!([0, 0, 0, 1200, 0]));
        assert_eq!(rows[0]["totalMinor"], 1200);
    }
}
