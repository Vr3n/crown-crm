//! Password hashing, matching the Electron implementation byte for byte:
//! scrypt with N=2^14, r=8, p=1, 64-byte key, salt = the ASCII bytes of a
//! 16-byte hex salt, stored as `salt:hash`. Existing databases keep working.

use rand::RngCore;
use scrypt::{scrypt, Params};

use crate::error::{AppError, AppResult};

const KEY_LENGTH: usize = 64;
const LOG_N: u8 = 14;
const R: u32 = 8;
const P: u32 = 1;

pub fn hash_password(plain: &str) -> AppResult<String> {
    let mut salt_bytes = [0u8; 16];
    rand::rng().fill_bytes(&mut salt_bytes);
    let salt = hex_encode(&salt_bytes);
    let mut out = [0u8; KEY_LENGTH];
    // scrypt derives a key as long as the output buffer, so KEY_LENGTH is the
    // dkLen and is not a `Params` argument in 0.12.
    let params = Params::new(LOG_N, R, P).map_err(|err| AppError::internal(format!("scrypt params: {err}")))?;
    scrypt(plain.as_bytes(), salt.as_bytes(), &params, &mut out)
        .map_err(|err| AppError::internal(format!("scrypt failed: {err}")))?;
    Ok(format!("{salt}:{}", hex_encode(&out)))
}

/// Constant-time comparison of a plain password against a stored `salt:hash`.
pub fn verify_password(plain: &str, stored: &str) -> bool {
    let Some((salt, expected_hex)) = stored.split_once(':') else {
        return false;
    };
    let Some(expected) = hex_decode(expected_hex) else {
        return false;
    };
    let mut out = [0u8; KEY_LENGTH];
    let Ok(params) = Params::new(LOG_N, R, P) else {
        return false;
    };
    if scrypt(plain.as_bytes(), salt.as_bytes(), &params, &mut out).is_err() {
        return false;
    }
    constant_time_eq(&expected, &out)
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn hex_decode(text: &str) -> Option<Vec<u8>> {
    if text.len() % 2 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(text.len() / 2);
    let bytes = text.as_bytes();
    for pair in bytes.chunks(2) {
        let high = (pair[0] as char).to_digit(16)?;
        let low = (pair[1] as char).to_digit(16)?;
        out.push(((high << 4) | low) as u8);
    }
    Some(out)
}
