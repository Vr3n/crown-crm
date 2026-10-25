# 15 — Backup and multiple folders

Issue #25. The backup screen writes a plain SQLite copy of `crown-books.db` and,
since this change, the same file into any number of extra folders.

## What a backup is

- The live database is `crown-books.db` in Electron's `userData` folder.
- Before copying, the main process runs `PRAGMA wal_checkpoint(TRUNCATE)` so the
  `.db` file on disk is complete on its own and no `-wal` sidecar is needed.
- The copy is a byte-for-byte file copy, not an export. Restore stays manual:
  close the app, keep the current database, replace it with the backup, reopen.
  Automating a live swap risks data loss and is deliberately not offered.

## Where destinations live

Destinations are a **machine setting**, not business data. They are stored in
`backup-destinations.json` in `userData`, next to the database:

```json
["D:\\Books Backup", "C:\\Users\\me\\OneDrive\\Crown Books"]
```

Keeping them out of the database means a backup restored on another computer
does not carry stale drive letters, and the settings file itself never appears
inside a backup.

The primary folder is always `userData/backups`. It is always written, cannot be
added as an extra destination, and cannot be removed.

## Copy plan

`create` resolves the plan as `[primary, ...extras]`:

1. The primary copy is written first. If it fails, the channel throws: without it
   there is no backup at all.
2. Every extra folder is attempted independently. One unplugged drive is
   reported and the remaining folders still receive the file.
3. The result carries one `{ path, ok, error? }` per folder:

```ts
{
  name: 'crown-books-2026-10-25T11-32-04-120Z.db',
  sizeBytes: 912_384,
  createdAt: '2026-10-25T11:32:04.121Z',
  copies: [
    { path: 'C:\\…\\userData\\backups', ok: true },
    { path: 'D:\\Books Backup', ok: true },
    { path: 'E:\\Unplugged', ok: false, error: 'Folder is not available' }
  ]
}
```

The same file name is used in every folder, so a copy can be identified without
guessing. Folders are created if they disappear between backups and the parent
still exists.

## IPC

All four channels require `backup.manage`.

| Channel                    | Input                    | Result                                       |
| -------------------------- | ------------------------ | -------------------------------------------- |
| `backup:create`            | —                        | `BackupFile` with `copies`                   |
| `backup:list`              | —                        | `BackupFile[]` from the primary folder only  |
| `backup:destinations`      | —                        | `{ primary, extras: [{ path, available }] }` |
| `backup:addDestination`    | — (native folder picker) | `BackupDestinations \| null`                 |
| `backup:removeDestination` | `{ path }`               | `BackupDestinations`                         |
| `backup:reveal`            | `{ path }`               | `void`                                       |

`addDestination` uses `dialog.showOpenDialog` with `openDirectory` and
`createDirectory`. A cancelled dialog resolves `null`, not an error. Paths are
normalised with `resolve`, trailing separators are dropped (drive roots are kept
intact), and duplicates are compared case-insensitively.

`backup:list` reads only the primary folder. Scanning every configured drive on
each page load would make the screen slow and would fail on an unplugged disk;
the destination list already says whether each extra folder is reachable.

## Screen

`BackupPage` adds a **Backup folders** section:

- Primary row: path, a `Primary` pill and **Open**.
- Extra rows: path, `Available` / `Missing` pill, **Open** and **Remove**.
- Footer: **Add folder**, plus a line explaining that a folder that is unplugged
  is skipped.
- Removing asks for confirmation; files already in that folder are left alone.

After a backup the toast reports how many copies were written. When a folder
fails the toast turns into a warning and names the folder that was skipped, so a
partial backup is never presented as a clean one.

## Tests

- `tests/main/backup/destinations.test.ts` covers normalisation (including the
  Windows drive root), case-insensitive de-duplication, the primary guards,
  persistence across reads, a corrupt settings file, availability when a folder
  disappears, and a failing destination that does not stop the other copies.
- `tests/e2e/v1-flow.spec.ts` replaces the folder picker with a temp folder,
  adds it, creates a backup, asserts a `.db` file landed there, then removes the
  folder and asserts the list is back to one.
