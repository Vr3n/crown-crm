//! Stable error catalog and the IPC envelope.
//!
//! Mirrors `src/shared/contracts/errors.ts` and `src/main/domain/errors.ts`.
//! Every command resolves to `{ ok: true, data }` or `{ ok: false, error }`;
//! the renderer branches on `error.code`, never on `error.message`.

use serde::Serialize;
use serde_json::{json, Value};

// Mirrors ERROR_CODES in src/shared/contracts/errors.ts one for one: a code the
// renderer may branch on stays declared even before a Rust module emits it.
#[allow(dead_code)]
pub mod codes {
    pub const VALIDATION_ERROR: &str = "VALIDATION_ERROR";
    pub const NOT_FOUND: &str = "NOT_FOUND";
    pub const CONFLICT: &str = "CONFLICT";
    pub const UNAUTHENTICATED: &str = "UNAUTHENTICATED";
    pub const PERMISSION_DENIED: &str = "PERMISSION_DENIED";
    pub const INVALID_STATE_TRANSITION: &str = "INVALID_STATE_TRANSITION";

    pub const VOUCHER_UNBALANCED: &str = "VOUCHER_UNBALANCED";
    pub const ACCOUNT_NOT_POSTABLE: &str = "ACCOUNT_NOT_POSTABLE";
    pub const CROSS_COMPANY_REFERENCE: &str = "CROSS_COMPANY_REFERENCE";
    pub const PARTY_NOT_ALLOWED: &str = "PARTY_NOT_ALLOWED";
    pub const PERIOD_LOCKED: &str = "PERIOD_LOCKED";
    pub const INVALID_LINE_VALUE: &str = "INVALID_LINE_VALUE";
    pub const ROUND_OFF_TOO_LARGE: &str = "ROUND_OFF_TOO_LARGE";
    pub const NUMBER_COLLISION: &str = "NUMBER_COLLISION";
    pub const DUPLICATE_SUPPLIER_BILL: &str = "DUPLICATE_SUPPLIER_BILL";

    pub const ALLOCATION_EXCEEDS_BILL: &str = "ALLOCATION_EXCEEDS_BILL";
    pub const ALLOCATION_EXCEEDS_PAYMENT: &str = "ALLOCATION_EXCEEDS_PAYMENT";
    pub const IDEMPOTENCY_CONFLICT: &str = "IDEMPOTENCY_CONFLICT";

    pub const DUPLICATE: &str = "DUPLICATE";
    pub const DUPLICATE_TRANSACTION: &str = "DUPLICATE_TRANSACTION";
    pub const INTERNAL_ERROR: &str = "INTERNAL_ERROR";
}

#[derive(Debug, Clone, Serialize)]
#[allow(dead_code)]
pub struct IpcError {
    pub code: String,
    pub message: String,
}

#[derive(Debug)]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::new(codes::VALIDATION_ERROR, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(codes::NOT_FOUND, message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(codes::CONFLICT, message)
    }

    pub fn unauthenticated(message: impl Into<String>) -> Self {
        Self::new(codes::UNAUTHENTICATED, message)
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(codes::UNAUTHENTICATED, message)
    }

    pub fn permission_denied(permission: &str) -> Self {
        Self::new(codes::PERMISSION_DENIED, format!("Missing permission: {permission}"))
    }

    #[allow(dead_code)]
    pub fn invalid_state(message: impl Into<String>) -> Self {
        Self::new(codes::INVALID_STATE_TRANSITION, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(codes::INTERNAL_ERROR, message)
    }

    #[allow(dead_code)]
    pub fn to_ipc(&self) -> IpcError {
        IpcError { code: self.code.to_string(), message: self.message.clone() }
    }

    /// The wire envelope for a failure.
    pub fn envelope(&self) -> Value {
        json!({ "ok": false, "error": { "code": self.code, "message": self.message } })
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        match &err {
            rusqlite::Error::SqliteFailure(inner, message) => {
                if inner.code == rusqlite::ErrorCode::ConstraintViolation {
                    let detail = message.clone().unwrap_or_else(|| "Constraint violation".to_string());
                    return AppError::conflict(detail);
                }
                AppError::internal(err.to_string())
            }
            _ => AppError::internal(err.to_string()),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::internal(format!("Serialization failed: {err}"))
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::internal(err.to_string())
    }
}

/// Success envelope.
pub fn ok(data: Value) -> Value {
    json!({ "ok": true, "data": data })
}
