//! Export: PDF, XLSX, CSV and invoice PDF.
//!
//! Mirrors `src/main/ipc/export.ts` and `src/main/ipc/invoice.ts`. The save
//! path always comes from the native dialog, so the renderer can never choose a
//! path or overwrite a file silently, and a cancelled dialog writes nothing.

mod invoice_format;
pub mod invoice_pdf;
pub mod xlsx;

use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::db::permissions::codes as perm;
use crate::error::{AppError, AppResult};
use crate::json::{arg, req_i64, req_str};
use crate::state::Ctx;

/// `Sales Register (April) 2026` -> `sales-register-april-2026`, matching the
/// default file name the Electron save dialog used.
fn safe_filename(name: &str) -> String {
    let mut out = String::new();
    let mut pending_dash = false;
    for ch in name.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            if pending_dash && !out.is_empty() {
                out.push('-');
            }
            pending_dash = false;
            out.push(ch);
        } else {
            pending_dash = true;
        }
    }
    if out.is_empty() {
        "export".to_string()
    } else {
        out
    }
}

fn choose_save_path(
    ctx: &Ctx<'_>,
    title: &str,
    file_name: String,
    filter_name: &str,
    extension: &str,
) -> AppResult<Option<PathBuf>> {
    let picked = ctx
        .app_handle()?
        .dialog()
        .file()
        .set_title(title)
        .set_file_name(file_name)
        .add_filter(filter_name, &[extension])
        .blocking_save_file();

    match picked {
        None => Ok(None),
        Some(file_path) => file_path
            .into_path()
            .map(Some)
            .map_err(|err| AppError::internal(format!("Could not use that file name: {err}"))),
    }
}

/// Showing the saved file is best effort: the file is already on disk, so a
/// file manager that refuses to open must never turn a save into an error.
fn reveal_saved_file(ctx: &Ctx<'_>, path: &Path) {
    if let Some(app) = ctx.app {
        let _ = app.opener().reveal_item_in_dir(path);
    }
}

fn write_file(path: &Path, bytes: &[u8], label: &str) -> AppResult<()> {
    std::fs::write(path, bytes)
        .map_err(|err| AppError::internal(format!("Could not save the {label}: {err}")))
}

fn saved(path: &Path) -> Value {
    json!({ "saved": true, "filePath": path.to_string_lossy() })
}

/// Builds the workbook, asks where to save it, writes it and reveals it.
fn export_xlsx(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_EXPORT)?;

    let filename = req_str(input, "filename")?.trim().to_string();
    if filename.is_empty() {
        return Err(AppError::validation("filename is required"));
    }

    let default_name = format!("{}.xlsx", safe_filename(&filename));
    let Some(target) = choose_save_path(
        ctx,
        "Save spreadsheet",
        default_name,
        "Excel workbook",
        "xlsx",
    )?
    else {
        return Ok(json!({ "saved": false }));
    };

    let bytes = xlsx::build(input)?;
    write_file(&target, &bytes, "spreadsheet")?;
    reveal_saved_file(ctx, &target);
    Ok(saved(&target))
}

/// The renderer builds the CSV text (it already has the display strings) and
/// the BOM; only the path and the write happen here.
fn export_csv(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_EXPORT)?;

    let filename = req_str(input, "filename")?.trim().to_string();
    if filename.is_empty() {
        return Err(AppError::validation("filename is required"));
    }
    let csv = req_str(input, "csv")?;
    if csv.is_empty() {
        return Err(AppError::validation("csv is required"));
    }

    let default_name = format!("{}.csv", safe_filename(&filename));
    let Some(target) = choose_save_path(ctx, "Save CSV", default_name, "CSV", "csv")? else {
        return Ok(json!({ "saved": false }));
    };

    write_file(&target, csv.as_bytes(), "CSV")?;
    reveal_saved_file(ctx, &target);
    Ok(saved(&target))
}

/// Electron used `webContents.printToPDF()` here. Tauri exposes no PDF writer,
/// so the main window's own print dialog is opened instead: the renderer's
/// print stylesheet still decides what lands on paper, but the user picks the
/// "Save as PDF" printer. Nothing is written by us, hence `saved: false`.
fn export_pdf(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::REPORT_EXPORT)?;

    let filename = req_str(input, "filename")?.trim().to_string();
    if filename.is_empty() {
        return Err(AppError::validation("filename is required"));
    }

    let Some(window) = ctx.app.and_then(|app| app.get_webview_window("main")) else {
        return Ok(json!({ "saved": false, "printed": false }));
    };
    window
        .print()
        .map_err(|err| AppError::internal(format!("Could not open the print dialog: {err}")))?;

    Ok(json!({ "saved": false, "printed": true }))
}

/// The document is resolved here, from the voucher id only, so the renderer
/// cannot print another company's voucher or choose a path.
fn export_invoice_pdf(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::VOUCHER_VIEW)?;

    let id = req_i64(input, "id")?;
    if id <= 0 {
        return Err(AppError::validation("id must be a positive number"));
    }
    let company_id = ctx.company_id()?;

    // Owned by the vouchers module: the same read model `vouchers:invoice`
    // returns, so the PDF can never disagree with the on-screen invoice.
    let document = crate::vouchers::invoice_document(ctx.db(), company_id, id)?;

    let default_name = invoice_pdf::default_filename(&document);
    let Some(target) = choose_save_path(ctx, "Save invoice PDF", default_name, "PDF", "pdf")?
    else {
        return Ok(json!({ "saved": false }));
    };

    let bytes = invoice_pdf::build(&document)?;
    write_file(&target, &bytes, "invoice PDF")?;
    reveal_saved_file(ctx, &target);
    Ok(saved(&target))
}

pub fn dispatch(ctx: &mut Ctx<'_>, channel: &str, args: &[Value]) -> Option<AppResult<Value>> {
    match channel {
        "export:xlsx" => Some(export_xlsx(ctx, arg(args, 0))),
        "export:csv" => Some(export_csv(ctx, arg(args, 0))),
        "export:pdf" => Some(export_pdf(ctx, arg(args, 0))),
        "invoice:exportPdf" => Some(export_invoice_pdf(ctx, arg(args, 0))),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::safe_filename;

    #[test]
    fn builds_safe_file_names() {
        assert_eq!(
            safe_filename("Sales Register (April) 2026"),
            "sales-register-april-2026"
        );
        assert_eq!(safe_filename("INV/0001"), "inv-0001");
        assert_eq!(safe_filename("***"), "export");
        assert_eq!(safe_filename(""), "export");
    }
}
