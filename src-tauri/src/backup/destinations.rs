//! Backup destinations: the primary folder plus any extra folders the user
//! picked, persisted in `backup-destinations.json` next to the database.
//!
//! Mirrors `src/main/backup/destinations.ts`. Destinations are a machine
//! setting, not business data, so they stay out of SQLite: a backup restored on
//! another computer must not carry stale drive letters.

use std::path::{Component, Path, PathBuf};

use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

const FILE: &str = "backup-destinations.json";

/// `C:\Books\` -> `C:\Books`, but a drive root (`C:\`) stays intact.
///
/// Electron's `path.resolve` also makes the value absolute, so a relative entry
/// cannot be stored and later resolved against a different working directory.
pub fn normalize_folder(folder: &str) -> AppResult<String> {
    let trimmed = folder.trim();
    if trimmed.is_empty() {
        return Err(AppError::internal("Choose a folder first."));
    }

    let candidate = Path::new(trimmed);
    let absolute = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|err| AppError::internal(format!("Could not resolve that folder: {err}")))?
            .join(candidate)
    };

    Ok(lexical_absolute(absolute).to_string_lossy().to_string())
}

/// Resolves `.` and `..` without touching the filesystem (the folder may not
/// exist yet, so `canonicalize` is not an option).
fn lexical_absolute(path: PathBuf) -> PathBuf {
    let mut resolved = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => resolved.push(prefix.as_os_str()),
            Component::RootDir => resolved.push(Component::RootDir.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                if !resolved.pop() {
                    resolved.push("..");
                }
            }
            Component::Normal(part) => resolved.push(part),
        }
    }
    resolved
}

/// Case-insensitive folder comparison, after normalisation.
pub fn same_folder(a: &str, b: &str) -> bool {
    match (normalize_folder(a), normalize_folder(b)) {
        (Ok(left), Ok(right)) => left.to_lowercase() == right.to_lowercase(),
        _ => false,
    }
}

/// The persisted extra folders. A missing or corrupt settings file reads as an
/// empty list: the primary backup still works, so this is never fatal.
pub fn read_destinations(base_dir: &Path) -> Vec<String> {
    let Ok(raw) = std::fs::read_to_string(base_dir.join(FILE)) else {
        return Vec::new();
    };
    let Ok(Value::Array(entries)) = serde_json::from_str::<Value>(&raw) else {
        return Vec::new();
    };
    entries
        .iter()
        .filter_map(|entry| entry.as_str())
        .filter(|entry| !entry.trim().is_empty())
        .map(str::to_string)
        .collect()
}

fn write_destinations(base_dir: &Path, folders: &[String]) -> AppResult<()> {
    let payload = serde_json::to_string_pretty(folders)?;
    std::fs::write(base_dir.join(FILE), payload)
        .map_err(|err| AppError::internal(format!("Could not save the backup folders: {err}")))
}

/// `{ primary, extras: [{ path, available }] }` — the shape `BackupDestinations`
/// declares and `BackupPage` reads.
pub fn list_destinations(base_dir: &Path, primary_dir: &Path) -> Value {
    let extras: Vec<Value> = read_destinations(base_dir)
        .into_iter()
        .map(|path| {
            let available = Path::new(&path).exists();
            json!({ "path": path, "available": available })
        })
        .collect();

    json!({
        "primary": primary_dir.to_string_lossy(),
        "extras": extras
    })
}

pub fn add_destination(base_dir: &Path, folder: &str, primary_dir: &Path) -> AppResult<Value> {
    let normalized = normalize_folder(folder)?;
    if !Path::new(&normalized).exists() {
        return Err(AppError::internal("That folder does not exist."));
    }
    if same_folder(&normalized, &primary_dir.to_string_lossy()) {
        return Err(AppError::internal(
            "The primary backup folder is already included.",
        ));
    }

    let mut current = read_destinations(base_dir);
    if current.iter().any(|entry| same_folder(entry, &normalized)) {
        return Err(AppError::internal(
            "That folder is already a backup destination.",
        ));
    }

    current.push(normalized);
    write_destinations(base_dir, &current)?;
    Ok(list_destinations(base_dir, primary_dir))
}

pub fn remove_destination(base_dir: &Path, folder: &str, primary_dir: &Path) -> AppResult<Value> {
    let normalized = normalize_folder(folder)?;
    if same_folder(&normalized, &primary_dir.to_string_lossy()) {
        return Err(AppError::internal(
            "The primary backup folder cannot be removed.",
        ));
    }

    let remaining: Vec<String> = read_destinations(base_dir)
        .into_iter()
        .filter(|entry| !same_folder(entry, &normalized))
        .collect();
    write_destinations(base_dir, &remaining)?;
    Ok(list_destinations(base_dir, primary_dir))
}

/// Copies one backup into every extra folder. Each folder is independent: an
/// unplugged drive is reported and the remaining copies still happen.
pub fn copy_to_folders(source: &Path, folders: &[String], name: &str) -> Vec<Value> {
    folders
        .iter()
        .map(|folder| {
            let dir = Path::new(folder);
            if !dir.exists() {
                return json!({ "path": folder, "ok": false, "error": "Folder is not available" });
            }
            if let Err(err) = std::fs::create_dir_all(dir) {
                return json!({ "path": folder, "ok": false, "error": err.to_string() });
            }
            match std::fs::copy(source, dir.join(name)) {
                Ok(_) => json!({ "path": folder, "ok": true }),
                Err(err) => json!({ "path": folder, "ok": false, "error": err.to_string() }),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{normalize_folder, same_folder};

    #[cfg(windows)]
    #[test]
    fn keeps_a_windows_drive_root_intact() {
        assert_eq!(normalize_folder(" C:\\ ").ok().as_deref(), Some("C:\\"));
    }

    #[cfg(windows)]
    #[test]
    fn drops_trailing_separators_and_resolves_dot_segments() {
        assert_eq!(
            normalize_folder("C:\\Books\\Backup\\").ok().as_deref(),
            Some("C:\\Books\\Backup")
        );
        assert_eq!(
            normalize_folder("C:\\Books\\..\\Other").ok().as_deref(),
            Some("C:\\Other")
        );
    }

    #[test]
    fn rejects_an_empty_folder() {
        assert!(normalize_folder("   ").is_err());
    }

    #[test]
    fn compares_folders_case_insensitively() {
        assert!(same_folder("C:\\Books\\Backup", "c:\\books\\backup\\"));
        assert!(!same_folder("C:\\Books\\Backup", "C:\\Books\\Other"));
    }
}
