//! Pure helpers for the printed invoice.
//!
//! Mirrors `src/shared/invoice.ts`, `src/shared/amount-in-words.ts` and
//! `src/shared/indian-states.ts`. No locale, no floating point: the same bytes
//! must come out on every machine.

const MONTH_NAMES: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const ONES: [&str; 20] = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
];

const TENS: [&str; 10] = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

/// Indian scale words: index 1 is thousand, then every step is one hundred times.
const SCALES: [&str; 9] = [
    "", "Thousand", "Lakh", "Crore", "Arab", "Kharab", "Neel", "Padma", "Shankh",
];

/// Indian digit grouping: `1234567` -> `12,34,567`.
pub fn group_indian(digits: &str) -> String {
    let trimmed = digits.trim_start_matches('0');
    let clean = if trimmed.is_empty() && !digits.is_empty() {
        "0"
    } else {
        trimmed
    };
    let chars: Vec<char> = clean.chars().collect();
    if chars.len() <= 3 {
        return clean.to_string();
    }

    let split = chars.len() - 3;
    let rest = &chars[..split];
    let last: String = chars[split..].iter().copied().collect();
    let mut grouped = String::new();
    for (index, ch) in rest.iter().enumerate() {
        if index > 0 && (rest.len() - index) % 2 == 0 {
            grouped.push(',');
        }
        grouped.push(*ch);
    }
    grouped.push(',');
    grouped.push_str(&last);
    grouped
}

/// `455000` -> `4,550.00` (always two decimals, no currency symbol).
pub fn format_amount(minor: i64) -> String {
    let value = minor as i128;
    let sign = if value < 0 { "-" } else { "" };
    let absolute = value.abs();
    let whole = absolute / 100;
    let fraction = absolute % 100;
    format!("{sign}{}.{fraction:02}", group_indian(&whole.to_string()))
}

/// `25000` -> `2.5`; `1` -> `0.0001`. Quantities keep up to four decimals.
pub fn format_qty(qty_e4: i64) -> String {
    let value = qty_e4 as i128;
    let sign = if value < 0 { "-" } else { "" };
    let absolute = value.abs();
    let whole = group_indian(&(absolute / 10_000).to_string());
    let fraction = format!("{:04}", absolute % 10_000);
    let fraction = fraction.trim_end_matches('0');
    if fraction.is_empty() {
        format!("{sign}{whole}")
    } else {
        format!("{sign}{whole}.{fraction}")
    }
}

/// `1800` -> `18%`; `250` -> `2.5%`; `0` -> `0%`.
pub fn format_percent(bps: i64) -> String {
    let whole = bps / 100;
    let fraction = format!("{:02}", (bps % 100).abs());
    let fraction = fraction.trim_end_matches('0');
    if fraction.is_empty() {
        format!("{whole}%")
    } else {
        format!("{whole}.{fraction}%")
    }
}

/// `2026-10-29` -> `29 Oct 2026`. Unknown input is returned unchanged.
pub fn format_date(value: &str) -> String {
    let text = value.trim();
    if text.len() >= 10 && text.is_ascii() {
        let bytes = text.as_bytes();
        if bytes[4] == b'-' && bytes[7] == b'-' {
            if let (Ok(year), Ok(month)) = (text[0..4].parse::<i32>(), text[5..7].parse::<usize>())
            {
                if let Some(name) = MONTH_NAMES.get(month.wrapping_sub(1)) {
                    return format!("{} {name} {year}", &text[8..10]);
                }
            }
        }
    }
    text.to_string()
}

fn two_digits(value: u64) -> String {
    if value < 20 {
        return ONES[value as usize].to_string();
    }
    let tens = (value / 10) as usize;
    let ones = (value % 10) as usize;
    if ones == 0 {
        TENS[tens].to_string()
    } else {
        format!("{} {}", TENS[tens], ONES[ones])
    }
}

fn three_digits(value: u64) -> String {
    let hundreds = (value / 100) as usize;
    let rest = value % 100;
    let mut parts = Vec::new();
    if hundreds > 0 {
        parts.push(format!("{} Hundred", ONES[hundreds]));
    }
    if rest > 0 {
        parts.push(two_digits(rest));
    }
    parts.join(" ")
}

/// `0` -> `""` (the caller decides how to phrase a zero amount).
fn whole_number_words(value: u64) -> String {
    if value == 0 {
        return String::new();
    }

    let mut groups = Vec::new();
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
        let group_words = if index == 0 {
            three_digits(group)
        } else {
            two_digits(group)
        };
        if scale.is_empty() {
            words.push(group_words);
        } else {
            words.push(format!("{group_words} {scale}"));
        }
    }
    words.join(" ")
}

fn currency_word(currency: &str) -> String {
    match currency.to_uppercase().as_str() {
        "INR" => "Rupees".to_string(),
        "USD" => "Dollars".to_string(),
        "EUR" => "Euros".to_string(),
        "GBP" => "Pounds".to_string(),
        "AED" => "Dirhams".to_string(),
        "SGD" => "Singapore Dollars".to_string(),
        other => other.to_string(),
    }
}

fn subunit_word(currency: &str) -> &'static str {
    match currency.to_uppercase().as_str() {
        "INR" => "Paise",
        "USD" | "EUR" | "SGD" => "Cents",
        "GBP" => "Pence",
        "AED" => "Fils",
        _ => "Cents",
    }
}

/// `Rupees Four Thousand Five Hundred Fifty Only`
/// `Rupees Two Thousand Three Hundred Seventy One and Eighteen Paise Only`
pub fn amount_in_words(minor: i64, currency: &str) -> String {
    let value = minor as i128;
    let negative = value < 0;
    let absolute = value.abs();
    let whole = (absolute / 100) as u64;
    let fraction = (absolute % 100) as u64;

    let currency_words = currency_word(currency);
    let whole_words = whole_number_words(whole);
    let mut parts = Vec::new();
    if whole_words.is_empty() {
        parts.push(format!("{currency_words} Zero"));
    } else {
        parts.push(format!("{currency_words} {whole_words}"));
    }

    if fraction > 0 {
        parts.push(format!(
            "{} {}",
            whole_number_words(fraction),
            subunit_word(currency)
        ));
    }

    let body = parts.join(" and ");
    if negative {
        format!("Minus {body} Only")
    } else {
        format!("{body} Only")
    }
}

/// GST state code -> `Maharashtra (27)`. An unknown code falls back to the code
/// alone so a missing master never blanks the invoice.
pub fn state_label(code: &str) -> Option<String> {
    let value = code.trim();
    if value.is_empty() {
        return None;
    }
    match INDIAN_STATES.iter().find(|(key, _)| *key == value) {
        Some((_, name)) => Some(format!("{name} ({value})")),
        None => Some(value.to_string()),
    }
}

/// CBIC state codes. 26 (Daman and Diu) is kept because older books carry it;
/// new records use 25 for the merged union territory.
const INDIAN_STATES: [(&str, &str); 37] = [
    ("01", "Jammu and Kashmir"),
    ("02", "Himachal Pradesh"),
    ("03", "Punjab"),
    ("04", "Chandigarh"),
    ("05", "Uttarakhand"),
    ("06", "Haryana"),
    ("07", "Delhi"),
    ("08", "Rajasthan"),
    ("09", "Uttar Pradesh"),
    ("10", "Bihar"),
    ("11", "Sikkim"),
    ("12", "Arunachal Pradesh"),
    ("13", "Nagaland"),
    ("14", "Manipur"),
    ("15", "Mizoram"),
    ("16", "Tripura"),
    ("17", "Meghalaya"),
    ("18", "Assam"),
    ("19", "West Bengal"),
    ("20", "Jharkhand"),
    ("21", "Odisha"),
    ("22", "Chhattisgarh"),
    ("23", "Madhya Pradesh"),
    ("24", "Gujarat"),
    ("25", "Dadra and Nagar Haveli and Daman and Diu"),
    ("26", "Daman and Diu"),
    ("27", "Maharashtra"),
    ("28", "Andhra Pradesh (old)"),
    ("29", "Karnataka"),
    ("30", "Goa"),
    ("31", "Lakshadweep"),
    ("32", "Kerala"),
    ("33", "Tamil Nadu"),
    ("34", "Puducherry"),
    ("35", "Andaman and Nicobar Islands"),
    ("36", "Telangana"),
    ("37", "Andhra Pradesh"),
];

#[cfg(test)]
mod tests {
    use super::{
        amount_in_words, format_amount, format_date, format_percent, format_qty, group_indian,
        state_label,
    };

    #[test]
    fn groups_digits_the_indian_way() {
        assert_eq!(group_indian("1234567"), "12,34,567");
        assert_eq!(group_indian("4550"), "4,550");
        assert_eq!(group_indian("999"), "999");
        assert_eq!(group_indian("000"), "0");
    }

    #[test]
    fn formats_money_quantities_and_rates() {
        assert_eq!(format_amount(455_000), "4,550.00");
        assert_eq!(format_amount(-120_000), "-1,200.00");
        assert_eq!(format_amount(1), "0.01");
        assert_eq!(format_qty(25_000), "2.5");
        assert_eq!(format_qty(1), "0.0001");
        assert_eq!(format_percent(1800), "18%");
        assert_eq!(format_percent(250), "2.5%");
    }

    #[test]
    fn formats_business_dates() {
        assert_eq!(format_date("2026-10-29"), "29 Oct 2026");
        assert_eq!(format_date(""), "");
        assert_eq!(format_date("29/10/2026"), "29/10/2026");
    }

    #[test]
    fn writes_amounts_in_words() {
        assert_eq!(
            amount_in_words(455_000, "INR"),
            "Rupees Four Thousand Five Hundred Fifty Only"
        );
        assert_eq!(
            amount_in_words(237_118, "INR"),
            "Rupees Two Thousand Three Hundred Seventy One and Eighteen Paise Only"
        );
        assert_eq!(amount_in_words(0, "INR"), "Rupees Zero Only");
        assert_eq!(amount_in_words(-100, "INR"), "Minus Rupees One Only");
    }

    #[test]
    fn labels_states() {
        assert_eq!(state_label("27").as_deref(), Some("Maharashtra (27)"));
        assert_eq!(state_label("").as_deref(), None);
        assert_eq!(state_label("88").as_deref(), Some("88"));
    }
}
