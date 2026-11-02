//! The printable invoice read model.
//!
//! Mirrors `src/main/repositories/invoice.ts`, `src/shared/invoice.ts` and
//! `src/shared/amount-in-words.ts`. Only `SALES` and `PURCHASE` vouchers have a
//! tax invoice layout, so anything else resolves to `None` and the command turns
//! that into the same not-found the Electron app returned.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::error::AppResult;

const ONES: [&str; 20] = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
    "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];

const TENS: [&str; 10] =
    ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/// Indian scale words. Index 1 is thousand, then every step is one hundred times.
const SCALES: [&str; 9] =
    ["", "Thousand", "Lakh", "Crore", "Arab", "Kharab", "Neel", "Padma", "Shankh"];

fn two_digits(value: i64) -> String {
    if value < 20 {
        return ONES.get(value.max(0) as usize).copied().unwrap_or("").to_string();
    }
    let tens = TENS.get((value / 10) as usize).copied().unwrap_or("");
    let ones = ONES.get((value % 10) as usize).copied().unwrap_or("");
    if ones.is_empty() {
        tens.to_string()
    } else {
        format!("{tens} {ones}")
    }
}

fn three_digits(value: i64) -> String {
    let hundreds = value / 100;
    let rest = value % 100;
    let mut parts: Vec<String> = Vec::new();
    if hundreds > 0 {
        parts.push(format!("{} Hundred", ONES.get(hundreds as usize).copied().unwrap_or("")));
    }
    if rest > 0 {
        parts.push(two_digits(rest));
    }
    parts.join(" ")
}

fn whole_number_words(value: i64) -> String {
    if value == 0 {
        return String::new();
    }
    let mut groups: Vec<i64> = Vec::new();
    let mut remaining = value;
    groups.push(remaining % 1000);
    remaining /= 1000;
    while remaining > 0 {
        groups.push(remaining % 100);
        remaining /= 100;
    }

    let mut words: Vec<String> = Vec::new();
    for index in (0..groups.len()).rev() {
        let group = groups[index];
        if group == 0 {
            continue;
        }
        let scale = SCALES.get(index).copied().unwrap_or("");
        let group_words = if index == 0 { three_digits(group) } else { two_digits(group) };
        words.push(if scale.is_empty() { group_words } else { format!("{group_words} {scale}") });
    }
    words.join(" ")
}

fn currency_words(currency: &str) -> (String, &'static str) {
    let code = currency.to_uppercase();
    match code.as_str() {
        "INR" => ("Rupees".to_string(), "Paise"),
        "USD" => ("Dollars".to_string(), "Cents"),
        "EUR" => ("Euros".to_string(), "Cents"),
        "GBP" => ("Pounds".to_string(), "Pence"),
        "AED" => ("Dirhams".to_string(), "Fils"),
        "SGD" => ("Singapore Dollars".to_string(), "Cents"),
        _ => (code, "Cents"),
    }
}

/// `455000 -> "Rupees Four Thousand Five Hundred Fifty Only"`.
/// Integer only: no float ever decides what the invoice says.
pub fn amount_in_words(minor: i64, currency: &str) -> String {
    let (currency_word, subunit_word) = currency_words(currency);
    let negative = minor < 0;
    let absolute = i64::try_from(minor.unsigned_abs()).unwrap_or(i64::MAX);
    let whole = absolute / 100;
    let fraction = absolute % 100;

    let whole_words = whole_number_words(whole);
    let mut parts: Vec<String> = Vec::new();
    parts.push(if whole_words.is_empty() {
        format!("{currency_word} Zero")
    } else {
        format!("{currency_word} {whole_words}")
    });
    if fraction > 0 {
        parts.push(format!("{} {subunit_word}", whole_number_words(fraction)));
    }

    let body = parts.join(" and ");
    format!("{}{body} Only", if negative { "Minus " } else { "" })
}

/// Splits the stored terms into readable lines, dropping blank ones.
pub fn term_lines(terms: Option<&str>) -> Vec<String> {
    terms
        .unwrap_or("")
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

/// Groups lines by GST rate for the rate-wise tax analysis.
fn tax_slabs(lines: &[LineTaxRow]) -> Vec<Value> {
    let mut by_rate: std::collections::BTreeMap<i64, (i64, i64, i64, i64, i64, i64, i64)> =
        std::collections::BTreeMap::new();
    for line in lines {
        let slab = by_rate.entry(line.gst_rate_bps).or_default();
        slab.0 += line.taxable_minor;
        slab.1 += line.cgst_minor;
        slab.2 += line.sgst_minor;
        slab.3 += line.igst_minor;
        slab.4 += line.cess_minor;
        slab.5 += line.cgst_minor + line.sgst_minor + line.igst_minor + line.cess_minor;
    }

    by_rate
        .into_iter()
        .filter(|(_, slab)| slab.0 != 0 || slab.5 != 0)
        .map(|(rate, slab)| {
            json!({
                "gstRateBps": rate,
                "taxableMinor": slab.0,
                "cgstMinor": slab.1,
                "sgstMinor": slab.2,
                "igstMinor": slab.3,
                "cessMinor": slab.4,
                "taxMinor": slab.5
            })
        })
        .collect()
}

struct LineTaxRow {
    id: i64,
    description: String,
    hsn: Option<String>,
    uom: Option<String>,
    qty_e4: i64,
    rate_minor: i64,
    discount_bps: i64,
    gst_rate_bps: i64,
    taxable_minor: i64,
    cgst_minor: i64,
    sgst_minor: i64,
    igst_minor: i64,
    cess_minor: i64,
    total_minor: i64,
}

struct InvoiceHeader {
    id: i64,
    voucher_type: String,
    number: String,
    number_source: String,
    date: String,
    due_date: Option<String>,
    reference_no: Option<String>,
    narration: Option<String>,
    place_of_supply_state_code: Option<String>,
    status: String,
    bank_account_id: Option<i64>,
    party_id: Option<i64>,
    taxable_minor: i64,
    cgst_minor: i64,
    sgst_minor: i64,
    igst_minor: i64,
    cess_minor: i64,
    discount_minor: i64,
    round_off_minor: i64,
    total_minor: i64,
    total_qty_e4: i64,
}

/// One read for the printable invoice. `None` when the voucher is missing or is
/// not a sales/purchase document, so the caller can raise the same not-found.
pub fn find_for_print(conn: &Connection, company_id: i64, id: i64) -> AppResult<Option<Value>> {
    let header = conn
        .query_row(
            "SELECT id, voucher_type, number, voucher_date, due_date, reference_no, narration,
                    place_of_supply_state_code, status, bank_account_id, party_id, taxable_minor,
                    cgst_minor, sgst_minor, igst_minor, cess_minor, discount_minor,
                    round_off_minor, total_minor, total_qty_e4, number_source
             FROM vouchers WHERE company_id = ?1 AND id = ?2",
            params![company_id, id],
            |row| {
                Ok(InvoiceHeader {
                    id: row.get(0)?,
                    voucher_type: row.get(1)?,
                    number: row.get(2)?,
                    date: row.get(3)?,
                    due_date: row.get(4)?,
                    reference_no: row.get(5)?,
                    narration: row.get(6)?,
                    place_of_supply_state_code: row.get(7)?,
                    status: row.get(8)?,
                    bank_account_id: row.get(9)?,
                    party_id: row.get(10)?,
                    taxable_minor: row.get(11)?,
                    cgst_minor: row.get(12)?,
                    sgst_minor: row.get(13)?,
                    igst_minor: row.get(14)?,
                    cess_minor: row.get(15)?,
                    discount_minor: row.get(16)?,
                    round_off_minor: row.get(17)?,
                    total_minor: row.get(18)?,
                    total_qty_e4: row.get(19)?,
                    number_source: row.get(20)?,
                })
            },
        )
        .optional()?;
    let Some(header) = header else { return Ok(None) };
    if header.voucher_type != "SALES" && header.voucher_type != "PURCHASE" {
        return Ok(None);
    }

    let company = conn
        .query_row(
            "SELECT name, legal_name, gstin, pan, state_code, address, city, pincode, phone, email,
                    currency, invoice_terms, logo
             FROM companies WHERE id = ?1",
            params![company_id],
            |row| {
                Ok(json!({
                    "name": row.get::<_, String>(0)?,
                    "legalName": row.get::<_, Option<String>>(1)?,
                    "gstin": row.get::<_, Option<String>>(2)?,
                    "pan": row.get::<_, Option<String>>(3)?,
                    "stateCode": row.get::<_, String>(4)?,
                    "address": row.get::<_, Option<String>>(5)?,
                    "city": row.get::<_, Option<String>>(6)?,
                    "pincode": row.get::<_, Option<String>>(7)?,
                    "phone": row.get::<_, Option<String>>(8)?,
                    "email": row.get::<_, Option<String>>(9)?,
                    "currency": row.get::<_, String>(10)?,
                    "invoiceTerms": row.get::<_, Option<String>>(11)?,
                    "logo": row.get::<_, Option<String>>(12)?
                }))
            },
        )
        .optional()?;
    let Some(company) = company else { return Ok(None) };

    let party = match header.party_id {
        Some(party_id) => conn
            .query_row(
                "SELECT id, name, gstin, pan, state_code, billing_address, shipping_address,
                        phone, email
                 FROM parties WHERE company_id = ?1 AND id = ?2",
                params![company_id, party_id],
                |row| {
                    Ok(json!({
                        "id": row.get::<_, i64>(0)?,
                        "name": row.get::<_, String>(1)?,
                        "gstin": row.get::<_, Option<String>>(2)?,
                        "pan": row.get::<_, Option<String>>(3)?,
                        "stateCode": row.get::<_, Option<String>>(4)?,
                        "billingAddress": row.get::<_, Option<String>>(5)?,
                        "shippingAddress": row.get::<_, Option<String>>(6)?,
                        "phone": row.get::<_, Option<String>>(7)?,
                        "email": row.get::<_, Option<String>>(8)?
                    }))
                },
            )
            .optional()?,
        None => None,
    };

    let mut stmt = conn.prepare(
        "SELECT id, description_snapshot, hsn_snapshot, uom_snapshot, qty_e4, entered_rate_minor,
                discount_bps, gst_rate_bps, taxable_value_minor, cgst_minor, sgst_minor,
                igst_minor, cess_minor, line_total_minor
         FROM voucher_item_lines WHERE voucher_id = ?1 ORDER BY sort_order, id",
    )?;
    let rows = stmt.query_map(params![header.id], |row| {
        Ok(LineTaxRow {
            id: row.get(0)?,
            description: row.get(1)?,
            hsn: row.get(2)?,
            uom: row.get(3)?,
            qty_e4: row.get(4)?,
            rate_minor: row.get(5)?,
            discount_bps: row.get(6)?,
            gst_rate_bps: row.get(7)?,
            taxable_minor: row.get(8)?,
            cgst_minor: row.get(9)?,
            sgst_minor: row.get(10)?,
            igst_minor: row.get(11)?,
            cess_minor: row.get(12)?,
            total_minor: row.get(13)?,
        })
    })?;
    let mut line_rows = Vec::new();
    for row in rows {
        line_rows.push(row?);
    }

    let bank = match header.bank_account_id {
        Some(account_id) => conn
            .query_row(
                "SELECT name, code FROM accounts WHERE company_id = ?1 AND id = ?2",
                params![company_id, account_id],
                |row| Ok(json!({ "name": row.get::<_, String>(0)?, "code": row.get::<_, Option<String>>(1)? })),
            )
            .optional()?,
        None => None,
    };

    let lines: Vec<Value> = line_rows
        .iter()
        .map(|line| {
            json!({
                "id": line.id,
                "description": line.description,
                "hsn": line.hsn,
                "uom": line.uom,
                "qtyE4": line.qty_e4,
                "rateMinor": line.rate_minor,
                "discountBps": line.discount_bps,
                "gstRateBps": line.gst_rate_bps,
                "taxableMinor": line.taxable_minor,
                "cgstMinor": line.cgst_minor,
                "sgstMinor": line.sgst_minor,
                "igstMinor": line.igst_minor,
                "cessMinor": line.cess_minor,
                "totalMinor": line.total_minor
            })
        })
        .collect();

    let company_state = company.get("stateCode").and_then(|value| value.as_str()).unwrap_or("");
    let party_state = party
        .as_ref()
        .and_then(|value| value.get("stateCode"))
        .and_then(|value| value.as_str());
    let place_of_supply = header
        .place_of_supply_state_code
        .clone()
        .or_else(|| party_state.map(|value| value.to_string()))
        .unwrap_or_else(|| company_state.to_string());

    let currency = company
        .get("currency")
        .and_then(|value| value.as_str())
        .unwrap_or("INR")
        .to_string();
    let tax_total = header
        .cgst_minor
        .saturating_add(header.sgst_minor)
        .saturating_add(header.igst_minor)
        .saturating_add(header.cess_minor);
    let inter_state = line_rows.iter().any(|line| line.igst_minor != 0);
    let terms = term_lines(company.get("invoiceTerms").and_then(|value| value.as_str()));
    let status = if header.status == "CANCELLED" { "CANCELLED" } else { "POSTED" };

    Ok(Some(json!({
        "id": header.id,
        "type": header.voucher_type,
        "number": header.number,
        "numberSource": header.number_source,
        "date": header.date,
        "dueDate": header.due_date,
        "referenceNo": header.reference_no,
        "narration": header.narration,
        "placeOfSupplyStateCode": place_of_supply,
        "status": status,
        "company": company,
        "party": party,
        "lines": lines,
        "taxSlabs": tax_slabs(&line_rows),
        "bank": bank,
        "totals": {
            "taxableMinor": header.taxable_minor,
            "cgstMinor": header.cgst_minor,
            "sgstMinor": header.sgst_minor,
            "igstMinor": header.igst_minor,
            "cessMinor": header.cess_minor,
            "discountMinor": header.discount_minor,
            "roundOffMinor": header.round_off_minor,
            "totalMinor": header.total_minor,
            "totalQtyE4": header.total_qty_e4
        },
        // Additive helpers for the PDF renderer: the sheet prints the amount in
        // words, the term list and whether the grid needs an IGST column.
        "amountInWords": amount_in_words(header.total_minor, &currency),
        "taxInWords": amount_in_words(tax_total, &currency),
        "terms": terms,
        "interState": inter_state
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spells_amounts_in_the_indian_system() {
        assert_eq!(amount_in_words(0, "INR"), "Rupees Zero Only");
        assert_eq!(amount_in_words(455_000, "INR"), "Rupees Four Thousand Five Hundred Fifty Only");
        assert_eq!(
            amount_in_words(237_118, "INR"),
            "Rupees Two Thousand Three Hundred Seventy One and Eighteen Paise Only"
        );
        assert_eq!(
            amount_in_words(-123_456_789, "INR"),
            "Minus Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Paise Only"
        );
    }

    #[test]
    fn splits_terms_into_non_empty_lines() {
        assert_eq!(term_lines(Some("One\n\n Two \r\n")), vec!["One".to_string(), "Two".to_string()]);
        assert!(term_lines(None).is_empty());
    }

    #[test]
    fn groups_tax_slabs_by_rate() {
        let lines = vec![
            LineTaxRow {
                id: 1,
                description: "A".into(),
                hsn: None,
                uom: None,
                qty_e4: 10_000,
                rate_minor: 10_000,
                discount_bps: 0,
                gst_rate_bps: 1_800,
                taxable_minor: 10_000,
                cgst_minor: 900,
                sgst_minor: 900,
                igst_minor: 0,
                cess_minor: 0,
                total_minor: 11_800,
            },
            LineTaxRow {
                id: 2,
                description: "B".into(),
                hsn: None,
                uom: None,
                qty_e4: 10_000,
                rate_minor: 5_000,
                discount_bps: 0,
                gst_rate_bps: 500,
                taxable_minor: 5_000,
                cgst_minor: 125,
                sgst_minor: 125,
                igst_minor: 0,
                cess_minor: 0,
                total_minor: 5_250,
            },
        ];
        let slabs = tax_slabs(&lines);
        assert_eq!(slabs.len(), 2);
        assert_eq!(slabs[0]["gstRateBps"], 500);
        assert_eq!(slabs[1]["gstRateBps"], 1_800);
        assert_eq!(slabs[1]["taxMinor"], 1_800);
    }
}
