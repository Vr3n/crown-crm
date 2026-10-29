//! Bill settlement: allocation guards and the queries the outstanding list and
//! the cancel path need. Mirrors the allocation block of
//! `src/main/application/vouchers.ts` and `voucherRepo.hasAllocations`.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{codes, AppError, AppResult};

/// One requested allocation, already normalised by the command layer.
#[derive(Debug, Clone)]
pub struct AllocationInput {
    pub to_voucher_id: i64,
    pub amount_minor: i64,
    pub allocation_type: String,
}

/// The header fields an allocation check needs.
#[derive(Debug, Clone)]
pub struct BillSummary {
    pub id: i64,
    pub number: String,
    pub party_id: Option<i64>,
    pub total_minor: i64,
}

pub fn find_bill(conn: &Connection, company_id: i64, id: i64) -> AppResult<Option<BillSummary>> {
    Ok(conn
        .query_row(
            "SELECT id, number, party_id, total_minor
             FROM vouchers WHERE company_id = ?1 AND id = ?2",
            params![company_id, id],
            |row| {
                Ok(BillSummary {
                    id: row.get(0)?,
                    number: row.get(1)?,
                    party_id: row.get(2)?,
                    total_minor: row.get(3)?,
                })
            },
        )
        .optional()?)
}

/// Money settled against one bill, from every voucher.
pub fn settled_against(conn: &Connection, company_id: i64, to_voucher_id: i64) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(amount_minor), 0) FROM bill_allocations
         WHERE company_id = ?1 AND to_voucher_id = ?2",
        params![company_id, to_voucher_id],
        |row| row.get(0),
    )?)
}

/// True when any allocation points at or from this voucher.
pub fn has_allocations(conn: &Connection, company_id: i64, voucher_id: i64) -> AppResult<bool> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM bill_allocations
             WHERE company_id = ?1 AND (from_voucher_id = ?2 OR to_voucher_id = ?2)
             LIMIT 1",
            params![company_id, voucher_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

/// `2.50` for 250 paise, `1.5` for 150 paise: the shape `open / 100` had in
/// the TypeScript message.
fn minor_as_number(minor: i64) -> String {
    let sign = if minor < 0 { "-" } else { "" };
    let absolute = minor.unsigned_abs();
    let whole = absolute / 100;
    let fraction = absolute % 100;
    if fraction == 0 {
        format!("{sign}{whole}")
    } else if fraction % 10 == 0 {
        format!("{sign}{whole}.{}", fraction / 10)
    } else {
        format!("{sign}{whole}.{fraction:02}")
    }
}

/// The allocation guard set. Returns the first failure, in the same order as
/// the TypeScript implementation.
pub fn validate(
    conn: &Connection,
    company_id: i64,
    voucher_type: &str,
    party_id: Option<i64>,
    amount_minor: i64,
    allocations: &[AllocationInput],
) -> AppResult<()> {
    if allocations.is_empty() {
        return Ok(());
    }
    if voucher_type != "RECEIPT" && voucher_type != "PAYMENT" {
        return Err(AppError::validation("Only receipts and payments can be allocated"));
    }

    let allocated: i64 = allocations.iter().map(|row| row.amount_minor).sum();
    if allocated > amount_minor {
        return Err(AppError::new(
            codes::ALLOCATION_EXCEEDS_PAYMENT,
            "Allocated more than the amount received or paid",
        ));
    }

    for allocation in allocations {
        let Some(bill) = find_bill(conn, company_id, allocation.to_voucher_id)? else {
            return Err(AppError::not_found("Bill to allocate against was not found"));
        };
        if bill.party_id != party_id {
            return Err(AppError::new(codes::ALLOCATION_EXCEEDS_BILL, "Bill belongs to another party"));
        }
        let paid = settled_against(conn, company_id, bill.id)?;
        let open = bill.total_minor.saturating_sub(paid);
        if allocation.amount_minor > open {
            return Err(AppError::new(
                codes::ALLOCATION_EXCEEDS_BILL,
                format!("{} is only {} open", bill.number, minor_as_number(open)),
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::minor_as_number;

    #[test]
    fn formats_open_amounts_like_the_typescript_message() {
        assert_eq!(minor_as_number(100), "1");
        assert_eq!(minor_as_number(150), "1.5");
        assert_eq!(minor_as_number(155), "1.55");
        assert_eq!(minor_as_number(101), "1.01");
        assert_eq!(minor_as_number(-250), "-2.5");
    }
}
