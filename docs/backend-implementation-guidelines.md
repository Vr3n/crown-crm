# Backend implementation guidelines

> **Tauri migration (2026).** The backend now lives in `src-tauri/src/**` and is
> written in Rust. The layering below still describes the product, but the
> concrete mechanics changed:
>
> | This document | Now |
> |---|---|
> | `preload` | `src/renderer/src/api/index.ts` (`window.api`) |
> | `ipc handler` | the single `rpc` command in `src-tauri/src/lib.rs` |
> | `application` | `src-tauri/src/<domain>/mod.rs` |
> | `domain` | free functions in the same module (`posting.rs`, `settlement.rs`, …) |
> | `repository` (Drizzle) | `src-tauri/src/<domain>/repo.rs` with `rusqlite` |
> | `node:sqlite` | `rusqlite` (bundled SQLite) |
>
> Read `19-tauri-migration.md` and `src-tauri/PORTING.md` before this file. The
> table, column names, money units, error codes and transaction rules below are
> unchanged.

Applies to: `src-tauri/src/**`, `src/shared/contracts/**`, `src/renderer/src/api/**`
Read with: `02-database-schema.md`, `03-voucher-posting-rules.md`

## 1. Layers and what each may do

```
renderer
  ↓ window.api.<domain>.<method>()          typed preload bridge
preload
  ↓ ipcRenderer.invoke(channel, payload)     no logic, no validation
ipc handler
  ↓ schema.safeParse, call application       boundary validation, error mapping
application
  ↓ open transaction, orchestrate            use case, one transaction
domain
  ↓ pure functions                           rules, arithmetic, guards
repository
  ↓ drizzle queries                          SQL only, no rules
node:sqlite
```

Hard rules:

1. A repository never calls `db.transaction()`. The application layer owns the transaction boundary. Nested work uses the existing savepoint aware `withTransaction`.
2. A domain function never touches the database. It receives plain data and returns plain data.
3. An IPC handler never contains business logic. Validate, delegate, map errors.
4. The renderer never computes money that will be stored. It may preview, but the posted value is computed on the server side and returned.
5. No SQL string building. Use `rusqlite` parameters (`params![]`, `params_from_iter`).
6. No `unwrap`/`expect` on request data. Return `AppError`.

## 2. Adding a feature, in order

1. Write the contract in `src/shared/contracts/<domain>.ts`: input schema, output type, error codes.
2. Add the channel name to `ipc.channels.ts`.
3. Write the domain rule as a pure Rust function and unit-test it. For posting, the test asserts the exact ledger lines.
4. Add the repository query in `src-tauri/src/<domain>/repo.rs`. Keep it a query, not a decision.
5. Add the use case in `src-tauri/src/<domain>/mod.rs`. One `ctx.with_tx`, explicit preconditions, explicit postconditions.
6. Add the `match` arm in that module's `dispatch`, with `ctx.require_permission(...)` first.
7. Add the method to `src/renderer/src/api/index.ts` and its type to `api/window.d.ts`.
8. Build the renderer against the returned shape.
9. Add the integration test that goes from payload to database rows (`src-tauri/tests/rpc_flow.rs`).
10. Update the docs listed in the phase plan.

## 3. Money and quantity

```ts
// money is always integer paise
type Minor = number

// quantity is integer scaled by 10,000
type QtyE4 = number

// percentages are basis points
type Bps = number
```

- Never use `toFixed` or float division for a stored value.
- Round exactly once, at the defined place: line discount, line tax, invoice total.
- Format only at the edge, with `formatMinor`. Components never do arithmetic on formatted strings.
- Every money column in SQLite is `integer`. No `real`, no `numeric`.

## 4. Transactions

A use case that writes more than one row uses one transaction:

```rust
pub fn post_voucher(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::VOUCHER_POST)?;
    let company_id = ctx.company_id()?;
    let user_id = ctx.user_id()?;
    let parsed = PostInput::parse(input)?;

    ctx.with_tx(|ctx| {
        let context = load_posting_context(ctx.db(), company_id, &parsed)?;
        assert_postable(&context)?;
        let (number, fy, series) = numbering::allocate_number(
            ctx.db(), company_id, &parsed.voucher_type, &parsed.date, parsed.manual_number,
        )?;
        let lines = ledger_for(&context, &parsed)?;
        assert_balanced(&lines)?;
        let voucher = repo::insert_voucher(ctx.db(), company_id, user_id, &parsed, &number)?;
        repo::insert_ledger_lines(ctx.db(), voucher.id, &lines)?;
        repo::insert_stock_movements(ctx.db(), voucher.id, &stock_for(&context)?)?;
        repo::insert_allocations(ctx.db(), voucher.id, &parsed.allocations)?;
        audit::record(ctx.db(), company_id, "VOUCHER", voucher.id, "POST", None, None, Some(user_id))?;
        Ok(json!({ "id": voucher.id, "number": number }))
    })
}
```

Rules:

1. Do not catch and swallow inside a transaction. Let it roll back.
2. Do not perform IPC, file IO or network IO inside a transaction.
3. Do not emit events inside a transaction. Emit after commit.
4. Long loops over 10,000 rows are a smell. Batch them or move to a job.

## 5. Validation

Two levels, both required:

| Level | Where | Example |
|---|---|---|
| Boundary | `src-tauri/src/json.rs` helpers in the command fn | amount is a positive integer |
| Business | Domain guard inside the transaction | allocation does not exceed outstanding |

The boundary catches malformed payloads. The domain catches payloads that are well formed but wrong given the current data, which only the transaction can see.

Error contract: return an `AppError` with a stable code. The `rpc` command maps
it to `{ ok: false, error: { code, message } }`. The renderer branches on code,
never on message text.

## 6. Idempotency

Every mutating channel accepts a `requestId` from the renderer.

```ts
{ requestId: crypto.randomUUID(), ...payload }
```

The handler stores the result against `(company_id, channel, requestId)`. A repeat returns the stored result. A repeat with a different payload returns `IDEMPOTENCY_CONFLICT`.

Use for: post voucher, cancel voucher, record receipt, record payment, allocate, create party, create item. Reads do not need it.

## 7. Numbering

```rust
let (number, fy, series) = numbering::allocate_number(
    ctx.db(),
    company_id,
    "SALES",
    &voucher_date,
    manual_number,
)?;
```

- Allocation happens inside the posting transaction.
- A manual number is allowed only when the company setting permits it, and it raises the high water mark.
- Never generate a number in the renderer. A preview may call `vouchers:nextNumber`, but the posted number is the one the transaction allocates.

## 8. Reads and reports

1. A report is a query function in `src-tauri/src/reports/repo.rs`. No report writes.
2. Report functions return plain rows with numbers, not formatted strings.
3. Grouping, subtotals and drill down identifiers are part of the row shape so the renderer does not re-derive them.
4. Pagination is cursor or offset with a stable sort. Every list has an explicit sort.
5. A list endpoint returns the total count in the same call when the UI needs it, not a second round trip.

## 9. Permissions

- Every handler declares the permission it needs.
- The command layer checks `can(user, permission)` before calling the application layer.
- The application layer also checks ownership and company scope. A permission is not an authorisation to touch another company's row.
- A super role bypasses grant checks, never scope checks.

## 10. Audit

Write an `audit_events` row for every state change on a document or a master:

```
entity, entity_id, action, before_json, after_json, actor_user_id, created_at
```

Never audit reads. Never store secrets in `before_json`. Never update or delete an audit row.

## 11. Logging

- Log at the IPC boundary: channel, duration, outcome, error code.
- Log domain warnings: negative stock, credit limit exceeded, round off above threshold.
- Never log full payloads containing party phone numbers or GSTIN at info level. Truncate with the existing `short()` helper.
- A user facing error message never includes a stack trace or a SQL fragment.

## 12. Migrations

1. Generated with `drizzle-kit`, reviewed by hand.
2. Append only. A shipped migration is never edited.
3. One concern per migration.
4. Destructive changes need a backup step and a note in the phase doc.
5. The migration runner is tested against an empty database and one version behind on every PR.
6. Seeded data lives in a migration only when it is system data (groups, units, tax rates, roles). Demo data lives in a script.

## 13. Performance

- Every list query has an index it can use. State the index in the PR description.
- No `SELECT *` in report queries. Name the columns.
- Avoid N+1. Batch by id or join.
- Budgets are in `05-reports-spec.md`. Measure with the 50k voucher database, not an empty one.
- If a query needs a cache, the cache must be invalidated by the write path, and that invalidation must have a test.

## 14. Definition of done for backend work

- Contract, channel, handler, preload, application, domain, repository all present.
- Domain tests assert the rule, not the implementation.
- Integration test asserts the database rows.
- Permission enforced and tested.
- Audit row written for a state change.
- Idempotency on mutations.
- Error codes added to the shared catalog with a user facing message.
- Docs updated.
- No lint warnings, no `any`, no `console.log`.
