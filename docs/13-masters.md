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

The item form reads only current rows whose cess is zero, because item and voucher
lines currently store GST only. A legacy rate already stored on an item (for
example 12%) is added to the picker as **legacy** while editing, so opening and
saving an old item does not silently change its rate. New item selections come
from the tax-rate master.

## Permission model

| Action | Permission |
| --- | --- |
| List units or tax rates | `item.view` |
| Create, edit, retire or reactivate a unit | `settings.manage` |
| Add, revise or retire a tax rate | `settings.manage` |

The settings pages hide mutation controls when the signed-in role lacks
`settings.manage`, but the main process is the enforcement point.

## Tests

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
- Cess on an item is not captured yet. Tax-rate rows can carry cess for future
  modules, but the item picker excludes them rather than silently dropping it.
- Tax-rate history has no “delete”. Ending a row keeps old invoices explainable.
