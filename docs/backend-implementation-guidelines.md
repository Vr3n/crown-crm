# Backend implementation guidelines

Applies to: `src/main/**`, `src/preload/**`, `src/shared/contracts/**`
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
5. No SQL string building. Use Drizzle or parameterised statements.
6. No `any`. If a shape is unknown, define a schema.

## 2. Adding a feature, in order

1. Write the contract in `src/shared/contracts/<domain>.ts`: input schema, output type, error codes.
2. Add the channel name to `ipc.channels.ts`.
3. Write the domain rule and its tests first. For posting, the test asserts the exact ledger lines.
4. Add the repository query. Keep it a query, not a decision.
5. Add the application use case. One transaction, explicit preconditions, explicit postconditions.
6. Add the IPC handler with the Zod schema.
7. Add the preload method and its type in `index.d.ts`.
8. Build the renderer against the returned shape.
9. Add the integration test that goes from IPC payload to database rows.
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

```ts
export function postVoucher(input: PostVoucherInput): Voucher {
  return withTransaction(() => {
    const context = loadPostingContext(input)
    assertPostable(context)
    const number = nextNumber(context)
    const lines = ruleFor(context.type).ledger(context)
    assertBalanced(lines)
    const voucher = insertVoucher({ ...input, number })
    insertLedgerLines(voucher, lines)
    insertStockMovements(voucher, ruleFor(context.type).stock(context))
    insertAllocations(voucher, input.allocations)
    writeAudit(voucher, 'POST', input.actorId)
    return voucher
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
| Boundary | Zod schema in IPC handler | amount is a positive integer |
| Business | Domain guard inside the transaction | allocation does not exceed outstanding |

The boundary catches malformed payloads. The domain catches payloads that are well formed but wrong given the current data, which only the transaction can see.

Error contract: throw a `DomainError` with a stable code. The IPC wrapper maps it to `{ ok: false, error: { code, message } }`. The renderer branches on code, never on message text.

## 6. Idempotency

Every mutating channel accepts a `requestId` from the renderer.

```ts
{ requestId: crypto.randomUUID(), ...payload }
```

The handler stores the result against `(company_id, channel, requestId)`. A repeat returns the stored result. A repeat with a different payload returns `IDEMPOTENCY_CONFLICT`.

Use for: post voucher, cancel voucher, record receipt, record payment, allocate, create party, create item. Reads do not need it.

## 7. Numbering

```ts
const { number, fy } = allocateNumber({
  companyId,
  voucherType: 'SALES',
  series: 'INV',
  date: voucherDate,
  fyStartMonth: company.fy_start_month
})
```

- Allocation happens inside the posting transaction.
- A manual number is allowed only when the company setting permits it, and it raises the high water mark.
- Never generate a number in the renderer. A preview may call `vouchers:nextNumber`, but the posted number is the one the transaction allocates.

## 8. Reads and reports

1. A report is a query function in `repositories/reports.ts`. No report writes.
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
