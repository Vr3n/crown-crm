# Voucher numbering and first run onboarding

Implements issue #5.

## Data

Migration 1 (`20261023000000_voucher_numbering`) adds:

- `voucher_number_settings`, one row per company and voucher type, holding
  `series`, `prefix`, `suffix`, `padding`, `start_number`, `restart_yearly` and
  `manual_override`.
- `companies.numbering_setup_at` and `companies.onboarding_completed_at`.
- Backfilled defaults for every existing company. A company that already has a
  voucher is marked as numbered and onboarded, so upgrading never forces the
  wizard on a working set of books.

## Allocation

`repositories/numbering.ts` owns the settings. `voucherRepo.allocateNumber`
reads the setting, resolves the financial year, and keeps the counter in
`voucher_sequences`, keyed by company, type, series and year (or `ALL` when
yearly restart is off).

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

- `tests/domain/numbering.test.ts` covers formatting, padding, the start floor
  and setting validation.
- `tests/main/application/numbering.test.ts` covers prefixes, width changes,
  series changes, yearly restart on and off, manual high-water rules, setup
  markers and validation.
- `tests/db/migrations.test.ts` covers the new table and migration version.
- Playwright covers first run, changing a prefix, the tour and the resulting
  dashboard progress.
