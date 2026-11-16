# Logging and debugging

Status: implemented with the Excel importer prototype
Read with: `26-excel-importer.md`, `backend-implementation-guidelines.md`

## 1. Why this exists

A posting run can hang in two places: the renderer waits on an IPC call that
never settles, or the Rust command waits on a lock and never returns. Without a
persistent log there is no way to tell which one happened after the window is
closed.

The importer now has a hard timeout per IPC call, so a stuck call becomes a
failed bill instead of an endless "Posting" state. The log explains what was
running when it timed out.

## 2. The shape

```
renderer                         Rust
--------                         ----
logger.trace("import", ...) ──┐
api call (traceId) ────────────┼──> rpc(traceId) ──> module log
logger.end(traceId, ...)       │         │
                               │         └──> rpc.ok / rpc.fail
log_event(records) ────────────┘
        │
        └──> logs/app-YYYY-MM-DD.jsonl
```

- The renderer logger batches records and sends them to the `log_event`
  command. That command never touches the database, so logging cannot block on
  a stuck posting transaction.
- Every API call creates a trace id, logs the request and response, and passes
  the id to `rpc`. The backend logs `rpc.start`, `rpc.ok` or `rpc.fail` with the
  same id. The vouchers module logs `post.start`, `post.ok` and `post.fail` with
  it too.
- The importer uses one trace id for the whole run. The bill key, request id,
  party and line count are fields on that trace.

## 3. The record

One JSON object per line.

```json
{
  "ts": "2026-11-12T10:00:00.200Z",
  "level": "error",
  "source": "backend",
  "module": "vouchers",
  "event": "post.fail",
  "traceId": "t-1",
  "fields": { "requestId": "…:sh-1042", "durationMs": 12 },
  "error": { "code": "DUPLICATE_SUPPLIER_BILL", "message": "Already posted" }
}
```

| Field | Meaning |
|---|---|
| `ts` | ISO timestamp in UTC. |
| `level` | `debug`, `info`, `warn` or `error`. |
| `source` | `renderer` or `backend`. |
| `module` | `app`, `db`, `auth`, `rpc`, `api`, `import`, `vouchers`, and so on. |
| `event` | A stable short name such as `run.start` or `bill.post.ok`. |
| `traceId` | The id shared by a renderer operation and the backend call it caused. |
| `fields` | Small, structured context. Never passwords, tokens or secrets. |
| `error` | `code` and `message` for a failure. |

The renderer redacts any field whose key looks like a password, token, secret,
PIN or authorization header. The backend never logs RPC arguments, only the
channel and the argument count.

## 4. Where the files are

A debug build and the installed build keep separate data directories.

| Build | Data directory | Database | Logs |
|---|---|---|---|
| `tauri dev`, `cargo run` | `%APPDATA%\Crown Books Dev` | `crown-books.db` | `logs\app-YYYY-MM-DD.jsonl` |
| Installed release | `%APPDATA%\Crown Books` | `crown-books.db` | `logs\app-YYYY-MM-DD.jsonl` |

`CROWN_BOOKS_USER_DATA` overrides the user data directory for either build, so a
scripted run writes its database and logs under that directory. Tests use a
temporary directory.

The logger keeps the newest 14 daily files. The CLI can clear the rest.

## 5. The CLI

Run from the repository root:

```bash
npm run logs:tail              # last 80 lines, follow with the script below
npm run logs:dev               # follow the debug build's logs
npm run logs:release           # follow the installed build's logs
npm run logs:errors            # errors in the last hour
npm run logs:doctor            # paths, file count, last error
npm run logs:modules           # counts by module and level
npm run logs -- path           # print the log directory
npm run logs -- open           # open the directory in Explorer
npm run logs -- trace <id>     # every line for one trace
npm run logs -- search "text"  # literal search
npm run logs -- search "DUPLICATE_SUPPLIER_BILL" --module vouchers --level error
npm run logs -- tail --follow --module import
npm run logs -- clear --yes    # delete the log files
```

`node scripts/logs.mjs` accepts the same commands. Options: `--dir`, `--dev`,
`--release`, `--level`, `--module`, `--trace`, `--since` (`10m`, `2h`, `7d` or
an ISO timestamp), `--lines`, `--limit`, `--json`, `--no-color`, `--follow`,
`--yes`.

The CLI defaults to `auto`: it uses the dev folder when it exists, otherwise the
release folder. `--dev` and `--release` force one. `npm run logs:doctor` prints
both candidate paths.

## 6. Debugging a stuck import

1. Start the app from the worktree and reproduce the import.
2. Run `npm run logs:tail` in another terminal.
3. Find the run trace:

   ```bash
   npm run logs -- search "run.start" --module import
   ```

4. Read the whole trace:

   ```bash
   npm run logs -- trace <traceId>
   ```

5. Read the sequence:

   - `run.start` exists, `bill.start` exists, `bill.post.start` exists, and no
     `bill.post.ok` or `bill.fail` follows: the IPC call never settled. The
     timeout now turns this into `timeout` plus `bill.fail` after 30 seconds.
   - `rpc.start` exists with no `rpc.ok` or `rpc.fail`: the Rust command is
     waiting. Check the database lock and whether another copy of the app is
     running against the same `crown-books.db`.
   - `rpc.fail` with `database is locked`: close the other app instance. The
     connection uses a 5 second busy timeout.
   - `post.fail` with `DUPLICATE_SUPPLIER_BILL`: the supplier bill already
     exists for that supplier and financial year.
   - `party.create.fail` or `item.create.fail`: the role may lack
     `party.create` or `item.create`, or the name/GSTIN is invalid.

The importer's per-bill timeout is 30 seconds. It does not cancel the backend
call; it stops waiting and marks the bill failed. The request id is stable, so a
retry returns the original voucher instead of posting a second one.

## 7. Adding logs to a module

Renderer:

```ts
import { logger } from '@/lib/logger'

logger.info('items', 'create.start', { name })
logger.error('items', 'create.fail', { name }, traceId, { code, message })
```

Backend:

```rust
use crate::logging;

logging::info("items", "create.start", ctx.trace_id(), json!({ "name": name }));
logging::error("items", "create.fail", ctx.trace_id(), json!({}), err.code, &err.message);
```

Rules:

1. Use the module name the CLI filters on. Reuse an existing one where possible.
2. Log the start and the outcome of anything that can wait, retry or fail.
3. Put identifiers and counts in `fields`, not a formatted sentence.
4. Never log a password, token, secret, PIN or full bank detail.
5. Do not log every loop iteration. Log the unit of work.

## 8. Why not `tauri-plugin-log`

The official plugin was reviewed first. It is the right default for a Tauri app
that wants `log` crate macros, stdout, webview console and size-based file
rotation. This app needs three things the plugin does not give directly:

1. One JSONL file per day in the app's existing `Crown Books` data directory,
   next to the database and backups, so the CLI has one stable path.
2. One trace id shared by the renderer API call and the backend command.
3. A log write path that never waits on the SQLite mutex.

The custom writer is about 200 lines and has no extra dependency. If the app
later needs remote log shipping or size-based rotation, the plugin can replace
the writer without changing the call sites.
