//! Resolves the writable data directory.
//!
//! Electron stored everything in `app.getPath('userData')`, which on Windows is
//! `%APPDATA%\Crown Books`. The Tauri identifier would give
//! `%APPDATA%\com.crownbooks.app`, so the path is built explicitly instead: an
//! in-place upgrade keeps the existing database, backups and install lock.
//!
//! `CROWN_BOOKS_USER_DATA` still overrides the location for scripted runs.

use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Paths {
    pub user_data: PathBuf,
    pub database: PathBuf,
    pub backups: PathBuf,
    pub logs: PathBuf,
}

impl Paths {
    pub fn resolve() -> Self {
        let user_data = match std::env::var("CROWN_BOOKS_USER_DATA") {
            Ok(dir) if !dir.trim().is_empty() => PathBuf::from(dir),
            _ => default_user_data(),
        };

        let backups = user_data.join("backups");
        let logs = user_data.join("logs");
        Self { database: user_data.join("crown-books.db"), backups, logs, user_data }
    }

    /// Creates the data, backup and log directories. Safe to call on every start.
    pub fn ensure(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.user_data)?;
        std::fs::create_dir_all(&self.backups)?;
        std::fs::create_dir_all(&self.logs)?;
        Ok(())
    }
}

fn default_user_data() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        if !appdata.trim().is_empty() {
            return PathBuf::from(appdata).join("Crown Books");
        }
    }
    // Non-Windows fallbacks only matter for development on another OS.
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".crown-books");
    }
    PathBuf::from(".crown-books")
}
