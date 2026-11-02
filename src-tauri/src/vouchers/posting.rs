//! Pure posting rules: GST arithmetic, invoice totals and the ledger builder.
//!
//! Mirrors `src/main/domain/money.ts`, `src/main/domain/tax.ts` and
//! `src/main/domain/posting.ts`. Nothing in here touches the database, so the
//! same functions feed the posting engine, the invoice read model and the unit
//! tests.
//!
//! Units: money is paise, quantity is scaled by 10,000 and rates are basis
//! points. Every division rounds half away from zero, exactly like
//! `roundHalfUpDiv`. No float ever decides a stored value.

use crate::error::{codes, AppError, AppResult};

/// Quantity scale (`qtyE4`).
pub const QTY_SCALE: i128 = 10_000;
/// Basis-point scale (18% = 1800).
pub const BPS_SCALE: i128 = 10_000;

/// Summed line values for one voucher, after invoice-level round off.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Totals {
    pub taxable_minor: i64,
    pub cgst_minor: i64,
    pub sgst_minor: i64,
    pub igst_minor: i64,
    pub cess_minor: i64,
    pub discount_minor: i64,
    pub round_off_minor: i64,
    pub total_minor: i64,
    pub total_qty_e4: i64,
}

/// One computed item line.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LineTax {
    pub gross_minor: i64,
    pub discount_minor: i64,
    pub taxable_minor: i64,
    pub cgst_minor: i64,
    pub sgst_minor: i64,
    pub igst_minor: i64,
    pub cess_minor: i64,
    pub tax_minor: i64,
    pub total_minor: i64,
}

/// Inputs of one line, already normalised by the command layer.
#[derive(Debug, Clone, Copy)]
pub struct LineTaxInput {
    pub qty_e4: i64,
    pub rate_minor: i64,
    pub rate_includes_tax: bool,
    pub discount_bps: i64,
    pub gst_rate_bps: i64,
    pub cess_rate_bps: i64,
}

/// One row of `ledger_lines` before it is written.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LedgerDraft {
    pub account_id: i64,
    pub party_id: Option<i64>,
    pub debit_minor: i64,
    pub credit_minor: i64,
    pub narration: Option<String>,
}

/// Free-form journal row.
#[derive(Debug, Clone)]
pub struct JournalLine {
    pub account_id: i64,
    pub debit_minor: i64,
    pub credit_minor: i64,
    pub narration: Option<String>,
}

/// The reserved accounts a posting rule can touch, resolved by `system_key`.
#[derive(Debug, Clone, Copy)]
pub struct PostingAccounts {
    pub sales: i64,
    pub sales_returns: i64,
    pub purchases: i64,
    pub purchase_returns: i64,
    pub output_cgst: i64,
    pub output_sgst: i64,
    pub output_igst: i64,
    pub input_cgst: i64,
    pub input_sgst: i64,
    pub input_igst: i64,
    pub round_off: i64,
    pub cogs: i64,
    pub inventory: i64,
    pub cash: i64,
    pub bank: i64,
    pub output_cess: Option<i64>,
    pub input_cess: Option<i64>,
    pub party_debtor: Option<i64>,
    pub party_creditor: Option<i64>,
}

/// Everything `build_ledger_lines` needs.
pub struct BuildInput<'a> {
    pub voucher_type: &'a str,
    pub totals: Totals,
    pub accounts: PostingAccounts,
    pub party_id: Option<i64>,
    pub cash_account_id: Option<i64>,
    pub goods_taxable_minor: i64,
    pub service_taxable_minor: i64,
    pub journal_lines: &'a [JournalLine],
    pub amount_minor: i64,
    pub contra_from_account_id: Option<i64>,
    pub contra_to_account_id: Option<i64>,
}

/// Divide two integers, rounding half away from zero. `denominator` must be
/// positive. Mirrors `roundHalfUpDiv`, including its sign behaviour.
pub fn round_half_up_div(numerator: i128, denominator: i128) -> AppResult<i64> {
    if denominator <= 0 {
        return Err(AppError::internal("Denominator must be positive"));
    }
    let sign: i128 = if numerator < 0 { -1 } else { 1 };
    let absolute = numerator.unsigned_abs();
    let denominator = denominator as u128;
    let rounded = (absolute * 2 + denominator) / (2 * denominator);
    let signed = sign
        .checked_mul(i128::try_from(rounded).map_err(|_| amount_out_of_range())?)
        .ok_or_else(amount_out_of_range)?;
    i64::try_from(signed).map_err(|_| amount_out_of_range())
}

fn amount_out_of_range() -> AppError {
    AppError::new(codes::INVALID_LINE_VALUE, "Amount is out of range")
}

/// A basis-point share of an amount, in paise. Mirrors `applyBps`.
pub fn apply_bps(amount_minor: i64, bps: i64) -> AppResult<i64> {
    round_half_up_div(i128::from(amount_minor) * i128::from(bps), BPS_SCALE)
}

/// Intra state when the supplier and the place of supply share a state code.
pub fn is_intra_state(supplier_state: &str, place_of_supply: &str) -> bool {
    let supplier = supplier_state.trim();
    let place = if place_of_supply.trim().is_empty() { supplier } else { place_of_supply.trim() };
    !supplier.is_empty() && supplier == place
}

/// GST for one line. Mirrors `computeLineTax`.
pub fn compute_line_tax(input: &LineTaxInput, intra_state: bool) -> AppResult<LineTax> {
    let gross = round_half_up_div(i128::from(input.qty_e4) * i128::from(input.rate_minor), QTY_SCALE)?;
    let discount = apply_bps(gross, input.discount_bps)?;
    let net = gross.checked_sub(discount).ok_or_else(amount_out_of_range)?;
    let cess_rate = input.cess_rate_bps;

    let (taxable, tax, cgst, sgst, igst, cess) = if input.rate_includes_tax {
        let denominator = BPS_SCALE + i128::from(input.gst_rate_bps) + i128::from(cess_rate);
        let taxable = round_half_up_div(i128::from(net) * BPS_SCALE, denominator)?;
        let tax = net.checked_sub(taxable).ok_or_else(amount_out_of_range)?;
        let cess = apply_bps(taxable, cess_rate)?;
        let gst = tax.checked_sub(cess).ok_or_else(amount_out_of_range)?;
        if intra_state {
            // `Math.floor(gst / 2)` on a possibly negative value is Euclidean
            // division: SGST mops up the odd paisa.
            let cgst = gst.div_euclid(2);
            let sgst = gst - cgst;
            (taxable, tax, cgst, sgst, 0, cess)
        } else {
            (taxable, tax, 0, 0, gst, cess)
        }
    } else {
        let taxable = net;
        let cess = apply_bps(taxable, cess_rate)?;
        let (cgst, sgst, igst) = if intra_state {
            let half = input.gst_rate_bps.div_euclid(2);
            let cgst = apply_bps(taxable, half)?;
            let sgst = apply_bps(taxable, input.gst_rate_bps - half)?;
            (cgst, sgst, 0)
        } else {
            (0, 0, apply_bps(taxable, input.gst_rate_bps)?)
        };
        let tax = cgst
            .checked_add(sgst)
            .and_then(|value| value.checked_add(igst))
            .and_then(|value| value.checked_add(cess))
            .ok_or_else(amount_out_of_range)?;
        (taxable, tax, cgst, sgst, igst, cess)
    };

    let total = taxable.checked_add(tax).ok_or_else(amount_out_of_range)?;
    Ok(LineTax {
        gross_minor: gross,
        discount_minor: discount,
        taxable_minor: taxable,
        cgst_minor: cgst,
        sgst_minor: sgst,
        igst_minor: igst,
        cess_minor: cess,
        tax_minor: tax,
        total_minor: total,
    })
}

/// Sums computed lines and applies the invoice-level round off.
/// Mirrors `computeInvoiceTotals`; only `INVOICE` rounds.
pub fn compute_invoice_totals(
    lines: &[LineTax],
    round_off_mode: &str,
    total_qty_e4: i64,
) -> AppResult<Totals> {
    let mut totals = Totals { total_qty_e4, ..Totals::default() };
    for line in lines {
        totals.taxable_minor = totals.taxable_minor.saturating_add(line.taxable_minor);
        totals.cgst_minor = totals.cgst_minor.saturating_add(line.cgst_minor);
        totals.sgst_minor = totals.sgst_minor.saturating_add(line.sgst_minor);
        totals.igst_minor = totals.igst_minor.saturating_add(line.igst_minor);
        totals.cess_minor = totals.cess_minor.saturating_add(line.cess_minor);
        totals.discount_minor = totals.discount_minor.saturating_add(line.discount_minor);
    }

    let pre_round = totals
        .taxable_minor
        .checked_add(totals.cgst_minor)
        .and_then(|value| value.checked_add(totals.sgst_minor))
        .and_then(|value| value.checked_add(totals.igst_minor))
        .and_then(|value| value.checked_add(totals.cess_minor))
        .ok_or_else(amount_out_of_range)?;

    let mut total = pre_round;
    let mut round_off = 0i64;
    if round_off_mode == "INVOICE" {
        let rupees = round_half_up_div(i128::from(pre_round), 100)?;
        total = rupees.checked_mul(100).ok_or_else(amount_out_of_range)?;
        round_off = total.checked_sub(pre_round).ok_or_else(amount_out_of_range)?;
    }

    if round_off.unsigned_abs() > 100 {
        return Err(AppError::new(codes::ROUND_OFF_TOO_LARGE, "Round off is too large"));
    }

    totals.round_off_minor = round_off;
    totals.total_minor = total;
    Ok(totals)
}

fn push(
    lines: &mut Vec<LedgerDraft>,
    account_id: i64,
    debit_minor: i64,
    credit_minor: i64,
    party_id: Option<i64>,
    narration: Option<&str>,
) {
    if debit_minor == 0 && credit_minor == 0 {
        return;
    }
    lines.push(LedgerDraft {
        account_id,
        party_id,
        debit_minor,
        credit_minor,
        narration: narration.map(|value| value.to_string()),
    });
}

fn party_account(account: Option<i64>, party_id: Option<i64>, message: &str) -> AppResult<i64> {
    match (account, party_id) {
        (Some(account), Some(_)) => Ok(account),
        _ => Err(AppError::new(codes::PARTY_NOT_ALLOWED, message)),
    }
}

fn missing_account(key: &str) -> AppError {
    AppError::new(codes::ACCOUNT_NOT_POSTABLE, format!("Chart of accounts is missing {key}"))
}

fn cess_account(account: Option<i64>, key: &str) -> AppResult<i64> {
    account.ok_or_else(|| missing_account(key))
}

/// Decides which accounts a document touches and on which side.
/// Mirrors `buildLedgerLines`.
pub fn build_ledger_lines(input: &BuildInput<'_>) -> AppResult<Vec<LedgerDraft>> {
    let accounts = &input.accounts;
    let totals = &input.totals;
    let party_id = input.party_id;
    let cash = input.cash_account_id.unwrap_or(accounts.cash);
    let mut lines: Vec<LedgerDraft> = Vec::new();
    let round_off = totals.round_off_minor;

    match input.voucher_type {
        "SALES" => {
            if input.cash_account_id.is_some() {
                push(&mut lines, cash, totals.total_minor, 0, None, None);
            } else {
                let debtor =
                    party_account(accounts.party_debtor, party_id, "This party is not a customer")?;
                push(&mut lines, debtor, totals.total_minor, 0, party_id, None);
            }
            push(&mut lines, accounts.sales, 0, totals.taxable_minor, None, None);
            push(&mut lines, accounts.output_cgst, 0, totals.cgst_minor, None, None);
            push(&mut lines, accounts.output_sgst, 0, totals.sgst_minor, None, None);
            push(&mut lines, accounts.output_igst, 0, totals.igst_minor, None, None);
            if totals.cess_minor != 0 {
                let cess = cess_account(accounts.output_cess, "OUTPUT_CESS")?;
                push(&mut lines, cess, 0, totals.cess_minor, None, None);
            }
            if round_off > 0 {
                push(&mut lines, accounts.round_off, 0, round_off, None, None);
            } else if round_off < 0 {
                push(&mut lines, accounts.round_off, round_off.saturating_neg(), 0, None, None);
            }
        }
        "PURCHASE" => {
            let goods = input.goods_taxable_minor;
            let services = input.service_taxable_minor;
            push(&mut lines, accounts.inventory, goods, 0, None, None);
            push(&mut lines, accounts.purchases, services, 0, None, None);
            push(&mut lines, accounts.input_cgst, totals.cgst_minor, 0, None, None);
            push(&mut lines, accounts.input_sgst, totals.sgst_minor, 0, None, None);
            push(&mut lines, accounts.input_igst, totals.igst_minor, 0, None, None);
            if totals.cess_minor != 0 {
                let cess = cess_account(accounts.input_cess, "INPUT_CESS")?;
                push(&mut lines, cess, totals.cess_minor, 0, None, None);
            }
            if round_off > 0 {
                push(&mut lines, accounts.round_off, round_off, 0, None, None);
            } else if round_off < 0 {
                push(&mut lines, accounts.round_off, 0, round_off.saturating_neg(), None, None);
            }
            if input.cash_account_id.is_some() {
                push(&mut lines, cash, 0, totals.total_minor, None, None);
            } else {
                let creditor = party_account(
                    accounts.party_creditor,
                    party_id,
                    "This party is not a supplier",
                )?;
                push(&mut lines, creditor, 0, totals.total_minor, party_id, None);
            }
        }
        "CREDIT_NOTE" => {
            push(&mut lines, accounts.sales_returns, totals.taxable_minor, 0, None, None);
            push(&mut lines, accounts.output_cgst, totals.cgst_minor, 0, None, None);
            push(&mut lines, accounts.output_sgst, totals.sgst_minor, 0, None, None);
            push(&mut lines, accounts.output_igst, totals.igst_minor, 0, None, None);
            if totals.cess_minor != 0 {
                let cess = cess_account(accounts.output_cess, "OUTPUT_CESS")?;
                push(&mut lines, cess, totals.cess_minor, 0, None, None);
            }
            if round_off > 0 {
                push(&mut lines, accounts.round_off, round_off, 0, None, None);
            } else if round_off < 0 {
                push(&mut lines, accounts.round_off, 0, round_off.saturating_neg(), None, None);
            }
            if input.cash_account_id.is_some() {
                push(&mut lines, cash, 0, totals.total_minor, None, None);
            } else {
                let debtor =
                    party_account(accounts.party_debtor, party_id, "This party is not a customer")?;
                push(&mut lines, debtor, 0, totals.total_minor, party_id, None);
            }
        }
        "DEBIT_NOTE" => {
            let creditor =
                party_account(accounts.party_creditor, party_id, "This party is not a supplier")?;
            push(&mut lines, creditor, totals.total_minor, 0, party_id, None);
            let goods = input.goods_taxable_minor;
            let services = (totals.taxable_minor - goods).max(0);
            push(&mut lines, accounts.inventory, 0, goods, None, None);
            push(&mut lines, accounts.purchase_returns, 0, services, None, None);
            push(&mut lines, accounts.input_cgst, 0, totals.cgst_minor, None, None);
            push(&mut lines, accounts.input_sgst, 0, totals.sgst_minor, None, None);
            push(&mut lines, accounts.input_igst, 0, totals.igst_minor, None, None);
            if totals.cess_minor != 0 {
                let cess = cess_account(accounts.input_cess, "INPUT_CESS")?;
                push(&mut lines, cess, 0, totals.cess_minor, None, None);
            }
            if round_off > 0 {
                push(&mut lines, accounts.round_off, 0, round_off, None, None);
            } else if round_off < 0 {
                push(&mut lines, accounts.round_off, round_off.saturating_neg(), 0, None, None);
            }
        }
        "RECEIPT" => {
            let debtor =
                party_account(accounts.party_debtor, party_id, "This party is not a customer")?;
            let amount = input.amount_minor;
            push(&mut lines, cash, amount, 0, None, None);
            push(&mut lines, debtor, 0, amount, party_id, None);
        }
        "PAYMENT" => {
            let creditor =
                party_account(accounts.party_creditor, party_id, "This party is not a supplier")?;
            let amount = input.amount_minor;
            push(&mut lines, creditor, amount, 0, party_id, None);
            push(&mut lines, cash, 0, amount, None, None);
        }
        "CONTRA" => {
            let from = input.contra_from_account_id.unwrap_or(accounts.cash);
            let to = input.contra_to_account_id.unwrap_or(accounts.bank);
            let amount = input.amount_minor;
            push(&mut lines, to, amount, 0, None, None);
            push(&mut lines, from, 0, amount, None, None);
        }
        "JOURNAL" => {
            for line in input.journal_lines {
                push(
                    &mut lines,
                    line.account_id,
                    line.debit_minor,
                    line.credit_minor,
                    None,
                    line.narration.as_deref(),
                );
            }
        }
        other => {
            return Err(AppError::validation(format!("Unsupported voucher type: {other}")));
        }
    }

    Ok(lines)
}

/// Throws when the document does not balance. The one invariant that matters.
pub fn assert_balanced(lines: &[LedgerDraft]) -> AppResult<()> {
    let mut debit: i64 = 0;
    let mut credit: i64 = 0;
    for line in lines {
        debit = debit.saturating_add(line.debit_minor);
        credit = credit.saturating_add(line.credit_minor);
    }
    if debit != credit || debit == 0 {
        return Err(AppError::new(
            codes::VOUCHER_UNBALANCED,
            format!("VOUCHER_UNBALANCED: debit {debit}, credit {credit}"),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn accounts() -> PostingAccounts {
        PostingAccounts {
            sales: 1,
            sales_returns: 2,
            purchases: 3,
            purchase_returns: 4,
            output_cgst: 5,
            output_sgst: 6,
            output_igst: 7,
            input_cgst: 8,
            input_sgst: 9,
            input_igst: 10,
            round_off: 11,
            cogs: 12,
            inventory: 13,
            cash: 14,
            bank: 15,
            output_cess: None,
            input_cess: None,
            party_debtor: Some(20),
            party_creditor: Some(21),
        }
    }

    fn sales_totals() -> Totals {
        Totals {
            taxable_minor: 385_593,
            cgst_minor: 34_703,
            sgst_minor: 34_703,
            igst_minor: 0,
            cess_minor: 0,
            discount_minor: 0,
            round_off_minor: 1,
            total_minor: 455_000,
            total_qty_e4: 10_000,
        }
    }

    #[test]
    fn rounds_half_away_from_zero() {
        assert_eq!(round_half_up_div(1, 2).unwrap(), 1);
        assert_eq!(round_half_up_div(-1, 2).unwrap(), -1);
        assert_eq!(round_half_up_div(1, 3).unwrap(), 0);
        assert_eq!(round_half_up_div(2, 3).unwrap(), 1);
        assert_eq!(round_half_up_div(-2, 3).unwrap(), -1);
        assert!(round_half_up_div(1, 0).is_err());
    }

    #[test]
    fn applies_basis_points() {
        assert_eq!(apply_bps(10_000, 1_800).unwrap(), 1_800);
        assert_eq!(apply_bps(1_317_333, 0).unwrap(), 0);
        assert_eq!(apply_bps(900, 1_525).unwrap(), 137);
    }

    #[test]
    fn computes_an_exclusive_intra_state_line() {
        let tax = compute_line_tax(
            &LineTaxInput {
                qty_e4: 10_000,
                rate_minor: 10_000,
                rate_includes_tax: false,
                discount_bps: 1_000,
                gst_rate_bps: 1_800,
                cess_rate_bps: 0,
            },
            true,
        )
        .unwrap();

        assert_eq!(tax.gross_minor, 10_000);
        assert_eq!(tax.discount_minor, 1_000);
        assert_eq!(tax.taxable_minor, 9_000);
        assert_eq!(tax.cgst_minor, 810);
        assert_eq!(tax.sgst_minor, 810);
        assert_eq!(tax.igst_minor, 0);
        assert_eq!(tax.total_minor, 10_620);
    }

    #[test]
    fn computes_an_inclusive_inter_state_line() {
        let tax = compute_line_tax(
            &LineTaxInput {
                qty_e4: 10_000,
                rate_minor: 11_800,
                rate_includes_tax: true,
                discount_bps: 0,
                gst_rate_bps: 1_800,
                cess_rate_bps: 0,
            },
            false,
        )
        .unwrap();

        assert_eq!(tax.taxable_minor, 10_000);
        assert_eq!(tax.igst_minor, 1_800);
        assert_eq!(tax.cgst_minor, 0);
        assert_eq!(tax.total_minor, 11_800);
    }

    #[test]
    fn splits_a_2500_inclusive_sale_line_at_18_percent() {
        let tax = compute_line_tax(
            &LineTaxInput {
                qty_e4: 10_000,
                rate_minor: 250_000,
                rate_includes_tax: true,
                discount_bps: 0,
                gst_rate_bps: 1_800,
                cess_rate_bps: 0,
            },
            true,
        )
        .unwrap();

        assert_eq!(tax.taxable_minor, 211_864);
        assert_eq!(tax.cgst_minor, 19_068);
        assert_eq!(tax.sgst_minor, 19_068);
        assert_eq!(tax.cess_minor, 0);
        assert_eq!(tax.total_minor, 250_000);
    }

    #[test]
    fn adds_tax_to_a_1750_exclusive_purchase_line_at_18_percent() {
        let tax = compute_line_tax(
            &LineTaxInput {
                qty_e4: 10_000,
                rate_minor: 175_000,
                rate_includes_tax: false,
                discount_bps: 0,
                gst_rate_bps: 1_800,
                cess_rate_bps: 0,
            },
            true,
        )
        .unwrap();

        assert_eq!(tax.taxable_minor, 175_000);
        assert_eq!(tax.cgst_minor, 15_750);
        assert_eq!(tax.sgst_minor, 15_750);
        assert_eq!(tax.total_minor, 206_500);
    }

    #[test]
    fn extracts_cess_from_an_inclusive_price() {
        let tax = compute_line_tax(
            &LineTaxInput {
                qty_e4: 10_000,
                rate_minor: 250_000,
                rate_includes_tax: true,
                discount_bps: 0,
                gst_rate_bps: 1_800,
                cess_rate_bps: 1_200,
            },
            true,
        )
        .unwrap();

        assert_eq!(tax.taxable_minor, 192_308);
        assert_eq!(tax.cess_minor, 23_077);
        assert_eq!(tax.cgst_minor, 17_307);
        assert_eq!(tax.sgst_minor, 17_308);
        assert_eq!(tax.total_minor, 250_000);
    }

    #[test]
    fn collapses_a_negative_difference_into_round_off() {
        let totals = compute_invoice_totals(&[], "INVOICE", 0).unwrap();
        assert_eq!(totals.total_minor, 0);

        let totals = compute_invoice_totals(
            &[LineTax { taxable_minor: 385_593, cgst_minor: 34_703, sgst_minor: 34_703, total_minor: 454_999, ..LineTax::default() }],
            "INVOICE",
            10_000,
        )
        .unwrap();
        assert_eq!(totals.total_minor, 455_000);
        assert_eq!(totals.round_off_minor, 1);
        assert_eq!(totals.total_qty_e4, 10_000);
    }

    #[test]
    fn leaves_the_total_alone_when_round_off_is_off() {
        let totals = compute_invoice_totals(
            &[LineTax { taxable_minor: 385_593, cgst_minor: 34_703, sgst_minor: 34_703, total_minor: 454_999, ..LineTax::default() }],
            "NONE",
            0,
        )
        .unwrap();
        assert_eq!(totals.total_minor, 454_999);
        assert_eq!(totals.round_off_minor, 0);
    }

    #[test]
    fn builds_a_balanced_credit_sale() {
        let totals = sales_totals();
        let ledger = build_ledger_lines(&BuildInput {
            voucher_type: "SALES",
            totals,
            accounts: accounts(),
            party_id: Some(7),
            cash_account_id: None,
            goods_taxable_minor: totals.taxable_minor,
            service_taxable_minor: 0,
            journal_lines: &[],
            amount_minor: 0,
            contra_from_account_id: None,
            contra_to_account_id: None,
        })
        .unwrap();

        assert_balanced(&ledger).unwrap();
        assert_eq!(ledger[0].party_id, Some(7));
        assert_eq!(ledger[0].debit_minor, 455_000);
        // Round off is a credit on a sale.
        assert_eq!(ledger.last().unwrap().account_id, 11);
        assert_eq!(ledger.last().unwrap().credit_minor, 1);
    }

    #[test]
    fn refuses_an_unbalanced_document() {
        let ledger = vec![LedgerDraft {
            account_id: 1,
            party_id: None,
            debit_minor: 100,
            credit_minor: 0,
            narration: None,
        }];
        let err = assert_balanced(&ledger).unwrap_err();
        assert_eq!(err.code, codes::VOUCHER_UNBALANCED);
    }
}
