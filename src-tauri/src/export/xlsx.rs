//! Builds a real `.xlsx` workbook from a formatted table.
//!
//! Mirrors `src/main/export/xlsx.ts`. The renderer sends display strings —
//! exactly what the on-screen table shows — and the columns it marked `numeric`
//! or `dateColumns` are converted here, so money stays a number and dates stay
//! dates in Excel.

use rust_xlsxwriter::{
    Color, DocProperties, ExcelDateTime, Format, FormatAlign, FormatBorder, Workbook, Worksheet,
    XlsxError,
};
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::json::{array, opt_trimmed, req_str};

const MONEY_FORMAT: &str = "\"₹\"#,##0.00";
const DATE_FORMAT: &str = "dd mmm yyyy";
const MAX_SHEET_NAME: usize = 31;
const MAX_COLUMNS: usize = 30;
const MAX_ROWS: usize = 20_000;

const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

fn xlsx_error(err: XlsxError) -> AppError {
    AppError::internal(format!("Could not build the spreadsheet: {err}"))
}

/// Excel rejects `[]:*?/\` in sheet names and stops at 31 characters. A name
/// wrapped in apostrophes or the reserved name "History" is renamed too, so the
/// workbook never fails to save after the user picked a path.
pub fn sheet_name_from(value: &str) -> String {
    let mut cleaned = String::new();
    let mut last_space = false;
    for ch in value.chars() {
        if ch.is_whitespace() || matches!(ch, '[' | ']' | ':' | '*' | '?' | '/' | '\\') {
            if !last_space {
                cleaned.push(' ');
                last_space = true;
            }
        } else {
            cleaned.push(ch);
            last_space = false;
        }
    }

    let trimmed = cleaned.trim();
    let trimmed = if trimmed.is_empty() {
        "Export"
    } else {
        trimmed
    };
    let trimmed = trimmed.trim_matches('\'');
    let trimmed = if trimmed.is_empty() {
        "Export"
    } else {
        trimmed
    };
    let capped: String = trimmed.chars().take(MAX_SHEET_NAME).collect();
    let capped = capped.trim_end_matches('\'').to_string();
    if capped.eq_ignore_ascii_case("history") {
        "History (1)".to_string()
    } else {
        capped
    }
}

/// The renderer sends display strings, so parse the columns it marked numeric.
/// Handles the rupee sign, Indian grouping, a leading minus and accountancy
/// parentheses; anything that is not a number stays text.
pub fn parse_export_number(value: &str) -> Option<f64> {
    let text = value.replace('\u{a0}', " ");
    let text = text.trim();
    if text.is_empty() {
        return None;
    }

    let parenthesised = text.starts_with('(') && text.ends_with(')');
    let cleaned: String = text
        .chars()
        .filter(|ch| ch.is_ascii_digit() || *ch == '.' || *ch == '-')
        .collect();
    if cleaned.is_empty() || cleaned == "-" || cleaned == "." || cleaned == "-." {
        return None;
    }

    let number = cleaned.parse::<f64>().ok()?;
    if !number.is_finite() {
        return None;
    }
    Some(if parenthesised { -number.abs() } else { number })
}

/// Parse the date shapes reports use: `2026-10-23`, `23 Oct 2026`,
/// `23/10/2026`. Returns `None` for anything that is not a real calendar day,
/// so `2026-02-31` stays text instead of silently becoming March.
pub fn parse_export_date(value: &str) -> Option<(u16, u8, u8)> {
    let text = value.trim();
    if text.is_empty() || !text.is_ascii() {
        return None;
    }

    if let Some(date) = parse_iso_date(text) {
        return Some(date);
    }

    // 23 Oct 2026 / 1-Apr-2026
    if let Some(parts) = split_thirds(text, &[' ', '/', '-']) {
        let middle = parts[1];
        let shaped = parts[0].len() <= 2
            && parts[0].chars().all(|ch| ch.is_ascii_digit())
            && middle.len() >= 3
            && middle.chars().all(|ch| ch.is_ascii_alphabetic())
            && parts[2].len() == 4
            && parts[2].chars().all(|ch| ch.is_ascii_digit());
        if shaped {
            let month = month_from_name(&middle[..3].to_lowercase())?;
            let day = parts[0].parse::<i64>().ok()?;
            let year = parts[2].parse::<i64>().ok()?;
            return local_date(year, month as i64, day);
        }
    }

    // 23/10/2026 or 23-10-2026
    if let Some(parts) = split_thirds(text, &['/', '-']) {
        let shaped = !parts[0].is_empty()
            && parts[0].len() <= 2
            && !parts[1].is_empty()
            && parts[1].len() <= 2
            && parts[2].len() == 4
            && parts
                .iter()
                .all(|part| part.chars().all(|ch| ch.is_ascii_digit()));
        if shaped {
            let day = parts[0].parse::<i64>().ok()?;
            let month = parts[1].parse::<i64>().ok()?;
            let year = parts[2].parse::<i64>().ok()?;
            return local_date(year, month, day);
        }
    }

    None
}

fn parse_iso_date(text: &str) -> Option<(u16, u8, u8)> {
    if text.len() != 10 || !text.is_ascii() {
        return None;
    }
    let bytes = text.as_bytes();
    if bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    let year = text[0..4].parse::<i64>().ok()?;
    let month = text[5..7].parse::<i64>().ok()?;
    let day = text[8..10].parse::<i64>().ok()?;
    local_date(year, month, day)
}

fn split_thirds<'a>(text: &'a str, separators: &[char]) -> Option<Vec<&'a str>> {
    let mut parts = Vec::new();
    let mut start = 0usize;
    for (index, ch) in text.char_indices() {
        if separators.contains(&ch) {
            if index == start {
                return None;
            }
            parts.push(&text[start..index]);
            start = index + ch.len_utf8();
        }
    }
    if start >= text.len() {
        return None;
    }
    parts.push(&text[start..]);
    if parts.len() == 3 {
        Some(parts)
    } else {
        None
    }
}

fn month_from_name(name: &str) -> Option<u8> {
    MONTHS
        .iter()
        .position(|month| *month == name)
        .map(|index| index as u8 + 1)
}

/// `new Date(year, month, day)` rejects overflowing days instead of rolling
/// them into the next month.
fn local_date(year: i64, month: i64, day: i64) -> Option<(u16, u8, u8)> {
    if !(100..=9999).contains(&year) || !(1..=12).contains(&month) || day < 1 {
        return None;
    }
    if day > days_in_month(year, month) {
        return None;
    }
    Some((year as u16, month as u8, day as u8))
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => 0,
    }
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn cell_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn string_list(value: &Value, key: &str) -> Vec<String> {
    array(value, key).iter().map(cell_text).collect()
}

fn column_indexes(value: &Value, key: &str) -> Vec<usize> {
    array(value, key)
        .iter()
        .filter_map(Value::as_u64)
        .map(|index| index as usize)
        .collect()
}

enum Cell {
    Number(f64),
    Date(u16, u8, u8),
    Text(String),
}

fn convert_cell(raw: &str, column: usize, numeric: &[usize], dates: &[usize]) -> Cell {
    if numeric.contains(&column) {
        return match parse_export_number(raw) {
            Some(number) => Cell::Number(number),
            None => Cell::Text(raw.to_string()),
        };
    }
    if dates.contains(&column) {
        return match parse_export_date(raw) {
            Some((year, month, day)) => Cell::Date(year, month, day),
            None => Cell::Text(raw.to_string()),
        };
    }
    // An ISO date in any other column is still a date, so a register date never
    // becomes text by accident.
    match parse_iso_date(raw) {
        Some((year, month, day)) => Cell::Date(year, month, day),
        None => Cell::Text(raw.to_string()),
    }
}

#[allow(clippy::too_many_arguments)]
fn write_row(
    worksheet: &mut Worksheet,
    row: u32,
    values: &[String],
    numeric: &[usize],
    dates: &[usize],
    number_format: &Format,
    date_format: &Format,
    text_format: Option<&Format>,
) -> AppResult<()> {
    for (index, raw) in values.iter().enumerate() {
        let column = index as u16;
        match convert_cell(raw, index, numeric, dates) {
            Cell::Number(number) => {
                worksheet
                    .write_number_with_format(row, column, number, number_format)
                    .map_err(xlsx_error)?;
            }
            Cell::Date(year, month, day) => match ExcelDateTime::from_ymd(year, month, day) {
                Ok(value) => {
                    worksheet
                        .write_datetime_with_format(row, column, value, date_format)
                        .map_err(xlsx_error)?;
                }
                Err(_) => {
                    worksheet
                        .write_string(row, column, raw.as_str())
                        .map_err(xlsx_error)?;
                }
            },
            Cell::Text(text) => {
                if text.is_empty() {
                    continue;
                }
                match text_format {
                    Some(format) => {
                        worksheet
                            .write_string_with_format(row, column, text.as_str(), format)
                            .map_err(xlsx_error)?;
                    }
                    None => {
                        worksheet
                            .write_string(row, column, text.as_str())
                            .map_err(xlsx_error)?;
                    }
                }
            }
        }
    }
    Ok(())
}

/// Builds the workbook in memory. The caller owns the save dialog and the file
/// write, so a cancelled dialog never produces a file.
pub fn build(input: &Value) -> AppResult<Vec<u8>> {
    let filename = req_str(input, "filename")?.trim().to_string();
    if filename.is_empty() {
        return Err(AppError::validation("filename is required"));
    }
    if filename.chars().count() > 120 {
        return Err(AppError::validation(
            "filename must be 120 characters or fewer",
        ));
    }

    let head = string_list(input, "head");
    if head.is_empty() {
        return Err(AppError::validation("head is required"));
    }
    if head.len() > MAX_COLUMNS {
        return Err(AppError::validation(format!(
            "head must be {MAX_COLUMNS} columns or fewer"
        )));
    }

    let rows: Vec<Vec<String>> = array(input, "rows")
        .iter()
        .map(|row| {
            row.as_array()
                .map(|cells| cells.iter().map(cell_text).collect())
                .unwrap_or_default()
        })
        .collect();
    if rows.len() > MAX_ROWS {
        return Err(AppError::validation(format!(
            "rows must be {MAX_ROWS} rows or fewer"
        )));
    }

    let numeric: Vec<usize> = column_indexes(input, "numeric")
        .into_iter()
        .filter(|index| *index < head.len())
        .collect();
    let dates: Vec<usize> = column_indexes(input, "dateColumns")
        .into_iter()
        .filter(|index| *index < head.len())
        .collect();

    let sheet_source = opt_trimmed(input, "sheetName").unwrap_or_else(|| filename.clone());
    let sheet_name = sheet_name_from(&sheet_source);

    let mut workbook = Workbook::new();
    workbook.set_properties(&DocProperties::new().set_author("Crown Books"));
    let worksheet = workbook.add_worksheet();
    worksheet
        .set_name(sheet_name.as_str())
        .map_err(xlsx_error)?;

    // Column width is the longest value plus two characters, capped at 48, so a
    // long narration cannot push the money columns off the window.
    for (index, header) in head.iter().enumerate() {
        let longest = rows.iter().fold(header.chars().count(), |longest, row| {
            longest.max(row.get(index).map(|cell| cell.chars().count()).unwrap_or(0))
        });
        let width = (longest + 2).clamp(10, 48) as f64;
        worksheet
            .set_column_width(index as u16, width)
            .map_err(xlsx_error)?;
    }

    let header_format = Format::new()
        .set_bold()
        .set_font_color(Color::RGB(0x2B2B2B))
        .set_background_color(Color::RGB(0xEDE8DE))
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter);
    worksheet.set_row_height(0, 22.0).map_err(xlsx_error)?;
    for (index, header) in head.iter().enumerate() {
        if header.is_empty() {
            continue;
        }
        worksheet
            .write_string_with_format(0, index as u16, header.as_str(), &header_format)
            .map_err(xlsx_error)?;
    }

    let money_format = Format::new().set_num_format(MONEY_FORMAT);
    let date_format = Format::new().set_num_format(DATE_FORMAT);

    for (index, row) in rows.iter().enumerate() {
        write_row(
            worksheet,
            index as u32 + 1,
            row,
            &numeric,
            &dates,
            &money_format,
            &date_format,
            None,
        )?;
    }

    if let Some(footer) = input.get("footer").and_then(Value::as_array) {
        let footer: Vec<String> = footer.iter().map(cell_text).collect();
        let footer_text = Format::new().set_bold().set_border_top(FormatBorder::Thin);
        let footer_number = Format::new()
            .set_bold()
            .set_border_top(FormatBorder::Thin)
            .set_num_format(MONEY_FORMAT);
        let footer_date = Format::new()
            .set_bold()
            .set_border_top(FormatBorder::Thin)
            .set_num_format(DATE_FORMAT);
        write_row(
            worksheet,
            rows.len() as u32 + 1,
            &footer,
            &numeric,
            &dates,
            &footer_number,
            &footer_date,
            Some(&footer_text),
        )?;
    }

    // Freeze the header and keep the filter over the data rows only, exactly as
    // the ExcelJS workbook did.
    worksheet.set_freeze_panes(1, 0).map_err(xlsx_error)?;
    worksheet
        .autofilter(0, 0, rows.len() as u32, (head.len() - 1) as u16)
        .map_err(xlsx_error)?;

    workbook.save_to_buffer().map_err(xlsx_error)
}

#[cfg(test)]
mod tests {
    use super::{parse_export_date, parse_export_number, sheet_name_from};

    #[test]
    fn cleans_sheet_names() {
        assert_eq!(
            sheet_name_from("Sales/Register: 2026"),
            "Sales Register 2026"
        );
        assert_eq!(sheet_name_from("   "), "Export");
        assert_eq!(sheet_name_from("'Sales'"), "Sales");
        assert_eq!(sheet_name_from("History"), "History (1)");
        assert_eq!(sheet_name_from(&"x".repeat(40)).len(), 31);
    }

    #[test]
    fn parses_display_money() {
        assert_eq!(parse_export_number("₹1,23,456.78"), Some(123_456.78));
        assert_eq!(parse_export_number("-₹1,200.00"), Some(-1200.0));
        assert_eq!(parse_export_number("(1,200.00)"), Some(-1200.0));
        assert_eq!(parse_export_number("—"), None);
        assert_eq!(parse_export_number(""), None);
        assert_eq!(parse_export_number("-"), None);
        assert_eq!(parse_export_number("N/A"), None);
    }

    #[test]
    fn parses_report_dates() {
        assert_eq!(parse_export_date("2026-10-23"), Some((2026, 10, 23)));
        assert_eq!(parse_export_date("23 Oct 2026"), Some((2026, 10, 23)));
        assert_eq!(parse_export_date("23/10/2026"), Some((2026, 10, 23)));
        assert_eq!(parse_export_date("2026-02-31"), None);
        assert_eq!(parse_export_date("31 Apr 2026"), None);
        assert_eq!(parse_export_date("not a date"), None);
    }
}
