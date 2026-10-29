//! Install lock status.
//!
//! Mirrors `src/main/licensing/install-lock.ts` and
//! `src/main/licensing/fingerprint.ts`. The installer writes `machine.lock`
//! (the Windows `MachineGuid`) next to the executable; every launch compares it
//! with the current machine. A copy of the application folder on another PC
//! carries a different GUID and is refused.
//!
//! There is no activation step and no vendor round trip: the only state the
//! renderer sees is ACTIVE or LOCKED (+ a reason).

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::state::Ctx;

const LOCK_FILENAME: &str = "machine.lock";
const REGISTRY_KEY: &str = "HKLM\\SOFTWARE\\Microsoft\\Cryptography";
const REGISTRY_VALUE: &str = "MachineGuid";

/// `CROWN_BOOKS_E2E=1` short-circuits the check. Only the end-to-end launcher
/// sets it, because tests run from a source tree that has no installer lock.
const E2E_ENV: &str = "CROWN_BOOKS_E2E";

/// MachineGuid lookups spawn `reg.exe`, so successful reads are cached for the
/// life of the process, exactly like `cachedMachineGuid` in TypeScript.
static GUID_CACHE: Mutex<Option<String>> = Mutex::new(None);

/// The install directory: the folder containing the running executable.
///
/// Electron used `dirname(process.execPath)`, which is the same folder the
/// NSIS installer writes `machine.lock` into.
pub fn install_dir() -> AppResult<PathBuf> {
    let exe = std::env::current_exe().map_err(|err| {
        AppError::internal(format!("Cannot locate the running application: {err}"))
    })?;
    Ok(exe
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from(".")))
}

fn lock_path(install_dir: &Path) -> PathBuf {
    install_dir.join(LOCK_FILENAME)
}

/// The lock's MachineGuid, or `None` when the file is missing or empty.
fn read_lock(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Trim + lowercase. Windows registry output is uppercase; a hand-edited lock
/// is not, and the two must still compare equal.
pub fn normalize_machine_guid(value: &str) -> String {
    value.trim().to_lowercase()
}

/// Reads `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid` through `reg.exe`.
///
/// The TypeScript version used `execFileSync`; a plain `Command` keeps the same
/// dependency-free approach (no winreg/WMI crate, no PowerShell).
pub fn collect_machine_guid() -> AppResult<String> {
    if let Ok(guard) = GUID_CACHE.lock() {
        if let Some(cached) = guard.as_ref() {
            return Ok(cached.clone());
        }
    }

    let output = reg_command()
        .args(["query", REGISTRY_KEY, "/v", REGISTRY_VALUE])
        .output()
        .map_err(|err| AppError::internal(format!("Cannot read the Windows machine id: {err}")))?;
    if !output.status.success() {
        return Err(AppError::internal("Cannot read the Windows machine id"));
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let guid = find_guid(&text)
        .ok_or_else(|| AppError::internal("MachineGuid not found in registry output"))?;
    let guid = normalize_machine_guid(&guid);

    if let Ok(mut guard) = GUID_CACHE.lock() {
        *guard = Some(guid.clone());
    }
    Ok(guid)
}

/// `reg.exe` is a console program: hide its window so the check never flashes a
/// black box on screen (`windowsHide: true` in the TypeScript version).
fn reg_command() -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut command = Command::new("reg.exe");
        command.creation_flags(CREATE_NO_WINDOW);
        command
    }
    #[cfg(not(windows))]
    {
        Command::new("reg.exe")
    }
}

/// First `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` token in `text`.
///
/// The registry output is `    MachineGuid    REG_SZ    <guid>`, but the value
/// is located by pattern rather than by column so a localised layout still
/// parses.
fn find_guid(text: &str) -> Option<String> {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() < 36 {
        return None;
    }
    for start in 0..=(chars.len() - 36) {
        let candidate = &chars[start..start + 36];
        let is_guid = candidate.iter().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => *ch == '-',
            _ => ch.is_ascii_hexdigit(),
        });
        if is_guid {
            return Some(candidate.iter().copied().collect());
        }
    }
    None
}

/// Writes `machine.lock` at launch when the installer did not.
///
/// Mirrors `src/main/licensing/ensure.ts`: an existing lock is never touched, so
/// a copied folder still fails the check. A write that fails (for example a
/// read-only install root) is ignored and `license:status` reports NO_LOCK.
pub fn ensure_install_lock() {
    if std::env::var(E2E_ENV).ok().as_deref() == Some("1") {
        return;
    }
    let Ok(dir) = install_dir() else {
        return;
    };
    let path = lock_path(&dir);
    if path.exists() {
        return;
    }
    let Ok(guid) = collect_machine_guid() else {
        return;
    };
    let _ = std::fs::write(&path, format!("{guid}\n"));
}

/// `license:status`.
fn status() -> AppResult<Value> {
    if std::env::var(E2E_ENV).ok().as_deref() == Some("1") {
        return Ok(json!({ "state": "ACTIVE" }));
    }

    let dir = install_dir()?;
    let path = lock_path(&dir);
    let exists = path.exists();

    let Some(lock) = read_lock(&path) else {
        let reason = if exists { "CORRUPT" } else { "NO_LOCK" };
        return Ok(json!({ "state": "LOCKED", "reason": reason }));
    };

    let Ok(current) = collect_machine_guid() else {
        return Ok(json!({ "state": "LOCKED", "reason": "FINGERPRINT_MISMATCH" }));
    };

    if normalize_machine_guid(&current) != normalize_machine_guid(&lock) {
        return Ok(json!({ "state": "LOCKED", "reason": "FINGERPRINT_MISMATCH" }));
    }

    Ok(json!({ "state": "ACTIVE" }))
}

pub fn dispatch(_ctx: &mut Ctx<'_>, channel: &str, _args: &[Value]) -> Option<AppResult<Value>> {
    match channel {
        "license:status" => Some(status()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{find_guid, normalize_machine_guid};

    #[test]
    fn finds_the_guid_in_reg_output() {
        let output = "\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    \
                      MachineGuid    REG_SZ    4c44f3d9-9f1e-0b6a-2d7f-1e6c9a11bb22\r\n\r\n";
        assert_eq!(
            find_guid(output).as_deref(),
            Some("4c44f3d9-9f1e-0b6a-2d7f-1e6c9a11bb22")
        );
    }

    #[test]
    fn ignores_text_without_a_guid() {
        assert_eq!(find_guid("MachineGuid    REG_SZ    not-a-guid"), None);
        assert_eq!(find_guid(""), None);
    }

    #[test]
    fn normalizes_case_and_whitespace() {
        assert_eq!(
            normalize_machine_guid("  AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE\r\n"),
            "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        );
    }
}
