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

use std::sync::OnceLock;

use printpdf::{
    BuiltinFont, Color, IndirectFontRef, Line, Mm, PdfDocument, PdfDocumentReference,
    PdfLayerReference, Point, Rgb,
};
use serde::Deserialize;
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::export::invoice_format::{
    amount_in_words, format_amount, format_date, format_percent, format_qty, state_label,
};
use crate::json::{array, field};

// ---------------------------------------------------------------------------
// Shared geometry
// ---------------------------------------------------------------------------

/// `../src/shared/print-geometry.json` is the only place these numbers live.
/// The React sheet imports the same file, so a border can never drift between
/// the native PDF and the print preview.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Geometry {
    page: PageSize,
    margins_mm: Insets,
    frame_mm: Insets,
    panels: Panels,
    item_table: ItemTable,
    tax_summary: TaxSummary,
    border_pt: BorderWeights,
    text: TextMetrics,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
struct PageSize {
    width_mm: f32,
    height_mm: f32,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
struct Insets {
    top: f32,
    right: f32,
    bottom: f32,
    left: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Panels {
    head_gap_mm: f32,
    meta_width_mm: f32,
    buyer_gap_mm: f32,
    bottom_gap_mm: f32,
    totals_width_mm: f32,
    declaration_split_mm: f32,
    #[allow(dead_code)]
    signatory_width_mm: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemTable {
    header_height_mm: f32,
    row_height_mm: f32,
    bottom_mm: f32,
    #[allow(dead_code)]
    min_height_mm: f32,
    columns: Vec<ItemColumn>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemColumn {
    weight: f32,
    align: Align,
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Align {
    Left,
    Center,
    Right,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaxSummary {
    header_height_mm: f32,
    row_height_mm: f32,
    columns: TaxSummaryColumns,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaxSummaryColumns {
    hsn: f32,
    taxable: f32,
    rate: f32,
    tax: f32,
    cess_rate: f32,
    cess: f32,
    total: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorderWeights {
    outer: f32,
    section: f32,
    cell: f32,
    total: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextMetrics {
    cell_padding_x_mm: f32,
    #[allow(dead_code)]
    cell_padding_y_mm: f32,
}

static GEOMETRY: OnceLock<Geometry> = OnceLock::new();

fn geometry() -> &'static Geometry {
    GEOMETRY.get_or_init(|| {
        serde_json::from_str(include_str!("../../../src/shared/print-geometry.json"))
            .expect("src/shared/print-geometry.json must be valid geometry")
    })
}

fn page_w() -> f32 {
    geometry().page.width_mm
}

fn page_h() -> f32 {
    geometry().page.height_mm
}

fn left() -> f32 {
    geometry().margins_mm.left
}

fn right() -> f32 {
    page_w() - geometry().margins_mm.right
}

fn top() -> f32 {
    geometry().margins_mm.top
}

fn bottom() -> f32 {
    page_h() - geometry().margins_mm.bottom
}

fn content_width() -> f32 {
    right() - left()
}

fn table_bottom() -> f32 {
    geometry().item_table.bottom_mm
}

#[derive(Debug, Clone, Copy)]
enum BorderClass {
    Outer,
    Section,
    Cell,
    Total,
}

fn border_pt(class: BorderClass) -> f32 {
    let weights = &geometry().border_pt;
    match class {
        BorderClass::Outer => weights.outer,
        BorderClass::Section => weights.section,
        BorderClass::Cell => weights.cell,
        BorderClass::Total => weights.total,
    }
}

/// One straight rule in top-left page coordinates.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Edge {
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    weight: f32,
}

/// A rectangle is exactly four continuous edges. Using this for every panel
/// keeps the frame complete and makes a missing side impossible.
fn rect_edges(x: f32, y: f32, w: f32, h: f32, weight: f32) -> [Edge; 4] {
    [
        Edge {
            x1: x,
            y1: y,
            x2: x + w,
            y2: y,
            weight,
        },
        Edge {
            x1: x + w,
            y1: y,
            x2: x + w,
            y2: y + h,
            weight,
        },
        Edge {
            x1: x,
            y1: y + h,
            x2: x + w,
            y2: y + h,
            weight,
        },
        Edge {
            x1: x,
            y1: y,
            x2: x,
            y2: y + h,
            weight,
        },
    ]
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Column {
    x: f32,
    width: f32,
}

impl Column {
    fn right(self) -> f32 {
        self.x + self.width
    }
}

/// Column x positions are computed once from the shared weights and reused for
/// header text, cell text, and separators.
fn columns_at(weights: &[f32], start: f32, width: f32) -> Vec<Column> {
    let total: f32 = weights.iter().sum();
    let mut x = start;
    let mut result = Vec::with_capacity(weights.len());
    for weight in weights {
        let column_width = weight / total * width;
        result.push(Column {
            x,
            width: column_width,
        });
        x += column_width;
    }
    result
}

fn table_columns() -> Vec<Column> {
    let weights: Vec<f32> = geometry()
        .item_table
        .columns
        .iter()
        .map(|column| column.weight)
        .collect();
    columns_at(&weights, left(), content_width())
}

/// The only interior column separators a table may draw: one per shared
/// boundary, no line on the outer left or right edge.
fn table_separators(columns: &[Column], top: f32, bottom: f32) -> Vec<Edge> {
    columns
        .iter()
        .skip(1)
        .map(|column| Edge {
            x1: column.x,
            y1: top,
            x2: column.x,
            y2: bottom,
            weight: border_pt(BorderClass::Cell),
        })
        .collect()
}

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

/// Conservative average glyph width in em for the built-in Helvetica faces.
/// The PDF has no text measurement API without embedding font metrics, so the
/// estimate deliberately errs wide: right-aligned text must stop before the
/// cell edge, never cross it.
const AVG_GLYPH_EM: f32 = 0.66;

fn text_width(text: &str, size: f32) -> f32 {
    text.chars().count() as f32 * size * AVG_GLYPH_EM * MM_PER_PT
}

/// Greedy word wrap against an approximate Helvetica advance width. The PDF
/// has no text measurement API without font metrics, and the invoice only needs
/// to avoid overflow, not to justify.
fn wrap(text: &str, width_mm: f32, size: f32) -> Vec<String> {
    let limit = (width_mm / (size * AVG_GLYPH_EM * MM_PER_PT))
        .floor()
        .max(1.0) as usize;
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
    let limit = (width_mm / (size * AVG_GLYPH_EM * MM_PER_PT))
        .floor()
        .max(1.0) as usize;
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
        self.layer
            .use_text(text, size, Mm(x), Mm(page_h() - y), font);
    }

    fn text_right(&self, right: f32, y: f32, size: f32, bold: bool, color: Color, text: &str) {
        let x = (right - text_width(text, size)).max(left());
        self.text(x, y, size, bold, color, text);
    }

    fn text_center(&self, center: f32, y: f32, size: f32, bold: bool, color: Color, text: &str) {
        let x = center - text_width(text, size) / 2.0;
        self.text(x, y, size, bold, color, text);
    }

    fn draw_edge(&self, edge: Edge) {
        self.layer.set_outline_color(line_color());
        self.layer.set_outline_thickness(edge.weight);
        self.layer.add_line(Line {
            points: vec![
                (Point::new(Mm(edge.x1), Mm(page_h() - edge.y1)), false),
                (Point::new(Mm(edge.x2), Mm(page_h() - edge.y2)), false),
            ],
            is_closed: false,
        });
    }

    fn horizontal(&self, x1: f32, x2: f32, y: f32, weight: f32) {
        self.draw_edge(Edge {
            x1,
            y1: y,
            x2,
            y2: y,
            weight,
        });
    }

    fn vertical(&self, x: f32, from: f32, to: f32, weight: f32) {
        self.draw_edge(Edge {
            x1: x,
            y1: from,
            x2: x,
            y2: to,
            weight,
        });
    }

    /// A panel is always four edges. `w` and `h` are the full box size.
    fn rect(&self, x: f32, y: f32, w: f32, h: f32, weight: f32) {
        for edge in rect_edges(x, y, w, h, weight) {
            self.draw_edge(edge);
        }
    }

    /// The sheet frame sits outside the content margins and is redrawn on every
    /// page, including continuation pages.
    fn draw_frame(&self) {
        let frame = geometry().frame_mm;
        self.rect(
            frame.left,
            frame.top,
            page_w() - frame.left - frame.right,
            page_h() - frame.top - frame.bottom,
            border_pt(BorderClass::Outer),
        );
    }

    fn add_page(&mut self) {
        let (page, layer) = self.doc.add_page(Mm(page_w()), Mm(page_h()), "Invoice");
        let next = self.doc.get_page(page).get_layer(layer);
        self.layer = next;
        self.y = top();
    }

    /// Starts a continuation page with the frame and a compact header, so a very
    /// long invoice still reads as the same document.
    fn continue_page(&mut self, caption: &str) {
        self.add_page();
        self.draw_frame();
        self.y = top() + 5.0;
        self.text_center(page_w() / 2.0, self.y, 12.0, true, ink(), DOCUMENT_TITLE);
        self.text_right(right(), self.y, 7.5, false, muted(), caption);
        self.y = top() + 9.0;
        self.horizontal(left(), right(), self.y, border_pt(BorderClass::Section));
        self.y = top() + 13.5;
    }

    fn ensure(&mut self, needed: f32, caption: &str) {
        if self.y + needed > bottom() {
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

    sheet.draw_frame();
    sheet.y = top() + 5.0;
    sheet.text_center(page_w() / 2.0, sheet.y, 15.0, true, ink(), DOCUMENT_TITLE);
    sheet.text_right(right(), sheet.y, 8.0, false, muted(), caption);

    if document.cancelled {
        sheet.text_center(
            page_w() / 2.0,
            150.0,
            42.0,
            true,
            Color::Rgb(Rgb::new(0.85, 0.45, 0.45, None)),
            "CANCELLED",
        );
    }

    sheet.y = top() + 9.0;
    sheet.horizontal(left(), right(), sheet.y, border_pt(BorderClass::Section));
    sheet.y = top() + 13.0;

    let head_top = sheet.y;
    let panels = &geometry().panels;
    let meta_x = right() - panels.meta_width_mm;
    let supplier_width = meta_x - panels.head_gap_mm - left();
    let supplier_text_x = left() + 2.0;
    let mut supplier_y = head_top;
    sheet.text(
        supplier_text_x,
        supplier_y + 3.4,
        6.5,
        false,
        muted(),
        "SUPPLIER",
    );
    supplier_y += 6.4;
    sheet.text(
        supplier_text_x,
        supplier_y + 4.0,
        11.0,
        true,
        ink(),
        &issuer.name,
    );
    supplier_y += 6.0;
    if let Some(legal_name) = &issuer.legal_name {
        if legal_name != &issuer.name {
            sheet.text(
                supplier_text_x,
                supplier_y + 3.4,
                8.0,
                false,
                ink(),
                legal_name,
            );
            supplier_y += 4.0;
        }
    }
    if let Some(address) = &issuer.address {
        for line in wrap(address, supplier_width - 4.0, 8.0) {
            sheet.text(supplier_text_x, supplier_y + 3.4, 8.0, false, ink(), &line);
            supplier_y += 3.9;
        }
    }
    let city_line = address_text(&[issuer.city.as_deref(), issuer.pincode.as_deref()]);
    if !city_line.is_empty() {
        sheet.text(
            supplier_text_x,
            supplier_y + 3.4,
            8.0,
            false,
            ink(),
            &city_line,
        );
        supplier_y += 3.9;
    }
    supplier_y += 1.6;
    for value in [
        format!("Phone: {}", dash(issuer.phone.as_deref())),
        format!("Email: {}", dash(issuer.email.as_deref())),
        format!("GSTIN/UIN: {}", dash(issuer.gstin.as_deref())),
        format!("PAN/IT No.: {}", dash(issuer.pan.as_deref())),
        format!("State: {}", state_text(issuer.state_code.as_deref())),
    ] {
        sheet.text(supplier_text_x, supplier_y + 3.4, 8.0, false, ink(), &value);
        supplier_y += 4.0;
    }
    supplier_y += 1.4;

    let meta_bottom = draw_meta_grid(sheet, document, head_top);
    let head_bottom = supplier_y.max(meta_bottom);

    sheet.rect(
        left(),
        head_top,
        supplier_width,
        head_bottom - head_top,
        border_pt(BorderClass::Section),
    );
    sheet.horizontal(
        left(),
        left() + supplier_width,
        head_top + 6.4,
        border_pt(BorderClass::Cell),
    );

    sheet.y = head_bottom + panels.buyer_gap_mm;
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
    let panels = &geometry().panels;
    let x = right() - panels.meta_width_mm;
    let width = panels.meta_width_mm;
    let half = width / 2.0;
    let mid_x = x + half;
    let pad = geometry().text.cell_padding_x_mm;
    let mut y = top;
    let mut separators: Vec<f32> = Vec::new();

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
            let cell_x = x + index as f32 * half;
            sheet.text(cell_x + pad, y + 3.2, 6.2, false, muted(), label);
            let value = truncate(&dash(Some(value.as_str())), half - pad * 2.0, 7.4);
            sheet.text(cell_x + pad, y + 6.4, 7.4, false, ink(), &value);
        }
        y += 8.2;
        separators.push(y);
    }

    let delivery_top = y;

    if !document.is_purchase {
        // Place of Delivery spans the full grid width.
        sheet.text(x + pad, y + 3.2, 6.2, false, muted(), "Place of Delivery");
        y += 4.2;
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
        for line in wrap(&address, width - pad * 2.0, 7.2) {
            sheet.text(x + pad, y + 3.4, 7.2, false, ink(), &line);
            y += 3.6;
        }

        if let Some(due_date) = &document.due_date {
            sheet.text(
                x + pad,
                y + 4.0,
                7.2,
                true,
                ink(),
                &format!("Due {}", format_date(due_date)),
            );
            y += 4.4;
        }
    }

    let bottom = y + 1.4;
    sheet.rect(x, top, width, bottom - top, border_pt(BorderClass::Section));
    sheet.vertical(
        mid_x,
        top,
        if document.is_purchase {
            bottom
        } else {
            delivery_top
        },
        border_pt(BorderClass::Cell),
    );
    for separator in separators {
        if separator < bottom - 0.1 {
            sheet.horizontal(x, x + width, separator, border_pt(BorderClass::Cell));
        }
    }

    bottom
}

fn draw_buyer(sheet: &mut Sheet, buyer: &Block) {
    let top = sheet.y;
    let pad = geometry().text.cell_padding_x_mm;
    let mut y = top;

    sheet.text(left() + 2.0, y + 3.4, 6.5, false, muted(), "BUYER");
    y += 6.4;
    sheet.text(left() + 2.0, y + 4.2, 9.5, true, ink(), &buyer.name);
    y += 5.2;

    let address = dash(buyer.address.as_deref());
    for line in wrap(&address, content_width() - pad * 2.0, 8.0) {
        sheet.text(left() + pad, y + 3.4, 8.0, false, ink(), &line);
        y += 3.9;
    }

    sheet.text(
        left() + pad,
        y + 3.4,
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
        left() + pad,
        y + 3.4,
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
    y += 4.2;

    sheet.rect(
        left(),
        top,
        content_width(),
        y - top,
        border_pt(BorderClass::Section),
    );
    sheet.horizontal(left(), right(), top + 6.4, border_pt(BorderClass::Cell));
    sheet.y = y + 4.5;
}

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

fn draw_aligned(
    sheet: &Sheet,
    column: &Column,
    align: Align,
    baseline: f32,
    size: f32,
    bold: bool,
    text: &str,
    pad: f32,
) {
    match align {
        Align::Left => sheet.text(column.x + pad, baseline, size, bold, ink(), text),
        Align::Center => sheet.text_center(
            column.x + column.width / 2.0,
            baseline,
            size,
            bold,
            ink(),
            text,
        ),
        Align::Right => sheet.text_right(column.right() - pad, baseline, size, bold, ink(), text),
    }
}

fn draw_table_header(sheet: &mut Sheet) {
    let columns = table_columns();
    let spec = &geometry().item_table;
    let pad = geometry().text.cell_padding_x_mm;
    let top = sheet.y;

    let wrapped: Vec<Vec<String>> = columns
        .iter()
        .zip(&spec.columns)
        .enumerate()
        .map(|(index, (column, _))| wrap(TABLE_HEAD[index], column.width - pad * 2.0, 7.2))
        .collect();
    let lines = wrapped.iter().map(Vec::len).max().unwrap_or(1);
    let height = spec.header_height_mm.max(lines as f32 * 3.2 + 2.6);

    sheet.rect(
        left(),
        top,
        content_width(),
        height,
        border_pt(BorderClass::Cell),
    );
    for edge in table_separators(&columns, top, top + height) {
        sheet.draw_edge(edge);
    }

    for (index, label_lines) in wrapped.iter().enumerate() {
        let column = columns[index];
        let align = spec.columns[index].align;
        let block_height = label_lines.len() as f32 * 3.2;
        let first = top + (height - block_height) / 2.0 + 2.6;
        for (line_index, line) in label_lines.iter().enumerate() {
            draw_aligned(
                sheet,
                &column,
                align,
                first + line_index as f32 * 3.2,
                7.2,
                true,
                line,
                pad,
            );
        }
    }
    sheet.y = top + height;
}

fn draw_lines(sheet: &mut Sheet, document: &Document, caption: &str) {
    sheet.ensure(24.0, caption);
    draw_table_header(sheet);
    let columns = table_columns();
    let spec = &geometry().item_table;
    let pad = geometry().text.cell_padding_x_mm;

    for (index, line) in document.lines.iter().enumerate() {
        let description_lines = wrap(&line.description, columns[1].width - pad * 2.0, 7.4);
        let height = (description_lines.len() as f32 * 3.6 + 2.8).max(spec.row_height_mm);

        if sheet.y + height > table_bottom() {
            sheet.continue_page(caption);
            draw_table_header(sheet);
        }

        let top = sheet.y;
        let baseline = top + 4.6;

        sheet.vertical(left(), top, top + height, border_pt(BorderClass::Cell));
        sheet.vertical(right(), top, top + height, border_pt(BorderClass::Cell));
        for edge in table_separators(&columns, top, top + height) {
            sheet.draw_edge(edge);
        }
        sheet.horizontal(left(), right(), top + height, border_pt(BorderClass::Cell));

        let values = [
            (index + 1).to_string(),
            String::new(),
            dash(line.hsn.as_deref()),
            format_qty(line.qty_e4),
            format_amount(line.rate_minor),
            dash(line.uom.as_deref()),
            format_percent(line.discount_bps),
            format_amount(line.taxable_minor),
        ];
        for (column_index, value) in values.iter().enumerate() {
            if column_index == 1 {
                for (offset, text) in description_lines.iter().enumerate() {
                    sheet.text(
                        columns[1].x + pad,
                        top + 4.4 + offset as f32 * 3.6,
                        7.4,
                        false,
                        ink(),
                        text,
                    );
                }
            } else {
                draw_aligned(
                    sheet,
                    &columns[column_index],
                    spec.columns[column_index].align,
                    baseline,
                    7.4,
                    false,
                    value,
                    pad,
                );
            }
        }

        sheet.y = top + height;
    }

    if document.lines.is_empty() {
        let top = sheet.y;
        let height = spec.row_height_mm;
        sheet.vertical(left(), top, top + height, border_pt(BorderClass::Cell));
        sheet.vertical(right(), top, top + height, border_pt(BorderClass::Cell));
        for edge in table_separators(&columns, top, top + height) {
            sheet.draw_edge(edge);
        }
        sheet.text(left() + pad, top + 4.6, 7.4, false, muted(), "No items.");
        sheet.horizontal(left(), right(), top + height, border_pt(BorderClass::Cell));
        sheet.y = top + height;
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
    sheet.y += geometry().panels.bottom_gap_mm;
    let top = sheet.y;

    // Bank block (sales only): a purchase bill keeps the supplier's bank, which
    // we do not store.
    if !document.is_purchase {
        if let Some(bank) = &document.bank {
            sheet.text(left(), top, 6.5, false, muted(), "BANK DETAILS");
            sheet.text(left(), top + 4.6, 8.2, true, ink(), &bank.name);
            if let Some(code) = &bank.code {
                sheet.text(
                    left(),
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
    let mut rows: Vec<(String, i64)> =
        vec![("Taxable Value".to_string(), document.totals.taxable_minor)];
    for slab in &document.slabs {
        if inter_state {
            rows.push((
                format!("IGST @ {}", format_percent(slab.gst_rate_bps)),
                slab.igst_minor,
            ));
        } else {
            let half = format_percent(slab.gst_rate_bps / 2);
            rows.push((format!("CGST @ {half}"), slab.cgst_minor));
            rows.push((format!("SGST @ {half}"), slab.sgst_minor));
            if slab.cess_minor != 0 {
                rows.push(("Cess".to_string(), slab.cess_minor));
            }
        }
    }
    if document.totals.round_off_minor != 0 {
        rows.push(("Round Off".to_string(), document.totals.round_off_minor));
    }

    let totals_width = geometry().panels.totals_width_mm;
    let totals_x = right() - totals_width;
    let label_x = totals_x + 2.0;
    let body_top = top + 1.0;
    let row_height = 5.0;
    let mut y = body_top;
    for (label, value) in &rows {
        sheet.text(label_x, y + 3.6, 7.6, false, ink(), label);
        sheet.text_right(
            right() - 2.0,
            y + 3.6,
            7.6,
            false,
            ink(),
            &format_amount(*value),
        );
        y += row_height;
    }

    let grand_top = y + 1.0;
    let grand_height = 8.0;
    let grand_bottom = grand_top + grand_height;
    let currency_prefix = if document.company.currency == "INR" {
        "Rs. "
    } else {
        ""
    };
    sheet.text(label_x, grand_top + 5.4, 9.2, true, ink(), "Total");
    sheet.text_right(
        right() - 2.0,
        grand_top + 5.4,
        9.2,
        true,
        ink(),
        &format!(
            "{currency_prefix}{}",
            format_amount(document.totals.total_minor)
        ),
    );

    // The totals box owns its whole outer edge; only the row separators are
    // drawn inside it.
    sheet.rect(
        totals_x,
        body_top,
        totals_width,
        grand_bottom - body_top,
        border_pt(BorderClass::Section),
    );
    for index in 0..rows.len().saturating_sub(1) {
        let separator = body_top + (index + 1) as f32 * row_height;
        sheet.horizontal(totals_x, right(), separator, border_pt(BorderClass::Cell));
    }
    sheet.horizontal(totals_x, right(), grand_top, border_pt(BorderClass::Total));

    sheet.y = grand_bottom.max(top + 18.0) + 2.0;

    // Amount in words.
    sheet.ensure(16.0, caption);
    sheet.horizontal(left(), right(), sheet.y, border_pt(BorderClass::Section));
    sheet.y += 4.4;
    sheet.text(left(), sheet.y, 6.4, false, muted(), "AMOUNT (IN WORDS)");
    sheet.text_right(right(), sheet.y, 6.8, false, muted(), "E. & E.O.");
    sheet.y += 3.6;
    for line in wrap(
        &amount_in_words(document.totals.total_minor, &document.company.currency),
        content_width(),
        7.8,
    ) {
        sheet.text(left(), sheet.y, 7.8, false, ink(), &line);
        sheet.y += 4.0;
    }

    draw_hsn_summary(sheet, document, hsn_rows, inter_state, has_cess, caption);

    if tax_total != 0 {
        sheet.ensure(10.0, caption);
        sheet.y += 4.4;
        let text = format!(
            "Tax Amount (in words): {}",
            amount_in_words(tax_total, &document.company.currency)
        );
        for line in wrap(&text, content_width(), 7.4) {
            sheet.text(left(), sheet.y, 7.4, false, ink(), &line);
            sheet.y += 3.8;
        }
    }

    let terms = document.term_lines();
    if !terms.is_empty() {
        sheet.ensure(14.0, caption);
        sheet.y += 2.0;
        sheet.text(left(), sheet.y, 6.4, false, muted(), "TERMS & CONDITIONS");
        sheet.y += 4.0;
        for (index, term) in terms.iter().enumerate() {
            for (line_index, line) in wrap(
                &format!("{}. {term}", index + 1),
                content_width() - 4.0,
                7.4,
            )
            .iter()
            .enumerate()
            {
                let x = if line_index == 0 {
                    left()
                } else {
                    left() + 4.0
                };
                sheet.text(x, sheet.y, 7.4, false, ink(), line);
                sheet.y += 3.7;
            }
        }
    }

    draw_declaration(sheet, document, issuer, caption);
}

fn tax_columns(inter_state: bool, has_cess: bool) -> (Vec<Column>, Vec<Align>) {
    let spec = &geometry().tax_summary.columns;
    let mut weights = vec![spec.hsn, spec.taxable];
    let mut aligns = vec![Align::Left, Align::Right];

    if inter_state {
        weights.extend([spec.rate, spec.tax]);
        aligns.extend([Align::Center, Align::Right]);
    } else {
        weights.extend([spec.rate, spec.tax, spec.rate, spec.tax]);
        aligns.extend([Align::Center, Align::Right, Align::Center, Align::Right]);
    }
    if has_cess {
        weights.extend([spec.cess_rate, spec.cess]);
        aligns.extend([Align::Center, Align::Right]);
    }
    weights.push(spec.total);
    aligns.push(Align::Right);

    (columns_at(&weights, left(), content_width()), aligns)
}

fn draw_hsn_summary(
    sheet: &mut Sheet,
    document: &Document,
    rows: &[HsnRow],
    inter_state: bool,
    has_cess: bool,
    caption: &str,
) {
    let spec = &geometry().tax_summary;
    let pad = geometry().text.cell_padding_x_mm;
    sheet.ensure(
        14.0 + (rows.len() as f32 + 1.0) * spec.row_height_mm + 8.0,
        caption,
    );
    sheet.y += 3.0;
    sheet.text(
        left(),
        sheet.y,
        6.4,
        false,
        muted(),
        "HSN/SAC-WISE TAX SUMMARY",
    );
    sheet.y += 3.4;

    let mut head: Vec<&str> = vec!["HSN/SAC", "Taxable Value"];
    if inter_state {
        head.extend(["IGST Rate", "IGST Amount"]);
    } else {
        head.extend(["CGST Rate", "CGST Amount", "SGST Rate", "SGST Amount"]);
    }
    if has_cess {
        head.extend(["Cess Rate", "Cess Amount"]);
    }
    head.push("Total Tax Amount");

    let (columns, aligns) = tax_columns(inter_state, has_cess);
    let top = sheet.y;
    let wrapped: Vec<Vec<String>> = columns
        .iter()
        .zip(&head)
        .map(|(column, label)| wrap(label, column.width - pad * 2.0, 6.6))
        .collect();
    let head_lines = wrapped.iter().map(Vec::len).max().unwrap_or(1);
    let head_height = spec.header_height_mm.max(head_lines as f32 * 3.0 + 2.4);

    sheet.rect(
        left(),
        top,
        content_width(),
        head_height,
        border_pt(BorderClass::Cell),
    );
    for edge in table_separators(&columns, top, top + head_height) {
        sheet.draw_edge(edge);
    }
    for (index, label_lines) in wrapped.iter().enumerate() {
        let block_height = label_lines.len() as f32 * 3.0;
        let first = top + (head_height - block_height) / 2.0 + 2.4;
        for (line_index, line) in label_lines.iter().enumerate() {
            draw_aligned(
                sheet,
                &columns[index],
                aligns[index],
                first + line_index as f32 * 3.0,
                6.6,
                true,
                line,
                pad,
            );
        }
    }
    sheet.y = top + head_height;

    let draw_row = |sheet: &mut Sheet, values: &[String], bold: bool| {
        let top = sheet.y;
        let baseline = top + 4.4;
        let height = spec.row_height_mm;
        sheet.vertical(left(), top, top + height, border_pt(BorderClass::Cell));
        sheet.vertical(right(), top, top + height, border_pt(BorderClass::Cell));
        for edge in table_separators(&columns, top, top + height) {
            sheet.draw_edge(edge);
        }
        for (index, value) in values.iter().enumerate() {
            draw_aligned(
                sheet,
                &columns[index],
                aligns[index],
                baseline,
                7.0,
                bold,
                value,
                pad,
            );
        }
        sheet.horizontal(left(), right(), top + height, border_pt(BorderClass::Cell));
        sheet.y = top + height;
    };

    for row in rows {
        let mut values = vec![dash(row.hsn.as_deref()), format_amount(row.taxable_minor)];
        if inter_state {
            values.push(format_percent(row.gst_rate_bps));
            values.push(format_amount(row.igst_minor));
        } else {
            values.push(format_percent(row.gst_rate_bps / 2));
            values.push(format_amount(row.cgst_minor));
            values.push(format_percent(row.gst_rate_bps / 2));
            values.push(format_amount(row.sgst_minor));
        }
        if has_cess {
            values.push(format_percent(row.gst_rate_bps));
            values.push(format_amount(row.cess_minor));
        }
        values.push(format_amount(row.tax_minor));
        draw_row(sheet, &values, false);
    }

    // Total row.
    let mut values = vec![
        "Total".to_string(),
        format_amount(document.totals.taxable_minor),
    ];
    if inter_state {
        values.push(String::new());
        values.push(format_amount(document.totals.igst_minor));
    } else {
        values.push(String::new());
        values.push(format_amount(document.totals.cgst_minor));
        values.push(String::new());
        values.push(format_amount(document.totals.sgst_minor));
    }
    if has_cess {
        values.push(String::new());
        values.push(format_amount(document.totals.cess_minor));
    }
    values.push(format_amount(document.tax_total()));

    let top = sheet.y;
    let height = spec.row_height_mm;
    sheet.vertical(left(), top, top + height, border_pt(BorderClass::Cell));
    sheet.vertical(right(), top, top + height, border_pt(BorderClass::Cell));
    for edge in table_separators(&columns, top, top + height) {
        sheet.draw_edge(edge);
    }
    let baseline = top + 4.6;
    for (index, value) in values.iter().enumerate() {
        draw_aligned(
            sheet,
            &columns[index],
            aligns[index],
            baseline,
            7.2,
            true,
            value,
            pad,
        );
    }
    sheet.horizontal(left(), right(), top + height, border_pt(BorderClass::Total));
    sheet.y = top + height;
}

fn draw_declaration(sheet: &mut Sheet, document: &Document, issuer: &Block, caption: &str) {
    sheet.ensure(30.0, caption);
    sheet.y += 3.0;
    let top = sheet.y;
    let split = left() + geometry().panels.declaration_split_mm;

    sheet.text(left(), top + 4.0, 6.4, false, muted(), "DECLARATION");
    let declaration = "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.";
    let mut y = top + 8.0;
    for line in wrap(declaration, split - left() - 3.0, 7.2) {
        sheet.text(left(), y, 7.2, false, ink(), &line);
        y += 3.6;
    }
    if document.is_purchase {
        sheet.text(
            left(),
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

    sheet.rect(
        left(),
        top,
        content_width(),
        24.0,
        border_pt(BorderClass::Section),
    );
    sheet.vertical(split, top, top + 24.0, border_pt(BorderClass::Cell));
    sheet.y = top + 26.0;
}

fn draw_footer(sheet: &Sheet, document: &Document, caption: &str, page: u32, pages: u32) {
    let y = page_h() - 8.0;
    sheet.horizontal(left(), right(), y - 4.0, border_pt(BorderClass::Section));
    sheet.text(left(), y, 6.4, false, muted(), &document.jurisdiction());
    sheet.text_center(
        page_w() / 2.0,
        y,
        6.4,
        false,
        muted(),
        "This is a Computer Generated Invoice",
    );
    sheet.text_right(
        right(),
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
    let (pdf, page, layer) = PdfDocument::new("Tax Invoice", Mm(page_w()), Mm(page_h()), "Invoice");
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
        y: top(),
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
    use super::{
        build, columns_at, content_width, default_filename, geometry, left, rect_edges, right,
        sanitize_filename_segment, table_columns, table_separators, Align, Edge,
    };
    use serde_json::{json, Value};

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

    #[test]
    fn a_rect_emits_four_continuous_edges() {
        let edges = rect_edges(10.0, 20.0, 30.0, 40.0, 0.5);
        assert_eq!(
            edges,
            [
                Edge {
                    x1: 10.0,
                    y1: 20.0,
                    x2: 40.0,
                    y2: 20.0,
                    weight: 0.5
                },
                Edge {
                    x1: 40.0,
                    y1: 20.0,
                    x2: 40.0,
                    y2: 60.0,
                    weight: 0.5
                },
                Edge {
                    x1: 10.0,
                    y1: 60.0,
                    x2: 40.0,
                    y2: 60.0,
                    weight: 0.5
                },
                Edge {
                    x1: 10.0,
                    y1: 20.0,
                    x2: 10.0,
                    y2: 60.0,
                    weight: 0.5
                },
            ]
        );

        // Every edge is non-degenerate and no edge appears twice.
        for edge in edges {
            assert!((edge.x1 - edge.x2).abs() + (edge.y1 - edge.y2).abs() > 0.0);
        }
        let mut unique = edges.to_vec();
        unique.sort_by(|left, right| {
            (left.x1, left.y1, left.x2, left.y2)
                .partial_cmp(&(right.x1, right.y1, right.x2, right.y2))
                .expect("test coordinates are finite")
        });
        unique.dedup_by(|left, right| {
            (left.x1 - right.x1).abs() < f32::EPSILON
                && (left.y1 - right.y1).abs() < f32::EPSILON
                && (left.x2 - right.x2).abs() < f32::EPSILON
                && (left.y2 - right.y2).abs() < f32::EPSILON
        });
        assert_eq!(unique.len(), 4);
    }

    #[test]
    fn table_columns_fill_the_content_width() {
        let columns = table_columns();
        let total: f32 = columns.iter().map(|column| column.width).sum();
        assert!((total - content_width()).abs() < 0.001, "{total}");

        assert!((columns.first().expect("columns").x - left()).abs() < 0.001);
        assert!((columns.last().expect("columns").right() - right()).abs() < 0.001);
        for pair in columns.windows(2) {
            assert!((pair[0].right() - pair[1].x).abs() < 0.001);
        }

        // The description is left aligned; amount and quantity flush right.
        let spec = &geometry().item_table.columns;
        assert_eq!(spec[1].align, Align::Left);
        assert_eq!(spec[3].align, Align::Right);
        assert_eq!(spec[4].align, Align::Right);
        assert_eq!(spec[7].align, Align::Right);
    }

    #[test]
    fn table_separators_are_unique_and_inside_the_frame() {
        let columns = table_columns();
        let separators = table_separators(&columns, 100.0, 120.0);
        assert_eq!(separators.len(), columns.len() - 1);

        let xs: Vec<f32> = separators.iter().map(|edge| edge.x1).collect();
        let mut unique = xs.clone();
        unique.sort_by(|left, right| left.partial_cmp(right).expect("finite separator"));
        unique.dedup_by(|left, right| (*left - *right).abs() < 0.001);
        assert_eq!(unique.len(), xs.len());

        for separator in &separators {
            assert!(separator.x1 > left() + 0.01);
            assert!(separator.x1 < right() - 0.01);
        }
    }

    fn fixture_line(index: usize) -> Value {
        json!({
            "id": index + 1,
            "description": format!("SSD 256GB item {index}"),
            "hsn": "8471",
            "uom": "NOS",
            "qtyE4": 10_000,
            "rateMinor": 1_000_000,
            "discountBps": 0,
            "gstRateBps": 1800,
            "taxableMinor": 1_000_000,
            "cgstMinor": 90_000,
            "sgstMinor": 90_000,
            "igstMinor": 0,
            "cessMinor": 0,
            "totalMinor": 1_180_000
        })
    }

    fn invoice_fixture(line_count: usize) -> Value {
        let lines: Vec<Value> = (0..line_count).map(fixture_line).collect();
        let taxable = 1_000_000_i64 * line_count as i64;
        let cgst = 90_000_i64 * line_count as i64;
        let sgst = 90_000_i64 * line_count as i64;
        let total = 1_180_000_i64 * line_count as i64;

        json!({
            "id": 7,
            "type": "SALES",
            "number": "INV/0001",
            "date": "2026-10-29",
            "dueDate": "2026-11-28",
            "referenceNo": "PO-42",
            "narration": null,
            "placeOfSupplyStateCode": "27",
            "status": "POSTED",
            "company": {
                "name": "Acme Distributors",
                "legalName": null,
                "gstin": "27AABFU4477G1ZY",
                "pan": "AABFU4477G",
                "stateCode": "27",
                "address": "12 Market Road",
                "city": "Pune",
                "pincode": "411001",
                "phone": "9876543210",
                "email": "owner@acme.in",
                "currency": "INR",
                "invoiceTerms": "Goods once sold are not taken back."
            },
            "party": {
                "id": 3,
                "name": "Acme Distributor",
                "gstin": "27AABFU4477G1ZY",
                "pan": null,
                "stateCode": "27",
                "billingAddress": "88 Buyer Street, Pune",
                "shippingAddress": null,
                "phone": "9000000001",
                "email": null
            },
            "lines": lines,
            "taxSlabs": [{
                "gstRateBps": 1800,
                "taxableMinor": taxable,
                "cgstMinor": cgst,
                "sgstMinor": sgst,
                "igstMinor": 0,
                "cessMinor": 0,
                "taxMinor": cgst + sgst
            }],
            "bank": { "name": "HDFC Bank", "code": "BANK-01" },
            "totals": {
                "taxableMinor": taxable,
                "cgstMinor": cgst,
                "sgstMinor": sgst,
                "igstMinor": 0,
                "cessMinor": 0,
                "discountMinor": 0,
                "roundOffMinor": 0,
                "totalMinor": total,
                "totalQtyE4": 10_000_i64 * line_count as i64
            }
        })
    }

    /// The MediaBox is the page rectangle in points: A4 is 595.28 x 841.89.
    fn page_boxes(bytes: &[u8]) -> Vec<(f32, f32)> {
        let text = String::from_utf8_lossy(bytes);
        let mut rest = text.as_ref();
        let mut boxes = Vec::new();
        while let Some(index) = rest.find("/MediaBox") {
            rest = &rest[index + "/MediaBox".len()..];
            let Some(start) = rest.find('[') else {
                break;
            };
            let Some(end_offset) = rest[start..].find(']') else {
                break;
            };
            let end = start + end_offset;
            let numbers: Vec<f32> = rest[start + 1..end]
                .split_whitespace()
                .filter_map(|number| number.parse().ok())
                .collect();
            if numbers.len() == 4 {
                boxes.push((numbers[2], numbers[3]));
            }
            rest = &rest[end + 1..];
        }
        boxes
    }

    #[test]
    fn builds_two_a4_pages_for_a_normal_invoice() {
        let bytes = build(&invoice_fixture(3)).expect("build normal invoice");
        let boxes = page_boxes(&bytes);

        assert_eq!(boxes.len(), 2, "one page per GST copy");
        for (width, height) in &boxes {
            assert!((width - 595.28).abs() < 1.0, "A4 width: {width}");
            assert!((height - 841.89).abs() < 1.0, "A4 height: {height}");
        }

        // Proof artefact for the PR: open it and check the frame, the panels and
        // the header/column alignment on both copies.
        let output = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-output");
        std::fs::create_dir_all(&output).expect("create test-output");
        std::fs::write(output.join("invoice.pdf"), &bytes).expect("write invoice.pdf");
    }

    #[test]
    fn overflows_to_continuation_pages_and_keeps_a4() {
        let bytes = build(&invoice_fixture(40)).expect("build overflowing invoice");
        let boxes = page_boxes(&bytes);

        assert!(
            boxes.len() >= 2,
            "an overflowing invoice must span more than one page"
        );
        for (width, height) in &boxes {
            assert!((width - 595.28).abs() < 1.0, "A4 width: {width}");
            assert!((height - 841.89).abs() < 1.0, "A4 height: {height}");
        }

        let output = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-output");
        std::fs::create_dir_all(&output).expect("create test-output");
        std::fs::write(output.join("invoice-overflow.pdf"), &bytes)
            .expect("write invoice-overflow.pdf");
    }

    #[test]
    fn columns_at_is_exact_for_arbitrary_weights() {
        let columns = columns_at(&[1.0, 2.0, 3.0], 10.0, 60.0);
        assert_eq!(columns.len(), 3);
        assert!((columns[0].width - 10.0).abs() < 0.001);
        assert!((columns[1].x - 20.0).abs() < 0.001);
        assert!((columns[2].right() - 70.0).abs() < 0.001);
    }
}
