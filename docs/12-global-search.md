# 12 — Global search and command palette

`Ctrl+K` (or `Cmd+K`) opens one search surface for the four things a bookkeeper
looks up most: parties, items, posted vouchers and accounts. The same dialog
also navigates to any screen the signed-in role may open.

## Where it lives

| Layer | File | Responsibility |
| --- | --- | --- |
| Contract | `src/shared/contracts/search.ts` | Query shape, result kinds, grouped output. |
| Repository | `src/main/repositories/search.ts` | Parameterised reads, five rows per family. |
| Application | `src/main/application/search.ts` | Company scope and permission gating. |
| IPC | `src/main/ipc/search.ts` | `search:query`, validated by `searchInputSchema`. |
| Preload | `src/preload/index.ts` | `window.api.search.query(input)`. |
| UI | `src/renderer/src/features/search/components/global-search.tsx` | Dialog, groups, keyboard flow, recents. |
| Entry point | `src/renderer/src/components/layout/Topbar.tsx` | Button, `Ctrl/Cmd+K` listener, open state. |

## Permission model

Search is not a back door around the role system. The application layer calls
`hasPermission()` for each family before it queries:

| Family | Permission |
| --- | --- |
| Parties | `party.view` |
| Items | `item.view` |
| Vouchers | `voucher.view` |
| Accounts | `company.view` |

A role without a code never receives that group, even if the text would match.
The main process also scopes every query to `currentCompanyId()`, so a future
multi-company build cannot leak rows across books.

## Result rules

- Parties: active rows only, matched on name, phone, GSTIN or email.
- Items: active rows only, matched on name, SKU or HSN/SAC.
- Vouchers: `POSTED` only, matched on number, reference, narration or party
  name. The result subtitle is `TYPE · Party`.
- Accounts: active rows only, matched on account name, group name or system key.
- Each family is capped at `SEARCH_GROUP_LIMIT` (5) and ordered for scanning:
  names alphabetically, vouchers newest first.
- The query is trimmed, capped at 120 characters and always parameterised.

Inactive masters disappear from search. A deactivated party can still be found
through a posted voucher that references it, because the voucher is the record
being searched, not the party master.

## UI behaviour

- The topbar search field is a real button with `aria-haspopup="dialog"` and
  `aria-expanded`. The palette is `cmdk` inside the shared `CommandDialog`.
- `shouldFilter={false}` is passed through `CommandDialog` because the main
  process already filtered. This prevents `cmdk` from hiding a valid row whose
  subtitle or meta text differs from the typed query.
- Empty query: recent selections first, then screens. Typing: server groups,
  then matching screens.
- Loading, no-match and IPC-error states are explicit. `Esc` closes; arrows and
  `Enter` are handled by `cmdk`.
- Selecting a result records it in `localStorage` under
  `crownbooks:recent-searches` (maximum five, de-duplicated by path). Corrupt
  storage degrades to an empty list instead of breaking the palette.
- Account results navigate to `/masters/accounts?account=<id>`; the chart of
  accounts scrolls to that row and gives it an accent background.

## Tests

- `tests/main/application/search.test.ts` covers all four families, inactive
  masters, draft vouchers, the five-row cap, unauthenticated access and role
  gating (Billing Clerk has no `company.view`, so no account group).
- `tests/renderer/recent-searches.test.ts` covers round-trip, de-duplication,
  the cap, corrupt JSON and clearing.
- `tests/e2e/ux-refresh.spec.ts` presses `Ctrl+K`, searches for a party created
  earlier in the flow and asserts the detail page opens.

## Deliberate limits

- No fuzzy matching yet. SQLite `LIKE` is predictable and fast on these table
  sizes; a later FTS5 index can replace the repository without changing the
  contract.
- No voucher amount in the result meta. The date is stable and keeps the row
  narrow; the detail page is one keystroke away.
- Search history stays on the machine in `localStorage`; it is never sent over
  IPC.
