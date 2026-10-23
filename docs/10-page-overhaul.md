# 10 — Page overhaul

The screen-by-screen pass that turned every list page from a bare grid into a
page that answers a business question. This document records the anatomy, the
shared primitives, the read models, and what is still open.

## Page anatomy

Every page follows the same order, so the eye learns it once:

1. **Header** — the page's own name (`Parties`, `Customers`, `Suppliers`), one
   sentence of purpose, and the one primary action.
2. **KPI strip** — three or four bordered cards. Each card has a label that is
   a question, a big tabular figure, and a context line that interprets it
   ("3 customers", "past the due date"). Colour is a hint, never the only
   signal.
3. **Two visuals and one attention card** — at most two charts plus a short
   "needs attention" list where each item links to the place that fixes it.
4. **Filter bar** — search, period, status or role, then the table.
5. **Table** — sticky header, monogram or status on the left, bold tabular
   money on the right, and a sticky footer total.

## Shared primitives

| Component | File | Purpose |
| --- | --- | --- |
| `KpiCard` | `src/renderer/src/components/ui/kpi-card.tsx` | One decision metric with an interpretation line. |
| `Balance` | `src/renderer/src/components/ui/balance.tsx` | Bold tabular money with a Dr/Cr marker; positive is Dr, negative is Cr. |
| `StatusPill` | `src/renderer/src/components/ui/status-pill.tsx` | Small uppercase status chip with a text label, not colour alone. |
| `ChartCard` | `src/renderer/src/components/ui/chart-card.tsx` | A chart with a title and the question it answers. |
| `InsightList` | `src/renderer/src/components/ui/insight-list.tsx` | Three or fewer "needs attention" items, each a link to the fix. |
| `RankedBarsChart` | `src/renderer/src/components/charts/list-charts.tsx` | Horizontal ranked bars for top balances or stock value. |
| `MonthlyBarsChart` | `src/renderer/src/components/charts/list-charts.tsx` | Vertical monthly trend for a transaction list. |

The visual language is unchanged: warm paper, ink rules, vermilion accent,
2px corners, IBM Plex. Personality comes from module colour, monograms, status
colour and the charts, not from new fonts or gradients.

## Read models

Aggregates run in SQLite, never by filtering a large list in the renderer.

- `parties:summary` → `PartySummary`: customer and supplier counts, receivable
  and payable totals, overdue totals, over-limit count, top receivables and
  payables, and open-bill ageing buckets.
- `items:summary` → `ItemSummary`: item and service counts, inventory value,
  low-stock and out-of-stock counts, and the top items by value.
- `vouchers:summary` → `VoucherSummary`: count, total, average, outstanding for
  sales and purchases, monthly totals, and top parties for a period.

`ItemRow` now also carries `reorderLevelE4`, `stockGroupId` and `stockGroup`, so
the items page can show reorder status without a second call.

## Pages covered

- **Parties / Customers / Suppliers** — one component, scoped by route. The
  heading, description, role filter, columns and primary action all follow the
  scope. KPI strip: receivables, payables, overdue, over-limit. Charts: open
  bills by age and top balances. Table: monogram, bold Dr/Cr balance,
  credit-used meter for customers, status pill.
- **Items** — inventory value, item count, low stock and out of stock KPIs;
  quick filters for all / low / out / services; stock-value chart; stock status
  pill, margin column and reorder awareness.
- **Stock Summary** — value, units, low and out KPIs; value-by-item chart and a
  concentration list; average cost and an out-of-stock flag per row.
- **Sales, Purchases, Receipts, Payments, Day Book** — period presets, value,
  document count, average and outstanding KPIs; monthly value chart and
  largest-party chart; status pills, bold totals and a sticky footer total.
- **All reports** — a KPI strip computed from the report data (receivable and
  overdue, debit and credit, income and net profit, assets and equity, taxable
  value and GST), and CSV plus PDF export on every report table.

## Export

- **CSV** is generated in the renderer (`src/renderer/src/lib/export.ts`) with a
  UTF-8 BOM so Excel keeps the rupee sign and Indian names.
- **PDF** is a real Electron `printToPDF` of the current window
  (`src/main/ipc/export.ts`), saved through the native dialog. The print
  stylesheet decides what is included, so the rail and toolbar stay off the
  page.
- **XLSX** is not implemented yet. It needs a spreadsheet writer (for example
  `exceljs`) or a small XLSX generator in the main process; both are a
  deliberate dependency decision rather than a silent addition.

## Still open

- Full-page detail views for parties and items (the chosen option over a
  drawer), with ledger and stock-movement tabs.
- Global command palette and quick create.
- Tax Rates and Users/Roles stay deferred, as agreed.
- XLSX export.

## Verification

- `npx vitest run` — 242 tests, including the summary read models and the CSV
  writer.
- `npx playwright test --workers=1` — 16 Electron flows, including contextual
  headings, KPI presence and report export buttons.
