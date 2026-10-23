# Dashboard, module personality and charts

Implements issue #4.

## Read model

`repositories/dashboard.ts` owns every query. The IPC handler only resolves the
company and calls the repository, as required by
`docs/backend-implementation-guidelines.md`.

`DashboardSummary` now carries:

- `setup`: six steps (numbering, parties, items, opening balances, first
  purchase, first sale), each with `done`, a link and a short description. The
  count is derived from rows, never from a phase constant.
- `attention`: overdue receivables, supplier bills due in the next seven days,
  or a calm "nothing overdue" state.
- `recentVouchers`: the last five posted vouchers with party and total.
- `monthly`: six calendar months of posted sales and purchases, zero filled.
- `ageing`: open bills bucketed into Not due, 1-30, 31-60, 61-90 and 90+.

## Page

- Removed "What this version does" and "A note on data".
- Setup progress has a percentage bar, per-step links and one next action.
- The right rail shows what needs attention and the real recent vouchers.
- Two charts: sales against purchases for six months, and open bills by age.
  Both are SVG, use the chart tokens, expose an `ariaLabel`, and fall back to a
  details/table view with the same numbers.

## Module personality

`lib/module-tone.ts` maps a path to one accent: parties green, items amber,
reports blue, admin and purchases vermilion, everything else the ledger blue.
`PageHeader` draws a 2px accent rule and `EmptyState` tints its icon plate. The
body stays neutral; colour is wayfinding, never the only signal.

## Charts

`@tanstack/charts` 1.1 is the chart engine: about 43 to 49 KB gzipped in the
vendor benchmark, React 19 compatible, SVG by default, imported by exact
subpath. `components/charts/dashboard-charts.tsx` isolates the definitions so a
future library swap touches one file.

## Sidebar scroll control

When the content pane is taller than the viewport, the sidebar shows a button
above the user block. It reads "Scroll to bottom" until the end, then "Back to
top". It respects `prefers-reduced-motion`, works in the collapsed rail, and
hides itself when the page fits. The state rule is pure and tested in
`lib/scroll-edge.ts`.

## Tests

- `tests/main/repositories/dashboard.test.ts` covers setup ticks, recent
  vouchers, monthly totals, ageing and the overdue attention item.
- `tests/renderer/scroll-edge.test.ts` covers the scroll states.
- `tests/renderer/module-tone.test.ts` covers the accent map.
- Playwright asserts progress changes after real records and that both charts
  are present.
