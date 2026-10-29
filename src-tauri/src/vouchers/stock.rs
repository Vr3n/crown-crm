//! Stock movements and valuation.
//!
//! Mirrors `itemRepo.averageCost` and the stock half of
//! `src/main/application/vouchers.ts`. The movement table is append-only: a
//! cancellation never rewrites a row, it only drops out of the costing queries
//! because they join `vouchers` with `status = 'POSTED'`.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::AppResult;

use super::posting::{round_half_up_div, QTY_SCALE};

/// One row of `stock_movements` before it is written.
#[derive(Debug, Clone)]
pub struct StockMovement {
    pub item_id: i64,
    pub godown_id: Option<i64>,
    pub qty_in_e4: i64,
    pub qty_out_e4: i64,
    pub unit_cost_minor: i64,
    pub movement_type: String,
}

/// A remaining FIFO layer, still in `qtyE4` units.
#[derive(Debug, Clone, Copy)]
struct Layer {
    qty_e4: i64,
    unit_cost_minor: i64,
}

fn purchase_price(conn: &Connection, company_id: i64, item_id: i64) -> AppResult<i64> {
    let price: Option<i64> = conn
        .query_row(
            "SELECT purchase_price_minor FROM items WHERE company_id = ?1 AND id = ?2",
            params![company_id, item_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(price.unwrap_or(0))
}

/// Weighted average unit cost from posted movements. Falls back to the item's
/// purchase price, exactly like `itemRepo.averageCost`.
pub fn average_cost(conn: &Connection, company_id: i64, item_id: i64) -> AppResult<i64> {
    let (qty, value): (i64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(m.qty_in_e4 - m.qty_out_e4), 0),
                COALESCE(SUM(m.qty_in_e4 * m.unit_cost_minor - m.qty_out_e4 * m.unit_cost_minor), 0)
         FROM stock_movements m
         JOIN vouchers v ON v.id = m.voucher_id AND v.status = 'POSTED'
         WHERE m.company_id = ?1 AND m.item_id = ?2",
        params![company_id, item_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    if qty > 0 {
        round_half_up_div(i128::from(value), i128::from(qty))
    } else {
        purchase_price(conn, company_id, item_id)
    }
}

/// Replays every posted movement in id order, keeping the layers still on hand.
fn remaining_layers(conn: &Connection, company_id: i64, item_id: i64) -> AppResult<Vec<Layer>> {
    let mut stmt = conn.prepare(
        "SELECT m.qty_in_e4, m.qty_out_e4, m.unit_cost_minor
         FROM stock_movements m
         JOIN vouchers v ON v.id = m.voucher_id AND v.status = 'POSTED'
         WHERE m.company_id = ?1 AND m.item_id = ?2
         ORDER BY m.id",
    )?;
    let rows = stmt.query_map(params![company_id, item_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i64>(2)?,
        ))
    })?;

    let mut layers: Vec<Layer> = Vec::new();
    for row in rows {
        let (qty_in_e4, qty_out_e4, unit_cost_minor) = row?;
        if qty_in_e4 > 0 {
            layers.push(Layer { qty_e4: qty_in_e4, unit_cost_minor });
        }
        let mut remaining = qty_out_e4;
        while remaining > 0 {
            let Some(front_qty) = layers.first().map(|layer| layer.qty_e4) else {
                break;
            };
            if front_qty > remaining {
                if let Some(front) = layers.first_mut() {
                    front.qty_e4 -= remaining;
                }
                remaining = 0;
            } else {
                remaining -= front_qty;
                layers.remove(0);
            }
        }
    }
    Ok(layers)
}

/// FIFO unit cost for issuing `qty_e4`. Layers are consumed oldest first; when
/// the layers run out the last known cost (or the purchase price) covers the
/// shortfall, so a negative-stock company still posts a cost.
fn fifo_unit_cost(
    conn: &Connection,
    company_id: i64,
    item_id: i64,
    qty_e4: i64,
    fallback: i64,
) -> AppResult<i64> {
    if qty_e4 <= 0 {
        return Ok(fallback);
    }
    let layers = remaining_layers(conn, company_id, item_id)?;
    let mut remaining = qty_e4;
    let mut value: i128 = 0;
    for layer in &layers {
        if remaining <= 0 {
            break;
        }
        let take = layer.qty_e4.min(remaining);
        value += i128::from(take) * i128::from(layer.unit_cost_minor);
        remaining -= take;
    }
    if remaining > 0 {
        let last = layers.last().map(|layer| layer.unit_cost_minor).unwrap_or(fallback);
        value += i128::from(remaining) * i128::from(last);
    }
    round_half_up_div(value, i128::from(qty_e4))
}

/// Unit cost for an issue, honouring `company.costing_method`.
pub fn issue_unit_cost(
    conn: &Connection,
    company_id: i64,
    item_id: i64,
    costing_method: &str,
    qty_e4: i64,
    fallback: i64,
) -> AppResult<i64> {
    if costing_method == "FIFO" {
        fifo_unit_cost(conn, company_id, item_id, qty_e4, fallback)
    } else {
        average_cost(conn, company_id, item_id)
    }
}

/// Taxable value divided by quantity, rounded half up. The unit cost a
/// purchase puts on the shelf.
pub fn received_unit_cost(taxable_minor: i64, qty_e4: i64) -> AppResult<i64> {
    if qty_e4 <= 0 {
        return Ok(0);
    }
    round_half_up_div(i128::from(taxable_minor) * QTY_SCALE, i128::from(qty_e4))
}

/// Cost of a quantity at a unit cost, in paise.
pub fn movement_value(qty_e4: i64, unit_cost_minor: i64) -> AppResult<i64> {
    round_half_up_div(i128::from(qty_e4) * i128::from(unit_cost_minor), QTY_SCALE)
}
