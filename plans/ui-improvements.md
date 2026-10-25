# Page personality pass

The brief, in the owner's words: pages should not just list rows. Every page has to
answer a question, show its state at a glance, and make the next decision obvious.
Concretely:

- Sidebar name and page heading must agree — `All Parties → Parties`,
  `Customers → Customers`, `Suppliers → Suppliers`.
- List pages carry context: charts and overviews tied to what the page is about,
  the way QuickBooks and Tally frame receivables and stock.
- Balances are the loudest number in a row.
- Items and stock must support analysis, not only display.
- The same standard applies to every page, not just the ones named above.

This file is the working plan. It records what already shipped, what is left, and
which issue owns each piece.

## Audit — 25 Oct 2026

The first pass landed in PR #6 (`feat/ux-refresh-v1`) and its follow-ups, which
covered most of the brief. Current state:

| Surface                                                | State       | What exists now                                                                                                                                   |
| ------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parties / Customers / Suppliers                        | Done        | Distinct title and description per scope, KPI row, ranked bars, ageing chart, monograms, credit-used bar, insight list, bold `Balance` with Dr/Cr |
| Items                                                  | Partial     | KPI row, stock value chart, quick filters, detail page with movement and stock history. No margin, cover or dead-stock analysis                   |
| Stock Summary                                          | Partial     | KPI row, stock value and value-concentration charts. No cover days, ageing or reorder view                                                        |
| Day Book, Sales, Purchases, Receipts, Payments         | Done        | Five KPIs, monthly value chart, largest-parties chart, filters                                                                                    |
| Voucher detail                                         | Done        | Line grid, totals, ledger audit trail, cancel with reason, print                                                                                  |
| Dashboard                                              | Done (#4)   | Real setup progress, monthly flow, ageing, attention list                                                                                         |
| Reports                                                | Not started | KPI cards and tables only — no chart on any of the eight reports                                                                                  |
| Settings — company, numbering, units, tax rates, users | Not started | Form or table only; no state summary, no consequence text                                                                                         |

Two asks in the brief are already satisfied and need no issue: the heading mismatch
and bold balances. The remaining work is the four workstreams below.

## 1. Reports: exposure and ageing visuals

**Question the page must answer:** who owes me, how late, and how much is at risk?

Reports today render a KPI strip and a dense table. The rows already carry
everything a chart needs — `ReceivableRow` has not-due and overdue split,
`AgeingRow` has per-party buckets — so this is a presentation change, not a new
query.

- Receivables and Payables: stacked not-due/overdue bar per party, plus a
  top-ten exposure ranking. Keep the table as the source of truth.
- Ageing: bucket totals as a bar, with the same bucket labels the table uses.
- Show concentration ("top 5 parties = 62% of receivables") as text, not another
  chart.

## 2. Reports: period performance visuals

**Question:** how did the period go, and where is the money sitting?

- Profit and Loss: income vs expense composition, with net margin called out.
- Balance Sheet: assets vs liabilities + equity, and `differenceMinor` surfaced as
  a status pill rather than an implied claim.
- Sales and Purchase registers: monthly value bars derived from row dates, plus a
  GST split. The bars must reconcile to the table total.
- Trial Balance: debit and credit by account group, keeping the proof row.

Every chart derives from the rows already fetched. No new IPC channel, no cached
report tables.

## 3. Items and stock: analysis

**Question:** what makes money, what is stuck, what needs reordering?

- Margin per item from `salePriceMinor` against `purchasePriceMinor`, with the
  items that contribute most value first.
- Cover days from stock on hand and recent movement (`StockMovementRow` is dated
  and carries quantity and unit cost).
- Dead stock: no outward movement in a configurable window (default 90 days).
- Reorder status driven by `reorderLevelE4`, using one status vocabulary shared by
  Items and Stock.
- Item detail: movement over time and stock value trend, alongside the existing
  stock history.

Selectors live in `src/renderer/src/lib` so they can be unit tested without a
renderer.

## 4. Settings: page anatomy

**Question:** what does this setting change, and is it configured?

Company, numbering, units, tax rates and users are correct but flat. Each needs:

- A header that states the consequence of the setting in one sentence.
- Current state visible without opening a dialog: configured or not, how many
  active units, the default rate, when numbering last changed, how many users.
- Grouped sections with inline help, and empty states that route to the action.
- Destructive actions guarded and explained, not just disabled.

## Out of scope

- New fonts or a new visual language; this extends the Ledger Paper system.
- Mobile layouts.
- Posting arithmetic or report calculations. Presentation reads only.
- Re-litigating pages already finished in PR #6.

## Issue map

| Workstream                   | Issue |
| ---------------------------- | ----- |
| Epic                         | #17   |
| Reports: exposure and ageing | #18   |
| Reports: period performance  | #19   |
| Items and stock analysis     | #20   |
| Settings anatomy             | #21   |
