# Item analysis: margin, cover, dead stock and reorder

Status: implemented (issue #20)
Read with: `05-reports-spec.md`, `06-design-system.md`, `23-report-visuals.md`

## 1. What changed

Items, Stock Summary and Item Detail now answer three questions.

- What earns money? Contribution ranks items by gross margin on what left the shelf.
- What is stuck? Cover days and dead stock show items with no outward movement.
- What needs reordering? One shared reorder vocabulary drives every status pill and filter.

The analysis is a read of the existing movement ledger. There is no new report
table, no stored total and no write path.

## 2. Data shape

`reports:stock-flow` returns every posted stock movement for one company in a
date range, with the item id.

```json
[
  {
    "itemId": 7,
    "date": "2026-06-10",
    "qtyInE4": 0,
    "qtyOutE4": 20000,
    "unitCostMinor": 8000
  }
]
```

The contract is `StockFlowRow` in `src/shared/contracts/reports.ts`. Quantities
are integer E4. Money is integer paise. The row carries no display names and no
per-item aggregate.

## 3. RPC

| Layer           | File                              | Addition                                  |
| --------------- | --------------------------------- | ----------------------------------------- |
| Contract        | `src/shared/contracts/reports.ts` | `StockFlowRow`, channel constant          |
| Repository      | `src-tauri/src/reports/repo.rs`   | `stock_flow(conn, company_id, from, to)`  |
| Application     | `src-tauri/src/reports/mod.rs`    | `stock_flow_report`, `channel_stock_flow` |
| Dispatch        | `src-tauri/src/reports/mod.rs`    | `reports:stock-flow`                      |
| Renderer bridge | `src/renderer/src/api/index.ts`   | `stockFlow(from, to)`                     |

The query joins posted vouchers only and orders by voucher date, voucher id and
movement id. It uses `perm::REPORT_VIEW`. The date range is parsed by the same
`date_range` helper as the other ranged reports, so an invalid date is rejected
before SQL runs.

One read serves every item on the Items and Stock screens. The renderer never
loops `reports:stock-movements` per item.

## 4. Selector contract

`src/renderer/src/lib/item-analysis.ts` holds pure functions. Money stays in
integer minor units and quantities in E4.

| Function                             | Result                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `reorderState(item)`                 | `Service`, `Out`, `Low` or `In stock`, checked in that order                |
| `itemMargin(item)`                   | taxable sale value, gross sale, landed cost, whole-percent margin or `null` |
| `windowStart(today, days)`           | `YYYY-MM-DD`, date-only UTC arithmetic                                      |
| `itemFlow(rows, itemId)`             | the movement rows for one item                                              |
| `analyseItems(items, flow, options)` | one analysis row per item                                                   |
| `deadStock(rows, options)`           | tracked goods with no outward movement, default 90 days                     |
| `topMovers(rows, limit)`             | items ranked by outward quantity                                            |

`REORDER_LABELS` is the shared vocabulary. `REORDER_TONES` gives the status pill
tone for each label, so the three pages cannot drift apart.

An analysis row carries the item, the window (`windowDays`, `from`, `to`), the
margin, `marginPercent`, `contributionMinor`, `coverDays`, `lastOutwardDate`,
`outwardQtyE4`, the reorder state and `dead`.

### Rules

1. Service items come first in the reorder check. They have no stock movements
   and are never dead stock.
2. A zero reorder level means "not set". It never makes an item low.
3. Margin uses the taxable sale value and the landed purchase cost. A zero
   landed cost returns a `null` percent, never a division result.
4. Contribution is gross margin per unit times outward quantity in the window.
   It measures what earned in the period, not what is on the shelf.
5. Cover is stock on hand divided by average daily outward quantity in the same
   window. Zero outward movement returns `null`, never `Infinity`. Zero stock
   returns `0`.
6. The window is stated on every row. The UI reads it for the table caption and
   the chart titles.

`ANALYSIS_WINDOWS` is `30, 60, 90, 180`. The default is 90 days.

## 5. Window semantics

A window of `N` days starts `N` days before today and ends today, inclusive.
The arithmetic runs on a UTC date-only value, so a machine east or west of UTC
does not shift the boundary.

The RPC is called with the same `from` and `to` values the selector uses. The
selector also re-checks the date range, so a wider read would still be safe.

Dead stock means no outward movement in the window. A sale last week is not dead
in a 90-day window even when it has no movement this month.

## 6. Pages

### Items

The quick-filter card is replaced by a contribution ranking. The table toolbar
carries All items, Low stock, Out of stock, Dead stock and Services with live
counts, a window select and a sort select. Name, Margin, Contribution and Last
sold sort client-side over the rows already read.

The Status column is the shared reorder state. Active and inactive remain as a
small secondary label, and the deactivate action stays on the row.

### Stock Summary

All stock, Reorder and Dead stock filter the same stock rows. Two KPIs report
the reorder count and the dead-stock count. Cover and Last sold columns use the
selected window, stated in the table toolbar.

### Item Detail

Two charts sit above the existing movement table.

- Monthly movement in and out, in units, from the movements already fetched.
- Stock value trend for the financial year. The series ends at the current stock
  value by folding the difference into the opening value.

The reorder pill reads `reorderState`, so it matches Items and Stock exactly.

## 7. Tests

| Test                                    | Covers                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/shared/item-analysis.test.ts`    | Zero-cost margin, zero stock, zero movement, normal cover, dead stock inside and outside the window, service items, top movers, contribution reconciliation, window boundaries |
| `tests/renderer/item-analysis.test.tsx` | In stock, Low and Out pills from the shared selector; the real dead-stock filter and its count                                                                                 |
| `src-tauri/tests/rpc_flow.rs`           | Two items in one stock-flow read, the date range narrowing the result, an out-of-range read returning no rows, and the unauthenticated refusal                                 |

## 8. Decisions

1. **One movement read, not per-item aggregates.** The renderer already has the
   item list and stock rows. One ledger read keeps the totals reconcilable and
   avoids an N+1 call pattern.
2. **Contribution, not stock value, ranks Items.** The page already has a stock
   value chart. The second chart answers what earned in the period.
3. **Dead stock excludes services.** A service cannot be stuck on a shelf.
4. **Cover is null without movement.** A number would imply a selling rate that
   the data does not contain.
