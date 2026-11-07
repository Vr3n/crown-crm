# 13 — Units and tax-rate masters

Units and tax rates are now first-class settings instead of hard-coded lists. Both
are company-scoped, permission-gated and safe to change while old documents keep
their stored values.

## Where it lives

| Layer | File | Responsibility |
| --- | --- | --- |
| Contract | `src/shared/contracts/masters.ts` | Unit/tax-rate rows and input schemas. |
| Schema | `src/main/db/schema/accounting.ts` | `units.is_active`, effective-dated `tax_rates`. |
| Migration | `src/main/db/migrations/20261024000000_unit_active/` | Adds `units.is_active` with a default of 1. |
| Seed | `src/main/db/seed.ts` | 11 starter units and GST 2.0 slabs `0, 5, 18, 40`. |
| Repository | `src/main/repositories/masters.ts` | `unitRepo`, `taxRateRepo`; parameterised reads and overlap guards. |
| Application | `src/main/application/masters.ts` | Validation, permission gates, transaction for a revision. |
| IPC | `src/main/ipc/masters.ts` | `units:*` and `taxRates:*` channels. |
| Preload | `src/preload/index.ts` | `window.api.units`, `window.api.taxRates`. |
| UI | `src/renderer/src/features/settings/pages/UnitsPage.tsx` | Unit table, create/edit, retire/reactivate. |
| UI | `src/renderer/src/features/settings/pages/TaxRatesPage.tsx` | Current/history table, add, revise, retire. |
| Item form | `src/renderer/src/features/items/pages/ItemsPage.tsx` | Active units and GST-only tax rows feed the pickers. |

## Units

`units` gains `is_active` (migration version 3). A unit is never deleted while
items or historical rows may point at it.

Rules:

- Name and symbol are unique per company, case-insensitively, across both fields.
  A duplicate is rejected before the database constraint is reached.
- `decimals` is display precision only, from 0 to 4. Stock still stores four
  decimal places.
- Retiring a unit is refused while any item uses it. The error names the count so
  the user knows what to change first.
- A retired unit disappears from the item form but remains readable in settings
  when **Show inactive units** is on. It can be reactivated.
- Seeded units carry `is_system` and show a **Seeded** badge. They follow the same
  usage guard as custom units.

## Tax rates

A tax rate is a GST/cess combination with an inclusive `effective_from` and
`effective_to` date range. Rows are append-only in practice:

- **Add** inserts a new open row. An overlapping row with the same GST and cess
  combination is rejected.
- **Change** requires a start date after the old row's start. The application
  closes the old row the day before the new start and inserts the new row in one
  transaction. The old row is never edited except for its end date.
- **Retire** sets the end date to the day before the chosen first day without the
  rate. A rate cannot be retired before its own start date.
- Current rows are selected with `effective_from <= asOf AND (effective_to IS NULL
  OR effective_to >= asOf)`. Settings can request the full history.
- A missing label is generated from the percentages, for example `GST 18%`,
  `GST 18% + 12% cess` or `Exempt`.

Seed data uses the GST 2.0 slabs that replaced the old 12% and 28% slabs:
`0`, `5`, `18` and `40` percent. Existing databases keep their seeded rows; the
seed only inserts rates when the company has none.

### Item integration

The item form takes both numbers as typed percentages:

- A GST rate and an optional cess rate are stored on the item as `gst_rate_bps`
  and `cess_rate_bps`. The form accepts any rate from 0 to 50 percent in steps
  of 0.01, not only the rows saved in the tax-rate master. The tax-rate master
  stays a reference list for the settings screen.
- A blank rate counts as zero, so exempt items need no special row. The live
  price breakup uses the typed numbers immediately, before the item is saved.
- Existing rates, including legacy ones that are not in the master, load back
  into the same two inputs, so editing never silently changes an item's rate.
- The item stores each price as typed plus an `..._includes_tax` flag. Sales
  default to inclusive (`2500` means the customer pays 2500); purchases default
  to exclusive (`1750` plus supplier tax). The form never converts the stored
  number.
- The form shows a live breakup under both price fields, using the item's GST
  and cess. The sale flag can be toggled; purchase lines always post
  tax-exclusive, so the purchase breakup is always the landed cost.
- The item list shows the customer-facing sale gross and the landed purchase
  cost, with taxable value as secondary text.
- A voucher line inherits the item's sale flag for sales and credit notes.
  Purchases and debit notes always start exclusive. The line has an **Incl.
  tax** toggle that changes the interpretation without changing the typed rate.

See `21-item-price-tax.md` for the arithmetic and the full state machine.

## Permission model

| Action | Permission |
| --- | --- |
| List units or tax rates | `item.view` |
| Create, edit, retire or reactivate a unit | `settings.manage` |
| Add, revise or retire a tax rate | `settings.manage` |

The settings pages hide mutation controls when the signed-in role lacks
`settings.manage`, but the main process is the enforcement point.

## Tests

- `src-tauri/src/masters/mod.rs` tests the flag reader: booleans and `0/1` are
  accepted, anything else is rejected.
- `src-tauri/tests/rpc_flow.rs::item_price_tax_flow` creates and updates an item
  with both flags and a cess rate, then posts one inclusive sale line and one
  exclusive purchase line.
- `tests/shared/price.test.ts` covers 2500 @ 18%, 1750 @ 18%, zero-rated and
  cess-bearing prices.
- `tests/renderer/item-dialog.test.tsx` covers the live breakups, the sale flag,
  cess-bearing rates and the payload flags.
- `tests/renderer/voucher-line-tax.test.tsx` covers the per-line inclusive
  toggle recalculating the preview.
- `tests/main/application/masters.test.ts` covers seeded units, custom unit
  creation, duplicate names/symbols, usage guards, retire/reactivate, GST 2.0
  seeds, overlap rejection, effective-dated revision, retirement and permission
  gating.
- `tests/db/seed.test.ts` asserts the four GST slabs and the seeded unit count.
- `tests/db/migrations.test.ts` asserts migration version 3 and the
  `units.is_active` column/default.
- `tests/domain/dates.test.ts` covers `addDaysIso`, used to close a range the day
  before a new one starts.
- `tests/e2e/ux-refresh.spec.ts` creates a unit, adds a 25% rate and schedules a
  30% revision, then checks both rows in history.

## Deliberate limits

- Units are not convertible (no base unit or conversion factor). Items store a
  quantity in their chosen unit; a later module can add conversion without
  changing the stored quantity scale.
- An item has one GST rate and one cess rate for both directions of trade. A
  one-off supplier rate is overridden on the voucher line, not in the item
  master.
- The purchase price flag is stored and returned by the API, but the item form
  only edits the sale flag and always saves purchases as exclusive. Purchase
  voucher lines always post tax-exclusive.
- Tax-rate history has no “delete”. Ending a row keeps old invoices explainable.
