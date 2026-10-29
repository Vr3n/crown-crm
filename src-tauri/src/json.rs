//! Small JSON helpers shared by the command modules.
//!
//! Inputs arrive as one `serde_json::Value` per IPC argument and outputs are
//! built with `json!`, so the wire shape stays exactly what the renderer
//! already expects from the Electron preload bridge.

use serde_json::Value;

use crate::error::{AppError, AppResult};

/// Argument at `index`, or JSON null when the renderer sent nothing.
pub fn arg(args: &[Value], index: usize) -> &Value {
    args.get(index).unwrap_or(&Value::Null)
}

/// Field lookup that tolerates a non-object argument.
pub fn field<'a>(value: &'a Value, key: &str) -> &'a Value {
    value.get(key).unwrap_or(&Value::Null)
}

pub fn opt_str(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

/// Trimmed string, with empty strings treated as absent (form fields post "").
pub fn opt_trimmed(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// `Some(None)` means an explicit JSON null, `None` means the key is absent.
/// This is what patch semantics need: omitted keeps, null clears.
pub fn patch_str(value: &Value, key: &str) -> Option<Option<String>> {
    match value.get(key) {
        None => None,
        Some(Value::Null) => Some(None),
        Some(Value::String(s)) => {
            let trimmed = s.trim();
            Some(if trimmed.is_empty() { None } else { Some(trimmed.to_string()) })
        }
        Some(_) => Some(None),
    }
}

pub fn req_str(value: &Value, key: &str) -> AppResult<String> {
    opt_str(value, key).ok_or_else(|| AppError::validation(format!("{key} is required")))
}

pub fn req_i64(value: &Value, key: &str) -> AppResult<i64> {
    value
        .get(key)
        .and_then(|v| v.as_i64())
        .ok_or_else(|| AppError::validation(format!("{key} is required")))
}

pub fn opt_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|v| v.as_i64())
}

#[allow(dead_code)]
pub fn opt_f64(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(|v| v.as_f64())
}

pub fn opt_bool(value: &Value, key: &str) -> Option<bool> {
    value.get(key).and_then(|v| v.as_bool())
}

#[allow(dead_code)]
pub fn bool_or(value: &Value, key: &str, fallback: bool) -> bool {
    opt_bool(value, key).unwrap_or(fallback)
}

pub fn i64_or(value: &Value, key: &str, fallback: i64) -> i64 {
    opt_i64(value, key).unwrap_or(fallback)
}

#[allow(dead_code)]
pub fn str_or(value: &Value, key: &str, fallback: &str) -> String {
    opt_str(value, key).unwrap_or_else(|| fallback.to_string())
}

pub fn array<'a>(value: &'a Value, key: &str) -> &'a [Value] {
    value.get(key).and_then(|v| v.as_array()).map(|v| v.as_slice()).unwrap_or(&[])
}

/// Validates a required text field and returns the trimmed value.
pub fn required_text(value: &Value, key: &str, label: &str, max: usize) -> AppResult<String> {
    let text = opt_trimmed(value, key)
        .ok_or_else(|| AppError::validation(format!("{label} is required")))?;
    if text.chars().count() > max {
        return Err(AppError::validation(format!("{label} must be {max} characters or fewer")));
    }
    Ok(text)
}

/// Validates an optional text field.
pub fn optional_text(value: &Value, key: &str, label: &str, max: usize) -> AppResult<Option<String>> {
    match opt_trimmed(value, key) {
        None => Ok(None),
        Some(text) if text.chars().count() > max => {
            Err(AppError::validation(format!("{label} must be {max} characters or fewer")))
        }
        Some(text) => Ok(Some(text)),
    }
}

pub fn int_in_range(value: &Value, key: &str, min: i64, max: i64) -> AppResult<i64> {
    let number = req_i64(value, key)?;
    if number < min || number > max {
        return Err(AppError::validation(format!("{key} must be between {min} and {max}")));
    }
    Ok(number)
}
