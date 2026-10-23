# Voucher numbering and first run onboarding

Implements issue #5.

## Data

Migration 1 (`20261023000000_voucher_numbering`) adds:

- `voucher_number_settings`, one row per company and voucher type, holding
  `series`, `prefix`, `suffix`, `padding`, `start_number`, `reset_period` and
  `manual_override`.
- `companies.numbering_setup_at` and `companies.onboarding_completed_at`.
- Backfilled defaults for every existing company. A company that already has a
  voucher is marked as numbered and onboarded, so upgrading never forces the
  wizard on a working set of books.

Migration 2 (`20261023000001_numbering_reset_period`) adds `reset_period` and
maps the old yearly toggle to `YEARLY` or `NEVER`.

## Allocation

`repositories/numbering.ts` owns the settings. `voucherRepo.allocateNumber`
reads the setting, resolves the financial year, and keeps the counter in
`voucher_sequences`, keyed by company, type, series and the reset period.

### Date tokens

Prefix and suffix may contain tokens that expand from the voucher date:

| Token | Example on 2026-07-13 | Meaning |
|---|---|---|
| `{YYYY}` | 2026 | Four digit year |
| `{YY}` | 26 | Two digit year |
| `{MM}` | 07 | Month |
| `{DD}` | 13 | Day |
| `{YYYYMM}` | 202607 | Year and month |
| `{FY}` | 2026-27 | Financial year with start month |
| `{FY_SHORT}` | 26-27 | Short financial year |

`INV/{YYYYMM}` with width 3 produces `INV/202607001`. Tokens resolve at posting
time, so a January bill and a February bill carry their own month even when
both were created on the same day.

### Reset period

- `YEARLY` restarts at the start number each financial year (default).
- `MONTHLY` gives every calendar month its own counter.
- `NEVER` keeps one continuous counter.

With a monthly reset and `INV/{YYYYMM}`, July starts at `INV/202607001` and
August starts again at `INV/202608001`. Without the monthly reset the August
number continues the July counter, for example `INV/202608002`; both remain
unique.

### GST constraints

Rule 46(b) of the CGST Rules requires a consecutive serial number of at most 16
characters, using letters, digits, `-` and `/`, unique for the financial year.
The editor therefore:

- allows only `A-Z`, `0-9`, `/` and `-` outside tokens;
- rejects unknown tokens;
- refuses a resolved number longer than 16 characters;
- keeps the full number unique per company, voucher type, series and financial
  year in the database.

Rules:

- The first number in a period is `start_number`.
- Changing a prefix or width affects the next number only.
- Changing the series starts a new sequence; posted vouchers keep their series.
- A manual number is accepted only when the setting allows it, must be at least
  the starting number, and must be greater than the last used value.
- The counter moves inside the posting transaction, so a rollback does not
  consume a number.

## API

- `numbering:list` returns every type with its next preview and posted count.
- `numbering:update` validates, upserts, marks numbering complete and returns
  the fresh list.
- `onboarding:complete` marks the tour done.
- All three require `settings.manage`.

## Screens

- `/settings/numbering` is the editable table with a live preview per type.
- First run routes company creation to `/setup/numbering`, then
  `/setup/tour`, then the dashboard.
- The tour is a five step checklist driven by real rows (party, item, purchase,
  sale, trial balance). It can be skipped and revisited from the URL.
- `AppLayout` guards the app: no numbering means the wizard; numbering without
  a finished tour redirects the dashboard to the tour once. Other pages stay
  reachable, so "Open" links work during the tour.

## Tests

- `tests/domain/numbering.test.ts` covers formatting, date tokens, reset
  periods, padding, the start floor and setting validation.
- `tests/main/application/numbering.test.ts` covers prefixes, width changes,
  series changes, yearly, monthly and never resets, the year-month example,
  manual high-water rules, setup markers and validation.
- `tests/db/migrations.test.ts` covers the new table and migration version.
- Playwright covers first run, changing a prefix, the tour and the resulting
  dashboard progress.
