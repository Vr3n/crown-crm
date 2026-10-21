# Design system: Ledger Paper

Status: approved direction
Applies to: the desktop app shell, every screen, printed documents

## 1. Idea

The product should feel like a well kept book of accounts, not like a SaaS dashboard.

Warm paper ground, ink text, hairline rules, near sharp corners, numbers that line up in columns. No gradients, no glass, no floating cards with large shadows. Density is a feature: a clerk should see twenty invoices without scrolling.

The reference points are a Tally voucher screen for speed and a QuickBooks list for legibility. We take the keyboard model from the first and the information hierarchy from the second.

## 2. Tokens

Light, default:

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F6F4EF` | Page background |
| `--sheet` | `#FCFBF8` | Panels, tables, entry forms |
| `--ink` | `#16191D` | Primary text |
| `--ink-2` | `#4A5058` | Secondary text |
| `--ink-3` | `#7A828C` | Labels, captions |
| `--rule` | `#DED8CC` | Hairlines, table borders |
| `--rule-strong` | `#C4BCAA` | Section dividers |
| `--accent` | `#1B4D6B` | Primary action, active nav, focus ring |
| `--accent-soft` | `#E4EBF0` | Selected row, active tab |
| `--credit` | `#2F6B4F` | Money in, paid, healthy |
| `--debit` | `#A03A2B` | Money out, overdue, error |
| `--warn` | `#9A6B18` | Due soon, attention |
| `--muted-fill` | `#EFEBE2` | Disabled, empty |

Dark, "Midnight Ledger":

| Token | Value |
|---|---|
| `--paper` | `#14171B` |
| `--sheet` | `#1A1E23` |
| `--ink` | `#E8E5DE` |
| `--ink-2` | `#A8AEB5` |
| `--rule` | `#2B3138` |
| `--accent` | `#7FA6BE` |
| `--credit` | `#6FAF8B` |
| `--debit` | `#D08A7C` |
| `--warn` | `#D2AC63` |

Rules:

1. One accent. Status colors carry meaning only.
2. Never use color alone to signal state. Pair with a word or a shape.
3. Border radius: 2px on inputs and buttons, 0 on tables and panels. Sharp is the point.
4. No box shadows except a single 1px inset highlight on focused inputs.
5. Focus ring: 2px `--accent` offset 1px, always visible for keyboard users.

## 3. Type

| Role | Family | Size | Weight | Notes |
|---|---|---|---|---|
| App title | IBM Plex Sans | 15 | 600 | Top bar only |
| Page title | IBM Plex Sans | 22 | 600 | One per screen |
| Section | IBM Plex Sans | 13 | 600 | Uppercase, 0.06em tracking, used sparingly |
| Body | IBM Plex Sans | 13.5 | 400 | Line height 1.45 |
| Table | IBM Plex Sans | 13 | 400 | Row height 34 |
| Money | IBM Plex Mono | 13 | 500 | Tabular, right aligned |
| Dates and numbers | IBM Plex Mono | 12.5 | 400 | Tabular |
| Document print | IBM Plex Sans | 10.5 | 400 | A4, 12mm margins |

No display serif in the app. A serif is reserved for printed statements and the brand mark, because those are documents, not screens.

## 4. Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Topbar: company, search, date context, new voucher, user     │ 48px
├────────────┬─────────────────────────────────────────────────┤
│ Left nav   │ Page                                            │
│ 216px      │  - title row with actions                       │
│ groups     │  - filter bar                                   │
│            │  - content                                      │
│            │  - footer totals where relevant                 │
└────────────┴─────────────────────────────────────────────────┘
```

- Minimum window 1180 x 720. Design target 1440 x 900.
- Content max width unlimited for tables, 760px for forms, 1100px for reports.
- Vertical rhythm in 4px steps.
- Tables: 34px rows, 1px bottom rule, header 32px with muted fill, sticky header, sticky totals row.

## 5. Navigation

Groups:

```
Home        Dashboard
Books       Day Book, Sales, Purchases, Receipts, Payments, Notes, Journals
Parties     Customers, Suppliers, All Parties, Statements
Items       Items, Stock Summary (Phase 5), Stock Journal (Phase 5)
Reports     Receivables, Payables, Ageing, Ledger, Trial Balance, P&L, Balance Sheet, Registers
Masters     Chart of Accounts, Tax Rates, Units, Series
Admin       Company, Users and Roles, Backup
```

The left nav shows counts where they help: overdue bills, draft vouchers. It never shows a count that requires a slow query on every navigation.

## 6. Voucher entry screen

The most used screen. It is a page, not a dialog.

```
┌ Party: [Acme Distributor            ] balance 4,550 Dr, 30 days ┐
│ Date: 11-09-2026   Due: 11-10-2026   Ref: PO-118               │
├────────────────────────────────────────────────────────────────┤
│ #  Item            HSN     Qty  Unit  Rate      Disc   GST  Amount
│ 1  SSD 256GB       8523     1   Nos   3,855.93  0.00   18%  3,855.93
│ +  Add line                                                     │
├────────────────────────────────────────────────────────────────┤
│                                   Taxable        3,855.93      │
│                                   CGST 9%          347.03      │
│                                   SGST 9%          347.03      │
│                                   Round off          0.01      │
│                                   Total          4,550.00      │
│                                   In words: Four thousand ...  │
└────────────────────────────────────────────────────────────────┘
[Save draft] [Post voucher Ctrl+Enter] [Print]
```

Behaviour:

- Party field searches by name, phone, GSTIN. On select, shows balance and credit position inline.
- Rate field accepts tax inclusive entry. A toggle on the line flips interpretation without changing the typed number.
- Discount accepts percent or amount, one at a time.
- Tax is computed on the line as you type, never after save.
- Total in words is live.
- Post is disabled with a reason, never silently failing.
- Every validation error points at the field.

Keyboard:

| Key | Action |
|---|---|
| `Alt+S` | New sales invoice |
| `Alt+P` | New purchase bill |
| `Alt+R` | New receipt |
| `Alt+Y` | New payment |
| `Alt+N` | New voucher menu |
| `F2` | Change voucher date |
| `F4` | Party selector |
| `Tab` / `Enter` | Next field, next line |
| `Shift+Enter` | Previous field |
| `Ctrl+Enter` | Post |
| `Ctrl+S` | Save draft |
| `Esc` | Back, with confirmation if dirty |
| `Ctrl+K` | Command palette |
| `?` | Shortcut help |

## 7. Lists and tables

- One primary action per page, top right.
- Filters in a single row, collapsible on small heights. Applied filters shown as removable chips.
- Row hover reveals row actions; a click opens the detail.
- Money columns right aligned, mono, never truncated.
- Status shown as a small text badge with a dot, not a pill with a gradient.
- Empty state: one sentence on what to do, and the primary button.
- Bulk selection only where a bulk action exists.

## 8. Documents and print

A4, 12mm margins, 10.5pt body.

Structure of the tax invoice, matching the sample bills:

1. Seller block: name, address, GSTIN, state name and code, email, phone
2. Document title and copy label: Tax Invoice, Original for recipient
3. Invoice number, date, due date, reference, place of supply
4. Buyer block: name, address, GSTIN, state
5. Item grid: serial, description, HSN, qty, unit, rate, discount, taxable, tax rate, tax amount, total
6. HSN wise tax summary
7. Totals: taxable, CGST, SGST, IGST, cess, round off, grand total
8. Amount in words
9. Bank details and payment terms
10. Declaration and signature block
11. Footer: computer generated, jurisdiction

Statements and ageing reports use the same header and footer, with a different body.

## 9. Motion

Motion is functional only.

| Where | Motion | Duration |
|---|---|---|
| Page enter | 8px rise plus fade | 180ms |
| Row insert | background flash, no height animation | 320ms |
| Total change | number crossfade | 140ms |
| Panel open | 4px rise plus fade | 160ms |
| Error | 2px horizontal shake, once | 180ms |

No spring physics in a data entry tool. No infinite animation. `prefers-reduced-motion` removes everything except the error indication.

## 10. Accessibility

- Contrast: body text 4.5:1 minimum, large text 3:1, money figures 4.5:1.
- Every icon button has a label; tooltips are not the only label.
- Full keyboard path for every task, including the item grid.
- Focus is never trapped in a dialog without an escape.
- Table headers are real `th` with scope.
- Errors are announced via `aria-live`.
- No information conveyed by color alone.

## 11. What we are not doing

- No dark pattern onboarding, no upgrade prompts inside data entry.
- No decorative illustration in the working area.
- No card grid for lists that should be a table.
- No rounded avatar circles in accounting rows. Initials in a 24px square, if any.
- No gradients, no glass, no hero sections.
