//! Invoice PDF built in Rust.
//!
//! Electron rendered `#/print/vouchers/:id` in a hidden window and printed it
//! with `printToPDF`. Tauri has no equivalent, so the layout of
//! `InvoiceSheet.tsx` is reproduced directly with `printpdf`: two A4 copies
//! (`ORIGINAL FOR RECIPIENT`, `DUPLICATE FOR TRANSPORTER`), the supplier/buyer
//! panels, the item grid, the totals, the amount in words, the HSN/SAC-wise tax
//! summary, terms, the declaration and the signature block.
//!
//! Y coordinates here are measured from the top of the page in millimetres,
//! which matches the CSS layout; `printpdf` counts from the bottom and is
//! flipped in [`Sheet::text`] and [`Sheet::rule`].

use printpdf::{
    BuiltinFont, Color, IndirectFontRef, Line, Mm, PdfDocument, PdfDocumentReference,
    PdfLayerReference, Point, Rgb,
};
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::export::invoice_format::{
    amount_in_words, format_amount, format_date, format_percent, format_qty, state_label,
};
use crate::json::{array, field};

const PAGE_W: f32 = 210.0;
const PAGE_H: f32 = 297.0;
const MARGIN: f32 = 12.0;
const LEFT: f32 = MARGIN;
const RIGHT: f32 = PAGE_W - MARGIN;
const TOP: f32 = 10.0;
const BOTTOM: f32 = 287.0;
const TABLE_BOTTOM: f32 = 268.0;

/// Millimetres per typographic point.
const MM_PER_PT: f32 = 0.352_777_8;

/// GST Rule 48(1): the first copy goes to the recipient, the second travels
/// with the goods. One per A4 page, in this order.
const COPY_CAPTIONS: [&str; 2] = ["ORIGINAL FOR RECIPIENT", "DUPLICATE FOR TRANSPORTER"];

const DOCUMENT_TITLE: &str = "TAX INVOICE";

fn pdf_error(err: printpdf::Error) -> AppError {
    AppError::internal(format!("Could not build the invoice PDF: {err}"))
}

fn ink() -> Color {
    Color::Rgb(Rgb::new(0.08, 0.10, 0.12, None))
}

fn muted() -> Color {
    Color::Rgb(Rgb::new(0.42, 0.45, 0.48, None))
}

fn line_color() -> Color {
    Color::Rgb(Rgb::new(0.16, 0.18, 0.20, None))
}

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

struct Company {
    name: String,
    legal_name: Option<String>,
    gstin: Option<String>,
    pan: Option<String>,
    state_code: String,
    address: Option<String>,
    city: Option<String>,
    pincode: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    currency: String,
    invoice_terms: Option<String>,
}

struct Party {
    name: String,
    gstin: Option<String>,
    pan: Option<String>,
    state_code: Option<String>,
    billing_address: Option<String>,
    shipping_address: Option<String>,
    phone: Option<String>,
    email: Option<String>,
}

struct LineItem {
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
}

struct Totals {
    taxable_minor: i64,
    cgst_minor: i64,
    sgst_minor: i64,
    igst_minor: i64,
    cess_minor: i64,
    round_off_minor: i64,
    total_minor: i64,
}

struct Slab {
    gst_rate_bps: i64,
    taxable_minor: i64,
    cgst_minor: i64,
    sgst_minor: i64,
    igst_minor: i64,
    cess_minor: i64,
    tax_minor: i64,
}

struct HsnRow {
    hsn: Option<String>,
    gst_rate_bps: i64,
    taxable_minor: i64,
    cgst_minor: i64,
    sgst_minor: i64,
    igst_minor: i64,
    cess_minor: i64,
    tax_minor: i64,
}

struct Bank {
    name: String,
    code: Option<String>,
}

/// One printed party block. The issuer and the buyer are the same shape so the
/// sales/purchase swap only changes where the values come from.
struct Block {
    name: String,
    legal_name: Option<String>,
    address: Option<String>,
    city: Option<String>,
    pincode: Option<String>,
    gstin: Option<String>,
    pan: Option<String>,
    state_code: Option<String>,
    phone: Option<String>,
    email: Option<String>,
}

struct Document {
    is_purchase: bool,
    number: String,
    date: String,
    due_date: Option<String>,
    reference_no: Option<String>,
    narration: Option<String>,
    place_of_supply: Option<String>,
    cancelled: bool,
    company: Company,
    party: Option<Party>,
    lines: Vec<LineItem>,
    slabs: Vec<Slab>,
    bank: Option<Bank>,
    totals: Totals,
}

fn text_of(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}

fn opt_text_of(value: &Value, key: &str) -> Option<String> {
    let text = text_of(value, key);
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn money_of(value: &Value, key: &str) -> i64 {
    match value.get(key) {
        Some(Value::Number(number)) => number
            .as_i64()
            .or_else(|| number.as_f64().map(|value| value.trunc() as i64))
            .unwrap_or(0),
        _ => 0,
    }
}

fn company_from(value: &Value) -> Company {
    Company {
        name: text_of(value, "name"),
        legal_name: opt_text_of(value, "legalName"),
        gstin: opt_text_of(value, "gstin"),
        pan: opt_text_of(value, "pan"),
        state_code: text_of(value, "stateCode"),
        address: opt_text_of(value, "address"),
        city: opt_text_of(value, "city"),
        pincode: opt_text_of(value, "pincode"),
        phone: opt_text_of(value, "phone"),
        email: opt_text_of(value, "email"),
        currency: {
            let currency = text_of(value, "currency");
            if currency.is_empty() {
                "INR".to_string()
            } else {
                currency
            }
        },
        invoice_terms: opt_text_of(value, "invoiceTerms"),
    }
}

fn party_from(value: &Value) -> Party {
    Party {
        name: text_of(value, "name"),
        gstin: opt_text_of(value, "gstin"),
        pan: opt_text_of(value, "pan"),
        state_code: opt_text_of(value, "stateCode"),
        billing_address: opt_text_of(value, "billingAddress"),
        shipping_address: opt_text_of(value, "shippingAddress"),
        phone: opt_text_of(value, "phone"),
        email: opt_text_of(value, "email"),
    }
}

fn line_from(value: &Value) -> LineItem {
    LineItem {
        description: text_of(value, "description"),
        hsn: opt_text_of(value, "hsn"),
        uom: opt_text_of(value, "uom"),
        qty_e4: money_of(value, "qtyE4"),
        rate_minor: money_of(value, "rateMinor"),
        discount_bps: money_of(value, "discountBps"),
        gst_rate_bps: money_of(value, "gstRateBps"),
        taxable_minor: money_of(value, "taxableMinor"),
        cgst_minor: money_of(value, "cgstMinor"),
        sgst_minor: money_of(value, "sgstMinor"),
        igst_minor: money_of(value, "igstMinor"),
        cess_minor: money_of(value, "cessMinor"),
    }
}

fn slab_from(value: &Value) -> Slab {
    Slab {
        gst_rate_bps: money_of(value, "gstRateBps"),
        taxable_minor: money_of(value, "taxableMinor"),
        cgst_minor: money_of(value, "cgstMinor"),
        sgst_minor: money_of(value, "sgstMinor"),
        igst_minor: money_of(value, "igstMinor"),
        cess_minor: money_of(value, "cessMinor"),
        tax_minor: money_of(value, "taxMinor"),
    }
}

impl Document {
    fn from_json(value: &Value) -> Self {
        let is_purchase = text_of(value, "type") == "PURCHASE";
        let company = company_from(field(value, "company"));
        let party_value = field(value, "party");
        let party = if party_value.is_null() {
            None
        } else {
            Some(party_from(party_value))
        };

        let lines: Vec<LineItem> = array(value, "lines").iter().map(line_from).collect();
        let mut slabs: Vec<Slab> = array(value, "taxSlabs").iter().map(slab_from).collect();
        if slabs.is_empty() && !lines.is_empty() {
            // Defensive: never print an invoice with items but no tax analysis.
            slabs = build_tax_slabs(&lines);
        }

        let bank_value = field(value, "bank");
        let bank = if bank_value.is_null() {
            None
        } else {
            Some(Bank {
                name: text_of(bank_value, "name"),
                code: opt_text_of(bank_value, "code"),
            })
        };

        let totals_value = field(value, "totals");
        let totals = Totals {
            taxable_minor: money_of(totals_value, "taxableMinor"),
            cgst_minor: money_of(totals_value, "cgstMinor"),
            sgst_minor: money_of(totals_value, "sgstMinor"),
            igst_minor: money_of(totals_value, "igstMinor"),
            cess_minor: money_of(totals_value, "cessMinor"),
            round_off_minor: money_of(totals_value, "roundOffMinor"),
            total_minor: money_of(totals_value, "totalMinor"),
        };

        Self {
            is_purchase,
            number: text_of(value, "number"),
            date: text_of(value, "date"),
            due_date: opt_text_of(value, "dueDate"),
            reference_no: opt_text_of(value, "referenceNo"),
            narration: opt_text_of(value, "narration"),
            place_of_supply: opt_text_of(value, "placeOfSupplyStateCode"),
            cancelled: text_of(value, "status") == "CANCELLED",
            company,
            party,
            lines,
            slabs,
            bank,
            totals,
        }
    }

    fn inter_state(&self) -> bool {
        self.lines.iter().any(|line| line.igst_minor != 0)
    }

    /// Net tax on the document, including cess.
    fn tax_total(&self) -> i64 {
        self.totals.cgst_minor
            + self.totals.sgst_minor
            + self.totals.igst_minor
            + self.totals.cess_minor
    }

    fn issuer(&self) -> Block {
        if self.is_purchase {
            if let Some(party) = &self.party {
                return Block {
                    name: party.name.clone(),
                    legal_name: None,
                    address: party.billing_address.clone(),
                    city: None,
                    pincode: None,
                    gstin: party.gstin.clone(),
                    pan: party.pan.clone(),
                    state_code: party.state_code.clone(),
                    phone: party.phone.clone(),
                    email: party.email.clone(),
                };
            }
        }
        Block {
            name: self.company.name.clone(),
            legal_name: self.company.legal_name.clone(),
            address: self.company.address.clone(),
            city: self.company.city.clone(),
            pincode: self.company.pincode.clone(),
            gstin: self.company.gstin.clone(),
            pan: self.company.pan.clone(),
            state_code: Some(self.company.state_code.clone()).filter(|code| !code.is_empty()),
            phone: self.company.phone.clone(),
            email: self.company.email.clone(),
        }
    }

    fn buyer(&self) -> Block {
        if self.is_purchase {
            return Block {
                name: self.company.name.clone(),
                legal_name: self.company.legal_name.clone(),
                address: Some(address_text(&[
                    self.company.address.as_deref(),
                    self.company.city.as_deref(),
                    self.company.pincode.as_deref(),
                ]))
                .filter(|text| !text.is_empty()),
                city: self.company.city.clone(),
                pincode: self.company.pincode.clone(),
                gstin: self.company.gstin.clone(),
                pan: self.company.pan.clone(),
                state_code: Some(self.company.state_code.clone()).filter(|code| !code.is_empty()),
                phone: self.company.phone.clone(),
                email: self.company.email.clone(),
            };
        }

        match &self.party {
            Some(party) => Block {
                name: party.name.clone(),
                legal_name: None,
                address: party.billing_address.clone(),
                city: None,
                pincode: None,
                gstin: party.gstin.clone(),
                pan: party.pan.clone(),
                state_code: party.state_code.clone(),
                phone: party.phone.clone(),
                email: party.email.clone(),
            },
            None => Block {
                name: "Cash sale".to_string(),
                legal_name: None,
                address: None,
                city: None,
                pincode: None,
                gstin: None,
                pan: None,
                state_code: None,
                phone: None,
                email: None,
            },
        }
    }

    fn invoice_number(&self) -> String {
        if self.is_purchase {
            self.reference_no
                .clone()
                .unwrap_or_else(|| self.number.clone())
        } else {
            self.number.clone()
        }
    }

    fn number_label(&self) -> &'static str {
        if self.is_purchase {
            "Supplier Bill No."
        } else {
            "Invoice No."
        }
    }

    fn delivery_address(&self) -> String {
        if self.is_purchase {
            address_text(&[
                self.company.address.as_deref(),
                self.company.city.as_deref(),
                self.company.pincode.as_deref(),
            ])
        } else {
            self.party
                .as_ref()
                .and_then(|party| {
                    party
                        .shipping_address
                        .clone()
                        .or_else(|| party.billing_address.clone())
                })
                .unwrap_or_default()
        }
    }

    fn delivery_state(&self) -> Option<String> {
        if self.is_purchase {
            Some(self.company.state_code.clone())
        } else {
            self.party
                .as_ref()
                .and_then(|party| party.state_code.clone())
        }
    }

    fn jurisdiction(&self) -> String {
        let value = if self.is_purchase {
            self.party
                .as_ref()
                .and_then(|party| state_label(party.state_code.as_deref().unwrap_or("")))
                .or_else(|| self.company.city.clone())
        } else {
            self.company
                .city
                .clone()
                .or_else(|| state_label(&self.company.state_code))
        };

        match value {
            Some(value) => format!("Subject to {value} jurisdiction"),
            None => "Subject to jurisdiction".to_string(),
        }
    }

    fn term_lines(&self) -> Vec<String> {
        if self.is_purchase {
            return Vec::new();
        }
        self.company
            .invoice_terms
            .as_deref()
            .unwrap_or("")
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(str::to_string)
            .collect()
    }
}

// ---------------------------------------------------------------------------
// Derived tables
// ---------------------------------------------------------------------------

fn build_tax_slabs(lines: &[LineItem]) -> Vec<Slab> {
    let mut slabs: Vec<Slab> = Vec::new();
    for line in lines {
        let rate = line.gst_rate_bps;
        let existing = slabs.iter().position(|slab| slab.gst_rate_bps == rate);
        let index = match existing {
            Some(index) => index,
            None => {
                slabs.push(Slab {
                    gst_rate_bps: rate,
                    taxable_minor: 0,
                    cgst_minor: 0,
                    sgst_minor: 0,
                    igst_minor: 0,
                    cess_minor: 0,
                    tax_minor: 0,
                });
                slabs.len() - 1
            }
        };
        let slab = &mut slabs[index];
        slab.taxable_minor += line.taxable_minor;
        slab.cgst_minor += line.cgst_minor;
        slab.sgst_minor += line.sgst_minor;
        slab.igst_minor += line.igst_minor;
        slab.cess_minor += line.cess_minor;
        slab.tax_minor += line.cgst_minor + line.sgst_minor + line.igst_minor + line.cess_minor;
    }

    slabs.retain(|slab| slab.taxable_minor != 0 || slab.tax_minor != 0);
    slabs.sort_by_key(|slab| slab.gst_rate_bps);
    slabs
}

/// Groups lines by HSN/SAC and GST rate. Two lines with the same HSN but
/// different rates stay separate, because the rate columns would otherwise
/// contradict the taxable value beside them.
fn build_hsn_summary(lines: &[LineItem]) -> Vec<HsnRow> {
    let mut rows: Vec<HsnRow> = Vec::new();
    for line in lines {
        let hsn = line
            .hsn
            .as_deref()
            .map(str::trim)
            .filter(|hsn| !hsn.is_empty())
            .map(str::to_string);
        let existing = rows
            .iter()
            .position(|row| row.hsn == hsn && row.gst_rate_bps == line.gst_rate_bps);
        let index = match existing {
            Some(index) => index,
            None => {
                rows.push(HsnRow {
                    hsn,
                    gst_rate_bps: line.gst_rate_bps,
                    taxable_minor: 0,
                    cgst_minor: 0,
                    sgst_minor: 0,
                    igst_minor: 0,
                    cess_minor: 0,
                    tax_minor: 0,
                });
                rows.len() - 1
            }
        };
        let row = &mut rows[index];
        row.taxable_minor += line.taxable_minor;
        row.cgst_minor += line.cgst_minor;
        row.sgst_minor += line.sgst_minor;
        row.igst_minor += line.igst_minor;
        row.cess_minor += line.cess_minor;
        row.tax_minor += line.cgst_minor + line.sgst_minor + line.igst_minor + line.cess_minor;
    }

    rows.retain(|row| row.taxable_minor != 0 || row.tax_minor != 0);
    rows.sort_by(|left, right| {
        let left_hsn = left.hsn.as_deref().unwrap_or("");
        let right_hsn = right.hsn.as_deref().unwrap_or("");
        left_hsn
            .cmp(right_hsn)
            .then(left.gst_rate_bps.cmp(&right.gst_rate_bps))
    });
    rows
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

fn text_width(text: &str, size: f32) -> f32 {
    text.chars().count() as f32 * size * 0.5 * MM_PER_PT
}

/// Greedy word wrap against an approximate Helvetica advance width. The PDF
/// has no text measurement API without font metrics, and the invoice only needs
/// to avoid overflow, not to justify.
fn wrap(text: &str, width_mm: f32, size: f32) -> Vec<String> {
    let limit = (width_mm / (size * 0.5 * MM_PER_PT)).floor().max(1.0) as usize;
    let mut lines: Vec<String> = Vec::new();
    let mut current = String::new();

    for word in text.split_whitespace() {
        let word_len = word.chars().count();
        if current.is_empty() {
            if word_len <= limit {
                current = word.to_string();
            } else {
                let mut chunk = String::new();
                for ch in word.chars() {
                    if chunk.chars().count() >= limit {
                        lines.push(std::mem::take(&mut chunk));
                    }
                    chunk.push(ch);
                }
                current = chunk;
            }
        } else if current.chars().count() + 1 + word_len <= limit {
            current.push(' ');
            current.push_str(word);
        } else {
            lines.push(std::mem::take(&mut current));
            current = word.to_string();
        }
    }

    if !current.is_empty() {
        lines.push(current);
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

fn truncate(text: &str, width_mm: f32, size: f32) -> String {
    if text_width(text, size) <= width_mm {
        return text.to_string();
    }
    let limit = (width_mm / (size * 0.5 * MM_PER_PT)).floor().max(1.0) as usize;
    let keep = limit.saturating_sub(2);
    let mut out: String = text.chars().take(keep).collect();
    out.push_str("..");
    out
}

fn dash(value: Option<&str>) -> String {
    match value {
        Some(value) if !value.trim().is_empty() => value.trim().to_string(),
        _ => "—".to_string(),
    }
}

fn state_text(code: Option<&str>) -> String {
    state_label(code.unwrap_or("")).unwrap_or_else(|| "—".to_string())
}

fn address_text(parts: &[Option<&str>]) -> String {
    parts
        .iter()
        .flatten()
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}

/// Column x offsets and widths for a table that must fill the content width
/// exactly. Weights keep the tables aligned whatever columns are visible.
fn columns(weights: &[f32]) -> Vec<(f32, f32)> {
    let total: f32 = weights.iter().sum();
    let mut x = LEFT;
    let mut result = Vec::with_capacity(weights.len());
    for weight in weights {
        let width = weight / total * (RIGHT - LEFT);
        result.push((x, width));
        x += width;
    }
    result
}

// ---------------------------------------------------------------------------
// Page canvas
// ---------------------------------------------------------------------------

struct Fonts {
    regular: IndirectFontRef,
    bold: IndirectFontRef,
}

struct Sheet {
    doc: PdfDocumentReference,
    layer: PdfLayerReference,
    fonts: Fonts,
    y: f32,
}

impl Sheet {
    fn text(&self, x: f32, y: f32, size: f32, bold: bool, color: Color, text: &str) {
        if text.is_empty() {
            return;
        }
        self.layer.set_fill_color(color);
        let font = if bold {
            &self.fonts.bold
        } else {
            &self.fonts.regular
        };
        self.layer.use_text(text, size, Mm(x), Mm(PAGE_H - y), font);
    }

    fn text_right(&self, right: f32, y: f32, size: f32, bold: bool, color: Color, text: &str) {
        let x = (right - text_width(text, size)).max(LEFT);
        self.text(x, y, size, bold, color, text);
    }

    fn text_center(&self, center: f32, y: f32, size: f32, bold: bool, color: Color, text: &str) {
        let x = center - text_width(text, size) / 2.0;
        self.text(x, y, size, bold, color, text);
    }

    fn rule(&self, x1: f32, x2: f32, y: f32) {
        self.layer.set_outline_color(line_color());
        self.layer.set_outline_thickness(0.35);
        self.layer.add_line(Line {
            points: vec![
                (Point::new(Mm(x1), Mm(PAGE_H - y)), false),
                (Point::new(Mm(x2), Mm(PAGE_H - y)), false),
            ],
            is_closed: false,
        });
    }

    fn vertical(&self, x: f32, top: f32, bottom: f32) {
        self.layer.set_outline_color(line_color());
        self.layer.set_outline_thickness(0.25);
        self.layer.add_line(Line {
            points: vec![
                (Point::new(Mm(x), Mm(PAGE_H - top)), false),
                (Point::new(Mm(x), Mm(PAGE_H - bottom)), false),
            ],
            is_closed: false,
        });
    }

    fn rect(&self, left: f32, top: f32, right: f32, bottom: f32) {
        self.rule(left, right, top);
        self.rule(left, right, bottom);
        self.vertical(left, top, bottom);
        self.vertical(right, top, bottom);
    }

    fn add_page(&mut self) {
        let (page, layer) = self.doc.add_page(Mm(PAGE_W), Mm(PAGE_H), "Invoice");
        let next = self.doc.get_page(page).get_layer(layer);
        self.layer = next;
        self.y = TOP;
    }

    /// Starts a continuation page with a compact header, so a very long invoice
    /// still reads as the same document.
    fn continue_page(&mut self, caption: &str) {
        self.add_page();
        self.y = 13.0;
        self.text_center(PAGE_W / 2.0, self.y, 12.0, true, ink(), DOCUMENT_TITLE);
        self.text_right(RIGHT, self.y, 7.5, false, muted(), caption);
        self.y = 17.0;
        self.rule(LEFT, RIGHT, self.y);
        self.y = 22.0;
    }

    fn ensure(&mut self, needed: f32, caption: &str) {
        if self.y + needed > BOTTOM {
            self.continue_page(caption);
        }
    }

    fn finish(self) -> AppResult<Vec<u8>> {
        self.doc.save_to_bytes().map_err(pdf_error)
    }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

fn draw_copy(sheet: &mut Sheet, document: &Document, caption: &str, page: u32, pages: u32) {
    let inter_state = document.inter_state();
    let issuer = document.issuer();
    let buyer = document.buyer();
    let hsn_rows = build_hsn_summary(&document.lines);
    let has_cess = hsn_rows.iter().any(|row| row.cess_minor != 0);
    let tax_total = document.tax_total();

    sheet.y = 13.0;
    sheet.text_center(PAGE_W / 2.0, sheet.y, 15.0, true, ink(), DOCUMENT_TITLE);
    sheet.text_right(RIGHT, sheet.y, 8.0, false, muted(), caption);

    if document.cancelled {
        sheet.text_center(
            PAGE_W / 2.0,
            150.0,
            42.0,
            true,
            Color::Rgb(Rgb::new(0.85, 0.45, 0.45, None)),
            "CANCELLED",
        );
    }

    sheet.y = 17.0;
    sheet.rule(LEFT, RIGHT, sheet.y);
    sheet.y = 21.5;

    let supplier_top = sheet.y;
    let mut supplier_y = supplier_top;
    sheet.text(LEFT, supplier_y, 6.5, false, muted(), "SUPPLIER");
    supplier_y += 4.4;
    sheet.text(LEFT, supplier_y, 11.0, true, ink(), &issuer.name);
    supplier_y += 5.4;
    if let Some(legal_name) = &issuer.legal_name {
        if legal_name != &issuer.name {
            sheet.text(LEFT, supplier_y, 8.0, false, ink(), legal_name);
            supplier_y += 4.0;
        }
    }
    if let Some(address) = &issuer.address {
        for line in wrap(address, 112.0, 8.0) {
            sheet.text(LEFT, supplier_y, 8.0, false, ink(), &line);
            supplier_y += 3.9;
        }
    }
    let city_line = address_text(&[issuer.city.as_deref(), issuer.pincode.as_deref()]);
    if !city_line.is_empty() {
        sheet.text(LEFT, supplier_y, 8.0, false, ink(), &city_line);
        supplier_y += 3.9;
    }
    supplier_y += 1.2;
    sheet.text(
        LEFT,
        supplier_y,
        8.0,
        false,
        ink(),
        &format!("Phone: {}", dash(issuer.phone.as_deref())),
    );
    supplier_y += 4.0;
    sheet.text(
        LEFT,
        supplier_y,
        8.0,
        false,
        ink(),
        &format!("Email: {}", dash(issuer.email.as_deref())),
    );
    supplier_y += 4.0;
    sheet.text(
        LEFT,
        supplier_y,
        8.0,
        false,
        ink(),
        &format!("GSTIN/UIN: {}", dash(issuer.gstin.as_deref())),
    );
    supplier_y += 4.0;
    sheet.text(
        LEFT,
        supplier_y,
        8.0,
        false,
        ink(),
        &format!("PAN/IT No.: {}", dash(issuer.pan.as_deref())),
    );
    supplier_y += 4.0;
    sheet.text(
        LEFT,
        supplier_y,
        8.0,
        false,
        ink(),
        &format!("State: {}", state_text(issuer.state_code.as_deref())),
    );
    supplier_y += 4.0;

    let meta_bottom = draw_meta_grid(sheet, document, supplier_top);

    sheet.y = supplier_y.max(meta_bottom) + 4.0;
    draw_buyer(sheet, &buyer);
    draw_lines(sheet, document, caption);
    draw_bottom(
        sheet,
        document,
        &issuer,
        inter_state,
        has_cess,
        &hsn_rows,
        tax_total,
        caption,
    );
    draw_footer(sheet, document, caption, page, pages);
}

/// The right-hand Tally grid: two label/value columns, plus the full-width
/// place of delivery on a sales invoice.
fn draw_meta_grid(sheet: &Sheet, document: &Document, top: f32) -> f32 {
    let column_x = [130.0, 164.0];
    let column_width = 32.0;
    let mut y = top;

    let mut items: Vec<(String, String)> = Vec::new();
    items.push((
        document.number_label().to_string(),
        document.invoice_number(),
    ));
    items.push(("Dated".to_string(), format_date(&document.date)));

    if document.is_purchase {
        items.push(("Voucher No.".to_string(), document.number.clone()));
        items.push((
            "Place of Supply".to_string(),
            state_text(document.place_of_supply.as_deref()),
        ));
        items.push(("Reference No. & Date".to_string(), String::new()));
        items.push((
            "Other References".to_string(),
            document.narration.clone().unwrap_or_default(),
        ));
    } else {
        items.push(("Delivery Note".to_string(), String::new()));
        items.push(("Mode of Payment".to_string(), String::new()));
        items.push((
            "Supplier's Ref.".to_string(),
            document.reference_no.clone().unwrap_or_default(),
        ));
        items.push((
            "Other Reference".to_string(),
            document.narration.clone().unwrap_or_default(),
        ));
        items.push(("Buyer's Order No.".to_string(), String::new()));
        items.push(("Dated".to_string(), String::new()));
        items.push(("Despatch Doc No.".to_string(), String::new()));
        items.push(("Delivery Note Date".to_string(), String::new()));
        items.push(("Despatched Through".to_string(), String::new()));
        items.push(("Terms of Delivery".to_string(), String::new()));
    }

    for row in items.chunks(2) {
        for (index, (label, value)) in row.iter().enumerate() {
            let x = column_x[index];
            sheet.text(x, y, 6.2, false, muted(), label);
            let value = truncate(&dash(Some(value.as_str())), column_width, 7.4);
            sheet.text_right(x + column_width, y + 3.4, 7.4, false, ink(), &value);
        }
        y += 8.2;
    }

    if document.is_purchase {
        return y;
    }

    // Place of Delivery spans the full grid width.
    sheet.text(column_x[0], y, 6.2, false, muted(), "Place of Delivery");
    y += 3.4;
    let delivery = document.delivery_address();
    let mut address = if delivery.is_empty() {
        "—".to_string()
    } else {
        delivery
    };
    address.push_str(&format!(
        "  ·  State: {}",
        state_text(document.delivery_state().as_deref())
    ));
    for line in wrap(&address, RIGHT - column_x[0], 7.2) {
        sheet.text(column_x[0], y, 7.2, false, ink(), &line);
        y += 3.6;
    }

    if let Some(due_date) = &document.due_date {
        sheet.text(
            column_x[0],
            y + 0.6,
            7.2,
            true,
            ink(),
            &format!("Due {}", format_date(due_date)),
        );
        y += 4.4;
    }

    y + 1.0
}

fn draw_buyer(sheet: &mut Sheet, buyer: &Block) {
    let top = sheet.y;
    let mut y = top + 4.2;

    sheet.text(LEFT, y, 6.5, false, muted(), "BUYER");
    y += 4.8;
    sheet.text(LEFT, y, 9.5, true, ink(), &buyer.name);
    y += 4.8;

    let address = dash(buyer.address.as_deref());
    for line in wrap(&address, RIGHT - LEFT - 4.0, 8.0) {
        sheet.text(LEFT + 1.5, y, 8.0, false, ink(), &line);
        y += 3.9;
    }

    sheet.text(
        LEFT + 1.5,
        y,
        7.6,
        false,
        ink(),
        &format!(
            "Phone: {}    Email: {}",
            dash(buyer.phone.as_deref()),
            dash(buyer.email.as_deref())
        ),
    );
    y += 4.0;
    sheet.text(
        LEFT + 1.5,
        y,
        7.6,
        false,
        ink(),
        &format!(
            "GSTIN/UIN: {}    PAN/IT No.: {}    State: {}",
            dash(buyer.gstin.as_deref()),
            dash(buyer.pan.as_deref()),
            state_text(buyer.state_code.as_deref())
        ),
    );
    y += 4.4;

    sheet.rect(LEFT, top, RIGHT, y);
    sheet.y = y + 4.5;
}

const TABLE_WEIGHTS: [f32; 8] = [6.0, 40.0, 13.0, 11.0, 15.0, 8.0, 10.0, 19.0];
const TABLE_HEAD: [&str; 8] = [
    "S.No",
    "Description of Goods",
    "HSN/SAC",
    "Quantity",
    "Rate",
    "per",
    "Disc. %",
    "Amount",
];

fn draw_table_header(sheet: &mut Sheet) {
    let columns = columns(&TABLE_WEIGHTS);
    let top = sheet.y;
    let height = 7.0;
    let baseline = top + 4.8;

    for (index, (x, width)) in columns.iter().enumerate() {
        let label = TABLE_HEAD[index];
        if index == 1 {
            sheet.text(x + 1.5, baseline, 7.2, true, ink(), label);
        } else if index == 4 || index == 7 {
            sheet.text_right(x + width - 1.5, baseline, 7.2, true, ink(), label);
        } else {
            sheet.text_center(x + width / 2.0, baseline, 7.2, true, ink(), label);
        }
    }

    sheet.rule(LEFT, RIGHT, top);
    sheet.rule(LEFT, RIGHT, top + height);
    for (x, _) in columns.iter().skip(1) {
        sheet.vertical(*x, top, top + height);
    }
    sheet.y = top + height;
}

fn draw_lines(sheet: &mut Sheet, document: &Document, caption: &str) {
    sheet.ensure(24.0, caption);
    draw_table_header(sheet);
    let columns = columns(&TABLE_WEIGHTS);

    for (index, line) in document.lines.iter().enumerate() {
        let description_lines = wrap(&line.description, columns[1].1 - 4.0, 7.4);
        let height = (description_lines.len() as f32 * 3.6 + 2.8).max(7.2);

        if sheet.y + height > TABLE_BOTTOM {
            sheet.continue_page(caption);
            draw_table_header(sheet);
        }

        let top = sheet.y;
        let baseline = top + 4.6;

        sheet.text_center(
            columns[0].0 + columns[0].1 / 2.0,
            baseline,
            7.4,
            false,
            ink(),
            &(index + 1).to_string(),
        );
        for (offset, text) in description_lines.iter().enumerate() {
            sheet.text(
                columns[1].0 + 1.5,
                top + 4.4 + offset as f32 * 3.6,
                7.4,
                false,
                ink(),
                text,
            );
        }
        sheet.text_center(
            columns[2].0 + columns[2].1 / 2.0,
            baseline,
            7.4,
            false,
            ink(),
            &dash(line.hsn.as_deref()),
        );
        sheet.text_center(
            columns[3].0 + columns[3].1 / 2.0,
            baseline,
            7.4,
            false,
            ink(),
            &format_qty(line.qty_e4),
        );
        sheet.text_right(
            columns[4].0 + columns[4].1 - 1.5,
            baseline,
            7.4,
            false,
            ink(),
            &format_amount(line.rate_minor),
        );
        sheet.text_center(
            columns[5].0 + columns[5].1 / 2.0,
            baseline,
            7.4,
            false,
            ink(),
            &dash(line.uom.as_deref()),
        );
        sheet.text_center(
            columns[6].0 + columns[6].1 / 2.0,
            baseline,
            7.4,
            false,
            ink(),
            &format_percent(line.discount_bps),
        );
        sheet.text_right(
            columns[7].0 + columns[7].1 - 1.5,
            baseline,
            7.4,
            false,
            ink(),
            &format_amount(line.taxable_minor),
        );

        for (x, _) in columns.iter().skip(1) {
            sheet.vertical(*x, top, top + height);
        }
        sheet.rule(LEFT, RIGHT, top + height);
        sheet.y = top + height;
    }

    if document.lines.is_empty() {
        let top = sheet.y;
        sheet.text(LEFT + 2.0, top + 4.6, 7.4, false, muted(), "No items.");
        sheet.rule(LEFT, RIGHT, top + 7.2);
        sheet.y = top + 7.2;
    }
}

#[allow(clippy::too_many_arguments)]
fn draw_bottom(
    sheet: &mut Sheet,
    document: &Document,
    issuer: &Block,
    inter_state: bool,
    has_cess: bool,
    hsn_rows: &[HsnRow],
    tax_total: i64,
    caption: &str,
) {
    sheet.ensure(50.0, caption);
    sheet.y += 4.0;
    let top = sheet.y;

    // Bank block (sales only): a purchase bill keeps the supplier's bank, which
    // we do not store.
    if !document.is_purchase {
        if let Some(bank) = &document.bank {
            sheet.text(LEFT, top, 6.5, false, muted(), "BANK DETAILS");
            sheet.text(LEFT, top + 4.6, 8.2, true, ink(), &bank.name);
            if let Some(code) = &bank.code {
                sheet.text(
                    LEFT,
                    top + 9.0,
                    7.8,
                    false,
                    ink(),
                    &format!("A/c Code: {code}"),
                );
            }
        }
    }

    // Totals: one tax row per rate, so a bill mixing 5% and 18% shows four rows.
    let mut y = top + 1.0;
    let label_x = 138.0;
    sheet.text(label_x, y, 7.6, false, ink(), "Taxable Value");
    sheet.text_right(
        RIGHT,
        y,
        7.6,
        false,
        ink(),
        &format_amount(document.totals.taxable_minor),
    );
    y += 5.0;

    for slab in &document.slabs {
        if inter_state {
            sheet.text(
                label_x,
                y,
                7.6,
                false,
                ink(),
                &format!("IGST @ {}", format_percent(slab.gst_rate_bps)),
            );
            sheet.text_right(RIGHT, y, 7.6, false, ink(), &format_amount(slab.igst_minor));
            y += 5.0;
        } else {
            let half = format_percent(slab.gst_rate_bps / 2);
            sheet.text(label_x, y, 7.6, false, ink(), &format!("CGST @ {half}"));
            sheet.text_right(RIGHT, y, 7.6, false, ink(), &format_amount(slab.cgst_minor));
            y += 5.0;
            sheet.text(label_x, y, 7.6, false, ink(), &format!("SGST @ {half}"));
            sheet.text_right(RIGHT, y, 7.6, false, ink(), &format_amount(slab.sgst_minor));
            y += 5.0;
            if slab.cess_minor != 0 {
                sheet.text(label_x, y, 7.6, false, ink(), "Cess");
                sheet.text_right(RIGHT, y, 7.6, false, ink(), &format_amount(slab.cess_minor));
                y += 5.0;
            }
        }
    }

    if document.totals.round_off_minor != 0 {
        sheet.text(label_x, y, 7.6, false, ink(), "Round Off");
        sheet.text_right(
            RIGHT,
            y,
            7.6,
            false,
            ink(),
            &format_amount(document.totals.round_off_minor),
        );
        y += 5.0;
    }

    y += 1.2;
    sheet.rule(label_x, RIGHT, y - 3.4);
    sheet.text(label_x, y + 1.4, 9.2, true, ink(), "Total");
    let currency_prefix = if document.company.currency == "INR" {
        "Rs. "
    } else {
        ""
    };
    sheet.text_right(
        RIGHT,
        y + 1.4,
        9.2,
        true,
        ink(),
        &format!(
            "{currency_prefix}{}",
            format_amount(document.totals.total_minor)
        ),
    );
    y += 6.0;

    sheet.y = y.max(top + 14.0) + 2.0;

    // Amount in words.
    sheet.ensure(16.0, caption);
    sheet.rule(LEFT, RIGHT, sheet.y);
    sheet.y += 4.4;
    sheet.text(LEFT, sheet.y, 6.4, false, muted(), "AMOUNT (IN WORDS)");
    sheet.text_right(RIGHT, sheet.y, 6.8, false, muted(), "E. & E.O.");
    sheet.y += 3.6;
    for line in wrap(
        &amount_in_words(document.totals.total_minor, &document.company.currency),
        RIGHT - LEFT,
        7.8,
    ) {
        sheet.text(LEFT, sheet.y, 7.8, false, ink(), &line);
        sheet.y += 4.0;
    }

    draw_hsn_summary(sheet, document, hsn_rows, inter_state, has_cess, caption);

    if tax_total != 0 {
        sheet.ensure(8.0, caption);
        sheet.y += 2.0;
        let text = format!(
            "Tax Amount (in words): {}",
            amount_in_words(tax_total, &document.company.currency)
        );
        for line in wrap(&text, RIGHT - LEFT, 7.4) {
            sheet.text(LEFT, sheet.y, 7.4, false, ink(), &line);
            sheet.y += 3.8;
        }
    }

    let terms = document.term_lines();
    if !terms.is_empty() {
        sheet.ensure(14.0, caption);
        sheet.y += 2.0;
        sheet.text(LEFT, sheet.y, 6.4, false, muted(), "TERMS & CONDITIONS");
        sheet.y += 4.0;
        for (index, term) in terms.iter().enumerate() {
            for (line_index, line) in
                wrap(&format!("{}. {term}", index + 1), RIGHT - LEFT - 4.0, 7.4)
                    .iter()
                    .enumerate()
            {
                let x = if line_index == 0 { LEFT } else { LEFT + 4.0 };
                sheet.text(x, sheet.y, 7.4, false, ink(), line);
                sheet.y += 3.7;
            }
        }
    }

    draw_declaration(sheet, document, issuer, caption);
}

fn draw_hsn_summary(
    sheet: &mut Sheet,
    document: &Document,
    rows: &[HsnRow],
    inter_state: bool,
    has_cess: bool,
    caption: &str,
) {
    sheet.ensure(10.0 + rows.len() as f32 * 6.0 + 8.0, caption);
    sheet.y += 3.0;
    sheet.text(
        LEFT,
        sheet.y,
        6.4,
        false,
        muted(),
        "HSN/SAC-WISE TAX SUMMARY",
    );
    sheet.y += 3.4;

    let mut weights: Vec<f32> = vec![16.0, 18.0];
    let mut head: Vec<&str> = vec!["HSN/SAC", "Taxable Value"];
    if inter_state {
        weights.extend([12.0, 16.0]);
        head.extend(["IGST Rate", "IGST Amount"]);
    } else {
        weights.extend([11.0, 15.0, 11.0, 15.0]);
        head.extend(["CGST Rate", "CGST Amount", "SGST Rate", "SGST Amount"]);
    }
    if has_cess {
        weights.extend([10.0, 14.0]);
        head.extend(["Cess Rate", "Cess Amount"]);
    }
    weights.push(18.0);
    head.push("Total Tax Amount");

    let columns = columns(&weights);
    let top = sheet.y;
    let head_height = 6.4;
    for (index, (x, width)) in columns.iter().enumerate() {
        sheet.text_center(x + width / 2.0, top + 4.2, 6.6, true, ink(), head[index]);
    }
    sheet.rule(LEFT, RIGHT, top);
    sheet.rule(LEFT, RIGHT, top + head_height);
    sheet.y = top + head_height;

    let amount_cell = |sheet: &Sheet, column: usize, y: f32, value: i64| {
        let (x, width) = columns[column];
        sheet.text_right(x + width - 1.5, y, 7.0, false, ink(), &format_amount(value));
    };
    let rate_cell = |sheet: &Sheet, column: usize, y: f32, value: i64| {
        let (x, width) = columns[column];
        sheet.text_center(
            x + width / 2.0,
            y,
            7.0,
            false,
            ink(),
            &format_percent(value),
        );
    };

    for row in rows {
        let top = sheet.y;
        let baseline = top + 4.4;
        sheet.text(
            LEFT + 1.5,
            baseline,
            7.0,
            false,
            ink(),
            &dash(row.hsn.as_deref()),
        );
        amount_cell(sheet, 1, baseline, row.taxable_minor);
        if inter_state {
            rate_cell(sheet, 2, baseline, row.gst_rate_bps);
            amount_cell(sheet, 3, baseline, row.igst_minor);
        } else {
            rate_cell(sheet, 2, baseline, row.gst_rate_bps / 2);
            amount_cell(sheet, 3, baseline, row.cgst_minor);
            rate_cell(sheet, 4, baseline, row.gst_rate_bps / 2);
            amount_cell(sheet, 5, baseline, row.sgst_minor);
        }
        let total_column = columns.len() - 1;
        if has_cess {
            rate_cell(sheet, total_column - 2, baseline, row.gst_rate_bps);
            amount_cell(sheet, total_column - 1, baseline, row.cess_minor);
        }
        amount_cell(sheet, total_column, baseline, row.tax_minor);
        sheet.rule(LEFT, RIGHT, top + 6.2);
        sheet.y = top + 6.2;
    }

    // Total row.
    let top = sheet.y;
    let baseline = top + 4.6;
    sheet.text(LEFT + 1.5, baseline, 7.2, true, ink(), "Total");
    amount_cell(sheet, 1, baseline, document.totals.taxable_minor);
    if inter_state {
        amount_cell(sheet, 3, baseline, document.totals.igst_minor);
    } else {
        amount_cell(sheet, 3, baseline, document.totals.cgst_minor);
        amount_cell(sheet, 5, baseline, document.totals.sgst_minor);
    }
    let total_column = columns.len() - 1;
    if has_cess {
        amount_cell(
            sheet,
            total_column - 1,
            baseline,
            document.totals.cess_minor,
        );
    }
    amount_cell(sheet, total_column, baseline, document.tax_total());
    sheet.rule(LEFT, RIGHT, top);
    sheet.rule(LEFT, RIGHT, top + 7.0);
    sheet.y = top + 7.0;
}

fn draw_declaration(sheet: &mut Sheet, document: &Document, issuer: &Block, caption: &str) {
    sheet.ensure(30.0, caption);
    sheet.y += 3.0;
    let top = sheet.y;
    let split = LEFT + 118.0;

    sheet.text(LEFT, top + 4.0, 6.4, false, muted(), "DECLARATION");
    let declaration = "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.";
    let mut y = top + 8.0;
    for line in wrap(declaration, split - LEFT - 3.0, 7.2) {
        sheet.text(LEFT, y, 7.2, false, ink(), &line);
        y += 3.6;
    }
    if document.is_purchase {
        sheet.text(
            LEFT,
            y + 2.0,
            7.2,
            false,
            muted(),
            "Customer's Seal and Signature",
        );
    }

    sheet.text(
        split + 4.0,
        top + 4.0,
        7.6,
        false,
        ink(),
        &format!("For {}", issuer.name),
    );
    sheet.text(
        split + 4.0,
        top + 20.0,
        7.6,
        false,
        ink(),
        "Authorised Signatory",
    );

    sheet.rect(LEFT, top, RIGHT, top + 24.0);
    sheet.vertical(split, top, top + 24.0);
    sheet.y = top + 26.0;
}

fn draw_footer(sheet: &Sheet, document: &Document, caption: &str, page: u32, pages: u32) {
    let y = PAGE_H - 8.0;
    sheet.rule(LEFT, RIGHT, y - 4.0);
    sheet.text(LEFT, y, 6.4, false, muted(), &document.jurisdiction());
    sheet.text_center(
        PAGE_W / 2.0,
        y,
        6.4,
        false,
        muted(),
        "This is a Computer Generated Invoice",
    );
    sheet.text_right(
        RIGHT,
        y,
        6.4,
        false,
        muted(),
        &format!("{caption} · Page {page} of {pages}"),
    );
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/// Renders both GST copies of one invoice.
pub fn build(value: &Value) -> AppResult<Vec<u8>> {
    let document = Document::from_json(value);
    let (pdf, page, layer) = PdfDocument::new("Tax Invoice", Mm(PAGE_W), Mm(PAGE_H), "Invoice");
    let fonts = Fonts {
        regular: pdf
            .add_builtin_font(BuiltinFont::Helvetica)
            .map_err(pdf_error)?,
        bold: pdf
            .add_builtin_font(BuiltinFont::HelveticaBold)
            .map_err(pdf_error)?,
    };
    let layer = pdf.get_page(page).get_layer(layer);
    let mut sheet = Sheet {
        doc: pdf,
        layer,
        fonts,
        y: TOP,
    };

    for (index, caption) in COPY_CAPTIONS.iter().enumerate() {
        if index > 0 {
            sheet.add_page();
        }
        draw_copy(
            &mut sheet,
            &document,
            caption,
            index as u32 + 1,
            COPY_CAPTIONS.len() as u32,
        );
    }

    sheet.finish()
}

/// `<party>_<Sales|Purchase>_<number>_<yyyyMMdd-HHmmss>.pdf`, sanitised for
/// Windows so the dialog opens with a usable name.
pub fn default_filename(value: &Value) -> String {
    let document = Document::from_json(value);
    let party = document
        .party
        .as_ref()
        .map(|party| party.name.as_str())
        .unwrap_or("");

    let party = match sanitize_filename_segment(party) {
        segment if segment.is_empty() => "Party".to_string(),
        segment => segment,
    };
    let kind = if document.is_purchase {
        "Purchase"
    } else {
        "Sales"
    };
    let number = match sanitize_filename_segment(&document.number) {
        segment if segment.is_empty() => "Invoice".to_string(),
        segment => segment,
    };
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();

    let name = format!("{party}_{kind}_{number}_{stamp}");
    let stem: String = name.chars().take(150).collect();
    format!("{stem}.pdf")
}

/// Windows-reserved characters, control characters, illegal runs, repeated
/// dashes and leading/trailing dots, dashes and spaces are removed.
fn sanitize_filename_segment(value: &str) -> String {
    let without_control: String = value.chars().filter(|ch| (*ch as u32) > 0x1f).collect();
    let reserved: String = without_control
        .chars()
        .map(|ch| {
            if matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
                '-'
            } else {
                ch
            }
        })
        .collect();

    // Runs of anything that is not a letter, digit, dot, underscore or dash.
    let mut illegal = String::new();
    let mut in_run = false;
    for ch in reserved.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') {
            illegal.push(ch);
            in_run = false;
        } else if !in_run {
            illegal.push('-');
            in_run = true;
        }
    }

    // Repeated dashes.
    let mut single = String::new();
    let mut previous_dash = false;
    for ch in illegal.chars() {
        if ch == '-' {
            if !previous_dash {
                single.push('-');
            }
            previous_dash = true;
        } else {
            single.push(ch);
            previous_dash = false;
        }
    }

    let is_edge = |ch: char| ch == '-' || ch == '.' || ch == '_' || ch.is_whitespace();
    let trimmed = single.trim_matches(is_edge).to_string();
    let capped: String = trimmed.chars().take(60).collect();
    capped.trim_end_matches(is_edge).to_string()
}

#[cfg(test)]
mod tests {
    use super::{default_filename, sanitize_filename_segment};
    use serde_json::json;

    #[test]
    fn sanitises_filename_segments() {
        assert_eq!(sanitize_filename_segment("INV/0001"), "INV-0001");
        assert_eq!(
            sanitize_filename_segment("Acme  Distributors"),
            "Acme-Distributors"
        );
        assert_eq!(sanitize_filename_segment("..hidden.."), "hidden");
        assert_eq!(sanitize_filename_segment("***"), "");
    }

    #[test]
    fn builds_the_invoice_filename() {
        let document = json!({
            "type": "SALES",
            "number": "INV/0001",
            "party": { "name": "Acme Distributors" }
        });
        let name = default_filename(&document);
        assert!(
            name.starts_with("Acme-Distributors_Sales_INV-0001_"),
            "{name}"
        );
        assert!(name.ends_with(".pdf"), "{name}");

        let cash = json!({ "type": "PURCHASE", "number": "PUR/0007", "party": null });
        let name = default_filename(&cash);
        assert!(name.starts_with("Party_Purchase_PUR-0007_"), "{name}");
    }
}
