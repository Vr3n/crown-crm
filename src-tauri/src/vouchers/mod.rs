//! Vouchers: posting, reading, listing, cancelling, outstanding bills, opening
//! balances and the printable invoice.
//!
//! Ports `src/main/application/vouchers.ts`, `src/main/application/invoice.ts`,
//! `src/main/repositories/vouchers.ts` and `src/main/repositories/invoice.ts`.
//! One posted voucher writes its header, lines, ledger, stock, allocations and
//! audit row in a single transaction; a failure rolls the number back too.
//!
//! Deliberate differences from the Electron build, all noted where they live:
//!
//! * `vouchers:list` filters `query`/`status` in SQL so paging does not hide
//!   matches; the TypeScript filtered only the fetched page.
//! * The allocation guard measures a bill's open balance from allocations
//!   *to* that bill (`to_voucher_id`, the same direction `outstanding` uses).
//!   The TypeScript summed `from_voucher_id`, which is always empty for a bill.
//! * A line's item and every ledger account are checked for company ownership
//!   and activity (`CROSS_COMPANY_REFERENCE`, `ACCOUNT_NOT_POSTABLE`), which
//!   `docs/03-voucher-posting-rules.md` requires but the repositories skipped.
//! * `round_off_mode = 'LINE'` behaves like `'NONE'`, matching the TypeScript
//!   engine (only `'INVOICE'` rounds). Per-line rounding would need a per-line
//!   round-off column and would disagree with the renderer's live preview.
//! * Cancelling only flips the status, exactly like the TypeScript. Ledger and
//!   stock effects disappear from every read because those queries join
//!   `vouchers` with `status = 'POSTED'`; no mirror rows are written.


mod invoice;
mod posting;
mod repo;
mod settlement;
mod stock;

use std::collections::HashMap;
use std::time::Instant;

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::audit;
use crate::logging;
use crate::db::permissions::codes as perm;
use crate::error::{codes, AppError, AppResult};
use crate::json::{
    arg, array, i64_or, opt_bool, opt_i64, opt_str, opt_trimmed, required_text, req_i64, req_str,
};
use crate::numbering;
use crate::state::Ctx;

use posting::{BuildInput, JournalLine, LedgerDraft, PostingAccounts, Totals};
use stock::StockMovement;

/// The channel the idempotency table records under.
const POST_CHANNEL: &str = "vouchers:post";

/// Every chart-of-accounts key the posting engine needs before it will post.
const REQUIRED_ACCOUNTS: [&str; 15] = [
    "SALES",
    "SALES_RETURNS",
    "PURCHASES",
    "PURCHASE_RETURNS",
    "OUTPUT_CGST",
    "OUTPUT_SGST",
    "OUTPUT_IGST",
    "INPUT_CGST",
    "INPUT_SGST",
    "INPUT_IGST",
    "ROUND_OFF",
    "COGS",
    "INVENTORY",
    "CASH",
    "BANK",
];

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

struct LineInput {
    item_id: Option<i64>,
    description: String,
    hsn: Option<String>,
    uom: Option<String>,
    qty_e4: i64,
    rate_minor: i64,
    rate_includes_tax: bool,
    discount_bps: i64,
    gst_rate_bps: i64,
    godown_id: Option<i64>,
}

struct JournalInput {
    account_id: i64,
    debit_minor: i64,
    credit_minor: i64,
    narration: Option<String>,
}

struct PostInput {
    request_id: String,
    voucher_type: String,
    date: String,
    due_date: Option<String>,
    party_id: Option<i64>,
    place_of_supply_state_code: Option<String>,
    narration: Option<String>,
    reference_no: Option<String>,
    /// The supplier's printed bill number. Purchase only.
    supplier_bill_no: Option<String>,
    /// Set when a purchase has no supplier bill and takes the internal `PUR` series.
    supplier_bill_missing: bool,
    manual_number: Option<i64>,
    lines: Vec<LineInput>,
    journal_lines: Vec<JournalInput>,
    allocations: Vec<settlement::AllocationInput>,
    amount_minor: Option<i64>,
    cash_account_id: Option<i64>,
    contra_from_account_id: Option<i64>,
    contra_to_account_id: Option<i64>,
    payment_method_id: Option<i64>,
    instrument_no: Option<String>,
    reversal_of_voucher_id: Option<i64>,
}

fn is_date_iso(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
}

fn positive_id(input: &Value, key: &str) -> AppResult<i64> {
    let id = req_i64(input, key)?;
    if id <= 0 {
        return Err(AppError::validation(format!("{key} must be a positive integer")));
    }
    Ok(id)
}

fn opt_positive(input: &Value, key: &str) -> AppResult<Option<i64>> {
    match opt_i64(input, key) {
        None => Ok(None),
        Some(value) if value <= 0 => {
            Err(AppError::validation(format!("{key} must be a positive integer")))
        }
        Some(value) => Ok(Some(value)),
    }
}

fn opt_date(input: &Value, key: &str) -> AppResult<Option<String>> {
    let Some(value) = opt_trimmed(input, key) else { return Ok(None) };
    if !is_date_iso(&value) {
        return Err(AppError::validation(format!("{key} must be YYYY-MM-DD")));
    }
    Ok(Some(value))
}

/// A purchase needs exactly one identity: the supplier's bill number or an
/// explicit "no supplier bill" declaration that falls back to `PUR`.
fn parse_supplier_bill(
    voucher_type: &str,
    number: Option<String>,
    missing: bool,
) -> AppResult<(Option<String>, bool)> {
    if voucher_type == "PURCHASE" {
        return match (number, missing) {
            (Some(value), false) => {
                if let Some(problem) = numbering::validate_supplier_bill_number(&value) {
                    return Err(AppError::validation(problem));
                }
                Ok((Some(value), false))
            }
            (None, true) => Ok((None, true)),
            (Some(_), true) => Err(AppError::validation(
                "Enter a supplier bill number or tick \"No supplier bill\", not both",
            )),
            (None, false) => Err(AppError::validation(
                "Enter the supplier bill number, or tick \"No supplier bill\"",
            )),
        };
    }

    if number.is_some() || missing {
        return Err(AppError::validation("A supplier bill number applies to purchase bills only"));
    }
    Ok((None, false))
}

impl LineInput {
    fn parse(line: &Value, index: usize) -> AppResult<Self> {
        let position = index + 1;
        let description = required_text(line, "description", "Description", 300)?;
        let hsn = crate::json::optional_text(line, "hsn", "HSN", 20)?;
        let uom = crate::json::optional_text(line, "uom", "Unit", 20)?;

        let qty_e4 = req_i64(line, "qtyE4")?;
        if qty_e4 <= 0 {
            return Err(AppError::new(
                codes::INVALID_LINE_VALUE,
                format!("Line {position}: quantity must be greater than zero"),
            ));
        }
        let rate_minor = i64_or(line, "rateMinor", 0);
        if rate_minor < 0 {
            return Err(AppError::new(
                codes::INVALID_LINE_VALUE,
                format!("Line {position}: rate cannot be negative"),
            ));
        }
        let discount_bps = i64_or(line, "discountBps", 0);
        if !(0..=10_000).contains(&discount_bps) {
            return Err(AppError::new(
                codes::INVALID_LINE_VALUE,
                format!("Line {position}: discount must be between 0 and 100%"),
            ));
        }
        let gst_rate_bps = i64_or(line, "gstRateBps", 0);
        if !(0..=5_000).contains(&gst_rate_bps) {
            return Err(AppError::new(
                codes::INVALID_LINE_VALUE,
                format!("Line {position}: GST rate must be between 0 and 50%"),
            ));
        }

        Ok(Self {
            item_id: opt_positive(line, "itemId")?,
            description,
            hsn,
            uom,
            qty_e4,
            rate_minor,
            rate_includes_tax: opt_bool(line, "rateIncludesTax").unwrap_or(false),
            discount_bps,
            gst_rate_bps,
            godown_id: opt_positive(line, "godownId")?,
        })
    }
}

impl JournalInput {
    fn parse(line: &Value, index: usize) -> AppResult<Self> {
        let position = index + 1;
        let account_id = positive_id(line, "accountId")?;
        let debit_minor = i64_or(line, "debitMinor", 0);
        let credit_minor = i64_or(line, "creditMinor", 0);
        if debit_minor < 0 || credit_minor < 0 {
            return Err(AppError::new(
                codes::INVALID_LINE_VALUE,
                format!("Line {position}: amounts cannot be negative"),
            ));
        }
        Ok(Self {
            account_id,
            debit_minor,
            credit_minor,
            narration: crate::json::optional_text(line, "narration", "Narration", 300)?,
        })
    }
}

impl settlement::AllocationInput {
    fn parse(row: &Value, index: usize) -> AppResult<Self> {
        let position = index + 1;
        let to_voucher_id = positive_id(row, "toVoucherId")?;
        let amount_minor = req_i64(row, "amountMinor")?;
        if amount_minor <= 0 {
            return Err(AppError::validation(format!(
                "Allocation {position}: amount must be greater than zero"
            )));
        }
        let allocation_type = opt_str(row, "type").unwrap_or_else(|| "AGAINST_REF".to_string());
        if !matches!(
            allocation_type.as_str(),
            "AGAINST_REF" | "ADVANCE" | "ON_ACCOUNT" | "OPENING"
        ) {
            return Err(AppError::validation(format!(
                "Allocation {position}: unknown allocation type"
            )));
        }
        Ok(Self { to_voucher_id, amount_minor, allocation_type })
    }
}

impl PostInput {
    fn parse(input: &Value) -> AppResult<Self> {
        let request_id = req_str(input, "requestId")?;
        if !(8..=80).contains(&request_id.chars().count()) {
            return Err(AppError::validation("requestId must be 8 to 80 characters"));
        }

        let voucher_type = req_str(input, "type")?;
        if !numbering::is_voucher_type(&voucher_type) {
            return Err(AppError::validation(format!("Unknown voucher type: {voucher_type}")));
        }

        let date = req_str(input, "date")?;
        if !is_date_iso(&date) {
            return Err(AppError::validation("date must be YYYY-MM-DD"));
        }

        let mut lines = Vec::new();
        for (index, line) in array(input, "lines").iter().enumerate() {
            lines.push(LineInput::parse(line, index)?);
        }

        let mut journal_lines = Vec::new();
        for (index, line) in array(input, "journalLines").iter().enumerate() {
            journal_lines.push(JournalInput::parse(line, index)?);
        }

        let mut allocations = Vec::new();
        for (index, row) in array(input, "allocations").iter().enumerate() {
            allocations.push(settlement::AllocationInput::parse(row, index)?);
        }

        let place_of_supply_state_code = opt_trimmed(input, "placeOfSupplyStateCode");
        if let Some(code) = &place_of_supply_state_code {
            if code.chars().count() > 2 {
                return Err(AppError::validation(
                    "placeOfSupplyStateCode must be 2 characters or fewer",
                ));
            }
        }

        let amount_minor = opt_i64(input, "amountMinor");
        if let Some(amount) = amount_minor {
            if amount < 0 {
                return Err(AppError::validation("amountMinor must be zero or greater"));
            }
        }

        let supplier_bill_no =
            crate::json::optional_text(input, "supplierBillNo", "Supplier bill number", 32)?;
        let supplier_bill_missing = opt_bool(input, "supplierBillMissing").unwrap_or(false);
        let (supplier_bill_no, supplier_bill_missing) =
            parse_supplier_bill(&voucher_type, supplier_bill_no, supplier_bill_missing)?;

        Ok(Self {
            request_id,
            voucher_type,
            date,
            due_date: opt_date(input, "dueDate")?,
            party_id: opt_positive(input, "partyId")?,
            place_of_supply_state_code,
            narration: crate::json::optional_text(input, "narration", "Narration", 1000)?,
            reference_no: crate::json::optional_text(input, "referenceNo", "Reference", 80)?,
            supplier_bill_no,
            supplier_bill_missing,
            manual_number: opt_positive(input, "manualNumber")?,
            lines,
            journal_lines,
            allocations,
            amount_minor,
            cash_account_id: opt_positive(input, "cashAccountId")?,
            contra_from_account_id: opt_positive(input, "contraFromAccountId")?,
            contra_to_account_id: opt_positive(input, "contraToAccountId")?,
            payment_method_id: opt_positive(input, "paymentMethodId")?,
            instrument_no: crate::json::optional_text(input, "instrumentNo", "Instrument", 80)?,
            reversal_of_voucher_id: opt_positive(input, "reversalOfVoucherId")?,
        })
    }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

pub fn dispatch(ctx: &mut Ctx<'_>, channel: &str, args: &[Value]) -> Option<AppResult<Value>> {
    match channel {
        "vouchers:post" => Some(post_voucher(ctx, arg(args, 0))),
        "vouchers:get" => Some(get_voucher(ctx, arg(args, 0))),
        "vouchers:list" => Some(list_vouchers(ctx, arg(args, 0))),
        "vouchers:cancel" => Some(cancel_voucher(ctx, arg(args, 0))),
        "vouchers:outstanding" => Some(outstanding_bills(ctx, arg(args, 0))),
        "vouchers:postOpening" => Some(post_opening_balances(ctx, arg(args, 0))),
        "vouchers:invoice" => Some(invoice_command(ctx, arg(args, 0))),
        _ => None,
    }
}

fn get_voucher(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::VOUCHER_VIEW)?;
    let company_id = ctx.company_id()?;
    let id = positive_id(input, "id")?;
    repo::find_detail(ctx.db(), company_id, id)?
        .ok_or_else(|| AppError::not_found("Voucher not found"))
}

fn list_vouchers(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::VOUCHER_VIEW)?;
    let company_id = ctx.company_id()?;

    let voucher_type = match opt_trimmed(input, "type") {
        Some(value) if numbering::is_voucher_type(&value) => Some(value),
        Some(value) => return Err(AppError::validation(format!("Unknown voucher type: {value}"))),
        None => None,
    };
    let status = match opt_trimmed(input, "status") {
        Some(value) if matches!(value.as_str(), "DRAFT" | "POSTED" | "CANCELLED") => Some(value),
        Some(value) => return Err(AppError::validation(format!("Unknown voucher status: {value}"))),
        None => None,
    };

    let limit = opt_i64(input, "limit").unwrap_or(100);
    if !(1..=500).contains(&limit) {
        return Err(AppError::validation("limit must be between 1 and 500"));
    }
    let offset = opt_i64(input, "offset").unwrap_or(0);
    if offset < 0 {
        return Err(AppError::validation("offset must be zero or greater"));
    }

    let from = opt_trimmed(input, "from");
    let to = opt_trimmed(input, "to");
    for (label, value) in [("from", &from), ("to", &to)] {
        if let Some(value) = value {
            if value.chars().count() > 10 {
                return Err(AppError::validation(format!("{label} must be 10 characters or fewer")));
            }
        }
    }

    Ok(Value::Array(repo::list(
        ctx.db(),
        company_id,
        &repo::ListQuery {
            voucher_type,
            from,
            to,
            party_id: opt_positive(input, "partyId")?,
            query: opt_trimmed(input, "query"),
            status,
            limit,
            offset,
        },
    )?))
}

fn outstanding_bills(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_VIEW)?;
    let company_id = ctx.company_id()?;

    let as_of = match opt_date(input, "asOf")? {
        Some(value) => value,
        None => crate::state::today_iso(),
    };
    let basis = opt_str(input, "basis").unwrap_or_else(|| "DUE_DATE".to_string());
    if !matches!(basis.as_str(), "DUE_DATE" | "BILL_DATE") {
        return Err(AppError::validation(format!("Unknown outstanding basis: {basis}")));
    }
    let kind = opt_str(input, "kind").unwrap_or_else(|| "RECEIVABLE".to_string());
    if !matches!(kind.as_str(), "RECEIVABLE" | "PAYABLE" | "ALL") {
        return Err(AppError::validation(format!("Unknown outstanding kind: {kind}")));
    }

    Ok(Value::Array(repo::outstanding(
        ctx.db(),
        company_id,
        &repo::OutstandingQuery {
            party_id: opt_positive(input, "partyId")?,
            as_of,
            basis,
            kind,
        },
    )?))
}

/// The printable sales invoice / purchase bill. Kept `pub` because the PDF
/// export module renders the same document.
pub fn invoice_document(conn: &Connection, company_id: i64, id: i64) -> AppResult<Value> {
    invoice::find_for_print(conn, company_id, id)?
        .ok_or_else(|| AppError::not_found("Sales or purchase voucher not found"))
}

fn invoice_command(ctx: &Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::VOUCHER_VIEW)?;
    let company_id = ctx.company_id()?;
    let id = positive_id(input, "id")?;
    invoice_document(ctx.db(), company_id, id)
}

fn cancel_voucher(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    let id = positive_id(input, "id")?;
    let reason = required_text(input, "reason", "Reason", 300)?;
    if reason.chars().count() < 3 {
        return Err(AppError::validation("Reason must be at least 3 characters"));
    }

    ctx.require_permission(perm::VOUCHER_CANCEL)?;
    let company_id = ctx.company_id()?;
    let user_id = ctx.user_id()?;

    ctx.with_tx(|ctx| {
        let conn = ctx.db();
        let status = repo::find_status(conn, company_id, id)?
            .ok_or_else(|| AppError::not_found("Voucher not found"))?;
        if status != "POSTED" {
            return Err(AppError::conflict("Only a posted voucher can be cancelled"));
        }
        if settlement::has_allocations(conn, company_id, id)? {
            return Err(AppError::conflict(
                "Reverse the allocations against this voucher before cancelling",
            ));
        }

        repo::cancel(conn, company_id, id, &reason, Some(user_id))?;
        audit::record(
            conn,
            company_id,
            "VOUCHER",
            id,
            "CANCEL",
            Some(&json!({ "status": "POSTED" })),
            Some(&json!({ "status": "CANCELLED", "reason": reason })),
            Some(user_id),
        )?;
        Ok(())
    })?;

    Ok(Value::Null)
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

fn post_voucher(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    let started = Instant::now();
    let trace_id = ctx.trace_id().map(str::to_string);
    let parsed = PostInput::parse(input)?;
    logging::info(
        "vouchers",
        "post.start",
        trace_id.as_deref(),
        json!({
            "requestId": parsed.request_id,
            "type": parsed.voucher_type,
            "date": parsed.date,
            "partyId": parsed.party_id,
            "lines": parsed.lines.len(),
            "supplierBillNo": parsed.supplier_bill_no,
            "referenceNo": parsed.reference_no,
        }),
    );

    let permission = if parsed.voucher_type == "RECEIPT" {
        perm::RECEIPT_RECORD
    } else {
        perm::VOUCHER_POST
    };
    ctx.require_permission(permission)?;
    let company_id = ctx.company_id()?;
    let user_id = ctx.user_id()?;
    let fingerprint = input.to_string();
    let result = ctx.with_tx(|ctx| post_in_tx(ctx, company_id, user_id, &parsed, &fingerprint));
    let duration_ms = started.elapsed().as_millis() as u64;
    match &result {
        Ok(value) => logging::info(
            "vouchers",
            "post.ok",
            trace_id.as_deref(),
            json!({
                "requestId": parsed.request_id,
                "id": value.get("id"),
                "number": value.get("number"),
                "durationMs": duration_ms,
            }),
        ),
        Err(err) => logging::error(
            "vouchers",
            "post.fail",
            trace_id.as_deref(),
            json!({ "requestId": parsed.request_id, "durationMs": duration_ms }),
            err.code,
            &err.message,
        ),
    }
    result
}

fn required_account(keys: &HashMap<String, i64>, name: &str) -> AppResult<i64> {
    keys.get(name).copied().ok_or_else(|| {
        AppError::new(codes::ACCOUNT_NOT_POSTABLE, format!("Chart of accounts is missing {name}"))
    })
}

fn post_in_tx(
    ctx: &mut Ctx<'_>,
    company_id: i64,
    user_id: i64,
    input: &PostInput,
    fingerprint: &str,
) -> AppResult<Value> {
    let conn = ctx.db();

    // Idempotency: a replay of the same payload returns the stored response, a
    // replay with a different payload is a conflict.
    if let Some((stored, response)) =
        repo::find_idempotency(conn, company_id, POST_CHANNEL, &input.request_id)?
    {
        if stored.as_deref() != Some(fingerprint) {
            return Err(AppError::new(
                codes::IDEMPOTENCY_CONFLICT,
                "This request was already processed",
            ));
        }
        if let Some(raw) = response {
            if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                return Ok(value);
            }
        }
        return Err(AppError::new(
            codes::IDEMPOTENCY_CONFLICT,
            "This request was already processed",
        ));
    }
    // Vouchers posted before the idempotency table existed still replay.
    if let Some(existing) = repo::find_by_idempotency_key(conn, company_id, &input.request_id)? {
        let number = repo::voucher_number(conn, company_id, existing)?.unwrap_or_default();
        return Ok(json!({ "id": existing, "number": number }));
    }

    let company = crate::identity::repo::find_company(conn, company_id)?
        .ok_or_else(|| AppError::not_found("Company not found"))?;

    let keys = repo::system_keys(conn, company_id)?;
    for key in REQUIRED_ACCOUNTS {
        if !keys.contains_key(key) {
            return Err(AppError::validation(format!("Chart of accounts is missing {key}")));
        }
    }

    let party = match input.party_id {
        Some(id) => match repo::find_party(conn, company_id, id)? {
            Some(party) => Some(party),
            None => {
                if repo::party_company(conn, id)?.is_some() {
                    return Err(AppError::new(
                        codes::CROSS_COMPANY_REFERENCE,
                        "Party belongs to another company",
                    ));
                }
                return Err(AppError::not_found("Party not found"));
            }
        },
        None => None,
    };
    let party_accounts = match &party {
        Some(party) => repo::party_accounts(conn, company_id, party.id)?,
        None => repo::PartyAccounts::default(),
    };

    let is_line_voucher = matches!(
        input.voucher_type.as_str(),
        "SALES" | "PURCHASE" | "CREDIT_NOTE" | "DEBIT_NOTE"
    );
    if is_line_voucher && party.is_none() {
        return Err(AppError::new(codes::PARTY_NOT_ALLOWED, "Select a party for this voucher"));
    }
    if is_line_voucher && input.lines.is_empty() {
        return Err(AppError::validation("Add at least one line"));
    }
    if matches!(input.voucher_type.as_str(), "RECEIPT" | "CREDIT_NOTE")
        && party_accounts.debtor.is_none()
    {
        return Err(AppError::new(codes::PARTY_NOT_ALLOWED, "This party is not a customer"));
    }
    if matches!(input.voucher_type.as_str(), "PAYMENT" | "DEBIT_NOTE")
        && party_accounts.creditor.is_none()
    {
        return Err(AppError::new(codes::PARTY_NOT_ALLOWED, "This party is not a supplier"));
    }

    let place_of_supply = input
        .place_of_supply_state_code
        .clone()
        .or_else(|| party.as_ref().and_then(|party| party.state_code.clone()))
        .unwrap_or_else(|| company.state_code.clone());
    let intra_state = posting::is_intra_state(&company.state_code, &place_of_supply);

    // Items are resolved once: the tax engine needs the cess rate and the stock
    // planner needs the service flag.
    let mut items: Vec<Option<repo::ItemRecord>> = Vec::with_capacity(input.lines.len());
    for line in &input.lines {
        let item = match line.item_id {
            Some(id) => match repo::find_item(conn, company_id, id)? {
                Some(item) => Some(item),
                None => {
                    if repo::item_company(conn, id)?.is_some() {
                        return Err(AppError::new(
                            codes::CROSS_COMPANY_REFERENCE,
                            "Item belongs to another company",
                        ));
                    }
                    return Err(AppError::not_found("Item not found"));
                }
            },
            None => None,
        };
        items.push(item);
    }

    // Cess only posts when the chart of accounts carries the matching account;
    // the seeded chart is GST-only, so this matches the TypeScript behaviour.
    let cess_enabled = match input.voucher_type.as_str() {
        "SALES" | "CREDIT_NOTE" => keys.contains_key("OUTPUT_CESS"),
        "PURCHASE" | "DEBIT_NOTE" => keys.contains_key("INPUT_CESS"),
        _ => false,
    };
    let cess_rate_at = |index: usize| -> i64 {
        if !cess_enabled {
            return 0;
        }
        items.get(index).and_then(|item| item.as_ref()).map(|item| item.cess_rate_bps).unwrap_or(0)
    };

    let mut computed: Vec<posting::LineTax> = Vec::new();
    let mut totals = Totals::default();
    if is_line_voucher {
        for (index, line) in input.lines.iter().enumerate() {
            computed.push(posting::compute_line_tax(
                &posting::LineTaxInput {
                    qty_e4: line.qty_e4,
                    rate_minor: line.rate_minor,
                    rate_includes_tax: line.rate_includes_tax,
                    discount_bps: line.discount_bps,
                    gst_rate_bps: line.gst_rate_bps,
                    cess_rate_bps: cess_rate_at(index),
                },
                intra_state,
            )?);
        }
        let total_qty_e4 = input.lines.iter().map(|line| line.qty_e4).sum();
        totals = posting::compute_invoice_totals(&computed, &company.round_off_mode, total_qty_e4)?;
        if totals.total_minor <= 0 {
            return Err(AppError::validation("Voucher total must be greater than zero"));
        }
    }

    let mut amount_minor = input.amount_minor.unwrap_or(0);
    if matches!(input.voucher_type.as_str(), "RECEIPT" | "PAYMENT" | "CONTRA")
        && amount_minor <= 0
    {
        return Err(AppError::validation("Enter an amount greater than zero"));
    }
    if input.voucher_type == "JOURNAL" {
        let debit: i64 = input.journal_lines.iter().map(|line| line.debit_minor).sum();
        let credit: i64 = input.journal_lines.iter().map(|line| line.credit_minor).sum();
        if debit != credit || debit == 0 {
            return Err(AppError::new(
                codes::VOUCHER_UNBALANCED,
                "Journal debits and credits must match",
            ));
        }
        amount_minor = debit;
    }

    // Stock and cost of goods sold.
    let mut stock_movements: Vec<StockMovement> = Vec::new();
    let mut goods_taxable = 0i64;
    let mut service_taxable = 0i64;
    let mut cogs_minor = 0i64;
    let default_godown = repo::default_godown(conn, company_id)?;

    if is_line_voucher {
        for (index, line) in input.lines.iter().enumerate() {
            let tax = computed.get(index).copied().unwrap_or_default();
            let Some(item) = items.get(index).and_then(|item| item.as_ref()) else {
                service_taxable = service_taxable.saturating_add(tax.taxable_minor);
                continue;
            };
            if item.is_service {
                service_taxable = service_taxable.saturating_add(tax.taxable_minor);
                continue;
            }

            goods_taxable = goods_taxable.saturating_add(tax.taxable_minor);
            let godown = line.godown_id.or(default_godown);
            let qty = line.qty_e4;

            match input.voucher_type.as_str() {
                "PURCHASE" => {
                    let unit_cost = stock::received_unit_cost(tax.taxable_minor, qty)?;
                    stock_movements.push(StockMovement {
                        item_id: item.id,
                        godown_id: godown,
                        qty_in_e4: qty,
                        qty_out_e4: 0,
                        unit_cost_minor: unit_cost,
                        movement_type: "PURCHASE".to_string(),
                    });
                }
                "CREDIT_NOTE" => {
                    let unit_cost = stock::issue_unit_cost(
                        conn,
                        company_id,
                        item.id,
                        &company.costing_method,
                        qty,
                        item.purchase_price_minor,
                    )?;
                    stock_movements.push(StockMovement {
                        item_id: item.id,
                        godown_id: godown,
                        qty_in_e4: qty,
                        qty_out_e4: 0,
                        unit_cost_minor: unit_cost,
                        movement_type: "RETURN_IN".to_string(),
                    });
                    cogs_minor = cogs_minor.saturating_sub(stock::movement_value(qty, unit_cost)?);
                }
                "SALES" => {
                    let unit_cost = stock::issue_unit_cost(
                        conn,
                        company_id,
                        item.id,
                        &company.costing_method,
                        qty,
                        item.purchase_price_minor,
                    )?;
                    stock_movements.push(StockMovement {
                        item_id: item.id,
                        godown_id: godown,
                        qty_in_e4: 0,
                        qty_out_e4: qty,
                        unit_cost_minor: unit_cost,
                        movement_type: "SALE".to_string(),
                    });
                    cogs_minor = cogs_minor.saturating_add(stock::movement_value(qty, unit_cost)?);
                }
                _ => {
                    // DEBIT_NOTE: goods go back to the supplier.
                    let unit_cost = stock::issue_unit_cost(
                        conn,
                        company_id,
                        item.id,
                        &company.costing_method,
                        qty,
                        item.purchase_price_minor,
                    )?;
                    stock_movements.push(StockMovement {
                        item_id: item.id,
                        godown_id: godown,
                        qty_in_e4: 0,
                        qty_out_e4: qty,
                        unit_cost_minor: unit_cost,
                        movement_type: "RETURN_OUT".to_string(),
                    });
                }
            }
        }
    }

    let accounts = PostingAccounts {
        sales: required_account(&keys, "SALES")?,
        sales_returns: required_account(&keys, "SALES_RETURNS")?,
        purchases: required_account(&keys, "PURCHASES")?,
        purchase_returns: required_account(&keys, "PURCHASE_RETURNS")?,
        output_cgst: required_account(&keys, "OUTPUT_CGST")?,
        output_sgst: required_account(&keys, "OUTPUT_SGST")?,
        output_igst: required_account(&keys, "OUTPUT_IGST")?,
        input_cgst: required_account(&keys, "INPUT_CGST")?,
        input_sgst: required_account(&keys, "INPUT_SGST")?,
        input_igst: required_account(&keys, "INPUT_IGST")?,
        round_off: required_account(&keys, "ROUND_OFF")?,
        cogs: required_account(&keys, "COGS")?,
        inventory: required_account(&keys, "INVENTORY")?,
        cash: required_account(&keys, "CASH")?,
        bank: required_account(&keys, "BANK")?,
        output_cess: keys.get("OUTPUT_CESS").copied(),
        input_cess: keys.get("INPUT_CESS").copied(),
        party_debtor: party_accounts.debtor,
        party_creditor: party_accounts.creditor,
    };

    let journal_lines: Vec<JournalLine> = input
        .journal_lines
        .iter()
        .map(|line| JournalLine {
            account_id: line.account_id,
            debit_minor: line.debit_minor,
            credit_minor: line.credit_minor,
            narration: line.narration.clone(),
        })
        .collect();

    let mut ledger = posting::build_ledger_lines(&BuildInput {
        voucher_type: &input.voucher_type,
        totals,
        accounts,
        party_id: party.as_ref().map(|party| party.id),
        cash_account_id: input.cash_account_id,
        goods_taxable_minor: goods_taxable,
        service_taxable_minor: service_taxable,
        journal_lines: &journal_lines,
        amount_minor,
        contra_from_account_id: input.contra_from_account_id,
        contra_to_account_id: input.contra_to_account_id,
    })?;

    if input.voucher_type == "SALES" && cogs_minor != 0 {
        ledger.push(LedgerDraft {
            account_id: accounts.cogs,
            party_id: None,
            debit_minor: cogs_minor,
            credit_minor: 0,
            narration: Some("Cost of goods sold".to_string()),
        });
        ledger.push(LedgerDraft {
            account_id: accounts.inventory,
            party_id: None,
            debit_minor: 0,
            credit_minor: cogs_minor,
            narration: Some("Stock issued".to_string()),
        });
    }
    if input.voucher_type == "CREDIT_NOTE" && cogs_minor != 0 {
        ledger.push(LedgerDraft {
            account_id: accounts.inventory,
            party_id: None,
            debit_minor: cogs_minor.saturating_neg(),
            credit_minor: 0,
            narration: Some("Stock returned".to_string()),
        });
        ledger.push(LedgerDraft {
            account_id: accounts.cogs,
            party_id: None,
            debit_minor: 0,
            credit_minor: cogs_minor.saturating_neg(),
            narration: Some("Cost reversed".to_string()),
        });
    }

    posting::assert_balanced(&ledger)?;

    // Accounts must belong to this company and still accept postings.
    for line in &ledger {
        let Some(account) = repo::find_account(conn, line.account_id)? else {
            return Err(AppError::not_found("Account not found"));
        };
        if account.company_id != company_id {
            return Err(AppError::new(
                codes::CROSS_COMPANY_REFERENCE,
                "Account belongs to another company",
            ));
        }
        if !account.is_active {
            return Err(AppError::new(codes::ACCOUNT_NOT_POSTABLE, "Account is inactive"));
        }
    }

    settlement::validate(
        conn,
        company_id,
        &input.voucher_type,
        party.as_ref().map(|party| party.id),
        amount_minor,
        &input.allocations,
    )?;

    let (number, fy, series, number_source, number_normalized) =
        if input.voucher_type == "PURCHASE" {
            match (&input.supplier_bill_no, input.supplier_bill_missing) {
                (Some(bill_no), _) => {
                    let party_id = party.as_ref().map(|party| party.id).ok_or_else(|| {
                        AppError::new(codes::PARTY_NOT_ALLOWED, "Select a supplier for this voucher")
                    })?;
                    let fy = numbering::financial_year_label(&input.date, company.fy_start_month);
                    let normalized = numbering::normalize_supplier_bill_number(bill_no);
                    if normalized.is_empty() {
                        return Err(AppError::validation(
                            "Supplier bill number must contain a letter or digit",
                        ));
                    }
                    // The series is scoped per supplier and the table-level
                    // unique constraint then enforces (company, supplier, fy,
                    // number). This pre-check catches the normalized form and
                    // names the existing voucher; the constraint is the backstop.
                    if let Some((existing_number, existing_date)) = repo::find_duplicate_supplier_bill(
                        conn,
                        company_id,
                        party_id,
                        &fy,
                        &normalized,
                    )? {
                        return Err(AppError::new(
                            codes::DUPLICATE_SUPPLIER_BILL,
                            format!(
                                "Supplier bill {existing_number} dated {existing_date} is already recorded for this supplier"
                            ),
                        ));
                    }
                    (
                        bill_no.clone(),
                        fy,
                        format!("SUP{party_id}"),
                        "SUPPLIER".to_string(),
                        Some(normalized),
                    )
                }
                (None, _) => {
                    let (number, fy, series) = numbering::allocate_number(
                        conn,
                        company_id,
                        &input.voucher_type,
                        &input.date,
                        input.manual_number,
                    )?;
                    (number, fy, series, "INTERNAL".to_string(), None)
                }
            }
        } else {
            let (number, fy, series) = numbering::allocate_number(
                conn,
                company_id,
                &input.voucher_type,
                &input.date,
                input.manual_number,
            )?;
            (number, fy, series, "INTERNAL".to_string(), None)
        };

    let due_date = match &input.due_date {
        Some(value) => Some(value.clone()),
        None => match (&party, input.voucher_type.as_str()) {
            (Some(party), "SALES") | (Some(party), "PURCHASE") => {
                add_days(&input.date, party.credit_days)
            }
            _ => None,
        },
    };

    let total_minor = match input.voucher_type.as_str() {
        "RECEIPT" | "PAYMENT" | "CONTRA" => amount_minor,
        "JOURNAL" => input.journal_lines.iter().map(|line| line.debit_minor).sum(),
        _ => totals.total_minor,
    };

    let new_lines: Vec<repo::NewLine> = input
        .lines
        .iter()
        .enumerate()
        .map(|(index, line)| {
            let tax = computed.get(index).copied().unwrap_or_default();
            let item = items.get(index).and_then(|item| item.as_ref());
            repo::NewLine {
                item_id: line.item_id,
                description: line.description.clone(),
                hsn: line.hsn.clone().or_else(|| item.and_then(|item| item.hsn_sac.clone())),
                uom: line.uom.clone().or_else(|| item.and_then(|item| item.uom.clone())),
                qty_e4: line.qty_e4,
                rate_minor: line.rate_minor,
                rate_includes_tax: line.rate_includes_tax,
                discount_bps: line.discount_bps,
                gst_rate_bps: line.gst_rate_bps,
                taxable_minor: tax.taxable_minor,
                cgst_minor: tax.cgst_minor,
                sgst_minor: tax.sgst_minor,
                igst_minor: tax.igst_minor,
                cess_minor: tax.cess_minor,
                line_total_minor: tax.total_minor,
                unit_cost_minor: None,
                godown_id: line.godown_id.or(default_godown),
                sort_order: index as i64,
            }
        })
        .collect();

    let new_allocations: Vec<repo::NewAllocation> = input
        .allocations
        .iter()
        .map(|allocation| repo::NewAllocation {
            to_voucher_id: allocation.to_voucher_id,
            amount_minor: allocation.amount_minor,
            allocation_type: allocation.allocation_type.clone(),
        })
        .collect();

    let supplier_numbered = number_source == "SUPPLIER";

    let header = repo::NewVoucher {
        company_id,
        voucher_type: input.voucher_type.clone(),
        series,
        number: number.clone(),
        number_source,
        number_normalized,
        fy,
        date: input.date.clone(),
        due_date,
        party_id: party.as_ref().map(|party| party.id),
        place_of_supply_state_code: Some(place_of_supply),
        narration: input.narration.clone(),
        reference_no: input.reference_no.clone(),
        taxable_minor: totals.taxable_minor,
        cgst_minor: totals.cgst_minor,
        sgst_minor: totals.sgst_minor,
        igst_minor: totals.igst_minor,
        cess_minor: totals.cess_minor,
        discount_minor: totals.discount_minor,
        round_off_minor: totals.round_off_minor,
        total_minor,
        total_qty_e4: totals.total_qty_e4,
        payment_method_id: input.payment_method_id,
        instrument_no: input.instrument_no.clone(),
        bank_account_id: input.cash_account_id,
        reversal_of_voucher_id: input.reversal_of_voucher_id,
        idempotency_key: Some(input.request_id.clone()),
        created_by: Some(user_id),
    };

    let id = match repo::insert(
        conn,
        &header,
        &new_lines,
        &ledger,
        &stock_movements,
        &new_allocations,
        Some(user_id),
    ) {
        Ok(id) => id,
        Err(err)
            if err.code == codes::CONFLICT
                && err.message.contains("vouchers.company_id") =>
        {
            return Err(if supplier_numbered {
                AppError::new(
                    codes::DUPLICATE_SUPPLIER_BILL,
                    "This supplier bill number is already recorded for this supplier",
                )
            } else {
                AppError::new(codes::NUMBER_COLLISION, "Voucher number collision, try again")
            });
        }
        Err(err) => return Err(err),
    };

    audit::record(
        conn,
        company_id,
        "VOUCHER",
        id,
        "POST",
        None,
        Some(&json!({ "type": input.voucher_type, "number": number })),
        Some(user_id),
    )?;

    let response = json!({ "id": id, "number": number });
    repo::insert_idempotency(
        conn,
        company_id,
        POST_CHANNEL,
        &input.request_id,
        fingerprint,
        &response.to_string(),
    )?;
    Ok(response)
}

fn add_days(date_iso: &str, days: i64) -> Option<String> {
    let date = chrono::NaiveDate::parse_from_str(date_iso, "%Y-%m-%d").ok()?;
    let shifted = if days >= 0 {
        date.checked_add_days(chrono::Days::new(days as u64))?
    } else {
        date.checked_sub_days(chrono::Days::new(days.unsigned_abs()))?
    };
    Some(shifted.format("%Y-%m-%d").to_string())
}

// ---------------------------------------------------------------------------
// Opening balances
// ---------------------------------------------------------------------------

fn post_opening_balances(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    let date = req_str(input, "date")?;
    if !is_date_iso(&date) {
        return Err(AppError::validation("date must be YYYY-MM-DD"));
    }
    ctx.require_permission(perm::VOUCHER_POST)?;
    let company_id = ctx.company_id()?;
    let user_id = ctx.user_id()?;
    ctx.with_tx(|ctx| opening_in_tx(ctx, company_id, user_id, &date))
}

fn opening_in_tx(
    ctx: &mut Ctx<'_>,
    company_id: i64,
    user_id: i64,
    date: &str,
) -> AppResult<Value> {
    let conn = ctx.db();

    if repo::has_opening_voucher(conn, company_id)? {
        return Err(AppError::conflict("Opening balances have already been posted"));
    }

    let keys = repo::system_keys(conn, company_id)?;
    let Some(opening_diff) = keys.get("OPENING_DIFF").copied() else {
        return Err(AppError::validation("Opening difference account is missing"));
    };
    let inventory_account = keys.get("INVENTORY").copied();
    let default_godown = repo::default_godown(conn, company_id)?;

    let mut stock_movements: Vec<StockMovement> = Vec::new();
    let mut inventory_value = 0i64;
    for item in repo::opening_items(conn, company_id)? {
        inventory_value =
            inventory_value.saturating_add(stock::movement_value(item.qty_e4, item.rate_minor)?);
        stock_movements.push(StockMovement {
            item_id: item.id,
            godown_id: default_godown,
            qty_in_e4: item.qty_e4,
            qty_out_e4: 0,
            unit_cost_minor: item.rate_minor,
            movement_type: "OPENING".to_string(),
        });
    }

    let mut ledger: Vec<LedgerDraft> = Vec::new();
    let mut debit = 0i64;
    let mut credit = 0i64;

    for party in repo::opening_parties(conn, company_id)? {
        let accounts = repo::party_accounts(conn, company_id, party.id)?;
        let amount = party.opening_balance_minor.saturating_abs();
        let account = if party.opening_balance_minor > 0 {
            accounts.debtor
        } else {
            accounts.creditor
        };
        let Some(account) = account else { continue };
        if party.opening_balance_minor > 0 {
            ledger.push(LedgerDraft {
                account_id: account,
                party_id: Some(party.id),
                debit_minor: amount,
                credit_minor: 0,
                narration: Some("Opening balance".to_string()),
            });
            debit = debit.saturating_add(amount);
        } else {
            ledger.push(LedgerDraft {
                account_id: account,
                party_id: Some(party.id),
                debit_minor: 0,
                credit_minor: amount,
                narration: Some("Opening balance".to_string()),
            });
            credit = credit.saturating_add(amount);
        }
    }

    if inventory_value > 0 {
        if let Some(inventory) = inventory_account {
            ledger.push(LedgerDraft {
                account_id: inventory,
                party_id: None,
                debit_minor: inventory_value,
                credit_minor: 0,
                narration: Some("Opening stock".to_string()),
            });
            debit = debit.saturating_add(inventory_value);
        }
    }

    for account in repo::opening_accounts(conn, company_id)? {
        let amount = account.amount_minor.saturating_abs();
        if account.side == "DEBIT" {
            ledger.push(LedgerDraft {
                account_id: account.id,
                party_id: None,
                debit_minor: amount,
                credit_minor: 0,
                narration: Some("Opening balance".to_string()),
            });
            debit = debit.saturating_add(amount);
        } else {
            ledger.push(LedgerDraft {
                account_id: account.id,
                party_id: None,
                debit_minor: 0,
                credit_minor: amount,
                narration: Some("Opening balance".to_string()),
            });
            credit = credit.saturating_add(amount);
        }
    }

    let difference = debit.saturating_sub(credit);
    if difference > 0 {
        ledger.push(LedgerDraft {
            account_id: opening_diff,
            party_id: None,
            debit_minor: 0,
            credit_minor: difference,
            narration: Some("Opening difference".to_string()),
        });
    } else if difference < 0 {
        ledger.push(LedgerDraft {
            account_id: opening_diff,
            party_id: None,
            debit_minor: difference.saturating_neg(),
            credit_minor: 0,
            narration: Some("Opening difference".to_string()),
        });
    }

    if ledger.is_empty() {
        return Err(AppError::validation("No opening balances to post"));
    }
    posting::assert_balanced(&ledger)?;

    let (number, fy, series) = numbering::allocate_number(conn, company_id, "OPENING", date, None)?;
    let header = repo::NewVoucher {
        company_id,
        voucher_type: "OPENING".to_string(),
        series,
        number: number.clone(),
        number_source: "INTERNAL".to_string(),
        number_normalized: None,
        fy,
        date: date.to_string(),
        due_date: None,
        party_id: None,
        place_of_supply_state_code: None,
        narration: Some("Opening balances".to_string()),
        reference_no: None,
        taxable_minor: 0,
        cgst_minor: 0,
        sgst_minor: 0,
        igst_minor: 0,
        cess_minor: 0,
        discount_minor: 0,
        round_off_minor: 0,
        total_minor: 0,
        total_qty_e4: 0,
        payment_method_id: None,
        instrument_no: None,
        bank_account_id: None,
        reversal_of_voucher_id: None,
        idempotency_key: None,
        created_by: Some(user_id),
    };

    let id = repo::insert(conn, &header, &[], &ledger, &stock_movements, &[], Some(user_id))?;

    // The ledger now carries every opening figure. Clear the staging columns so
    // the trial balance and P&L, which add them to the ledger sum, do not count
    // the same money twice. Items and parties keep their declared openings: the
    // stock report reads movements only and party balances are ledger-driven.
    conn.execute(
        "UPDATE accounts SET opening_balance_minor = 0
         WHERE company_id = ?1 AND opening_balance_minor <> 0",
        rusqlite::params![company_id],
    )?;

    Ok(json!({ "id": id, "number": number }))
}

#[cfg(test)]
mod tests {
    use super::{add_days, is_date_iso, parse_supplier_bill};

    #[test]
    fn recognises_business_dates() {
        assert!(is_date_iso("2026-10-29"));
        assert!(!is_date_iso("2026-1-29"));
        assert!(!is_date_iso("29-10-2026"));
        assert!(!is_date_iso(""));
    }

    #[test]
    fn adds_credit_days_without_local_time() {
        assert_eq!(add_days("2026-02-27", 2).as_deref(), Some("2026-03-01"));
        assert_eq!(add_days("2026-12-31", 0).as_deref(), Some("2026-12-31"));
        assert_eq!(add_days("not-a-date", 5), None);
    }

    #[test]
    fn a_purchase_needs_exactly_one_supplier_bill_identity() {
        assert!(parse_supplier_bill("PURCHASE", None, false).is_err());
        assert!(parse_supplier_bill("PURCHASE", Some("TC/1".into()), true).is_err());
        assert_eq!(
            parse_supplier_bill("PURCHASE", None, true).expect("no-bill declaration"),
            (None, true)
        );
        let (number, missing) =
            parse_supplier_bill("PURCHASE", Some("TC/2026-27/583".into()), false).expect("number");
        assert_eq!(number.as_deref(), Some("TC/2026-27/583"));
        assert!(!missing);
    }

    #[test]
    fn supplier_bill_numbers_are_one_to_32_printable_characters() {
        assert!(parse_supplier_bill("PURCHASE", Some("1".repeat(32)), false).is_ok());
        assert!(parse_supplier_bill("PURCHASE", Some("1".repeat(33)), false).is_err());
        assert!(parse_supplier_bill("PURCHASE", Some("TC\n583".into()), false).is_err());
        assert!(parse_supplier_bill("PURCHASE", Some("--- / .".into()), false).is_err());
    }

    #[test]
    fn supplier_bill_numbers_belong_to_purchases_only() {
        assert!(parse_supplier_bill("SALES", Some("TC/1".into()), false).is_err());
        assert!(parse_supplier_bill("SALES", None, true).is_err());
        assert_eq!(
            parse_supplier_bill("SALES", None, false).expect("sales"),
            (None, false)
        );
    }
}
