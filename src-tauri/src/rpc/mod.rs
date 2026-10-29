//! Channel dispatcher.
//!
//! The renderer bridge calls one Tauri command, `rpc(channel, args)`, and the
//! channel strings are the same `IPC_CHANNELS` values Electron used. Each
//! module returns `None` for channels it does not own, so the list below is the
//! single place that knows every module.

use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::state::Ctx;
use crate::{access, backup, dashboard, export, identity, license, masters, numbering, reports, search, summaries, vouchers};

pub fn dispatch(ctx: &mut Ctx<'_>, channel: &str, args: &[Value]) -> AppResult<Value> {
    if let Some(result) = identity::dispatch(ctx, channel, args) {
        return result;
    }
    if let Some(result) = access::dispatch(ctx, channel, args) {
        return result;
    }
    if let Some(result) = masters::dispatch(ctx, channel, args) {
        return result;
    }
    if let Some(result) = numbering::dispatch(ctx, channel, args) {
        return result;
    }
    if let Some(result) = vouchers::dispatch(ctx, channel, args) {
        return result;
    }
    if let Some(result) = reports::dispatch(ctx, channel, args) {
        return result;
    }
    if let Some(result) = dashboard::dispatch(ctx, channel, args) {
        return result;
    }
    if let Some(result) = summaries::dispatch(ctx, channel, args) {
        return result;
    }
    if let Some(result) = search::dispatch(ctx, channel, args) {
        return result;
    }
    if let Some(result) = export::dispatch(ctx, channel, args) {
        return result;
    }
    if let Some(result) = backup::dispatch(ctx, channel, args) {
        return result;
    }
    if let Some(result) = license::dispatch(ctx, channel, args) {
        return result;
    }
    Err(AppError::internal(format!("Unknown IPC channel: {channel}")))
}
