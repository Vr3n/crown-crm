# Windows build size

Status: implemented
Measured on: Windows 10 (10.0.19045), Electron 43.5.0, electron-builder 26.15.3, x64

## 1. The constraint

The app ships to shops running old PCs with small disks. The budget was:

| Artefact | Target | Hard limit |
|---|---|---|
| Installer (`dist/crown-books-0.1.0-setup.exe`) | < 100 MB | 250 MB |
| Installed footprint (`C:\Program Files\Crown Books`) | < 100 MB | 250 MB |

## 2. Baseline, before any change

| Part | Size |
|---|---|
| Installer | **104.61 MB** |
| Installed footprint | **386.35 MB** |
| — Electron runtime (exe, DLLs, pak files) | 312.71 MB |
| — Chromium locale packs (55 files) | 46.65 MB |
| — `app.asar` (our code + `node_modules`) | 25.75 MB |
| — `app.asar.unpacked` | 1.14 MB |

Two thirds of the payload was never going to be read: 54 unused locale packs, the
ExcelJS browser bundle, and eleven SQL dialects Drizzle ships but we do not use.

## 3. What changed

### 3.1 Chromium locales (`electron-builder.yml`)

`electronLanguages: [en-US]` keeps one of the 55 `.pak` files. The UI is English
only and `icudtl.dat` (number, date and currency data) is a separate file that is
still shipped, so `Intl` formatting is unaffected.

Saving: 46.11 MB on disk.

### 3.2 Compression (`electron-builder.yml`)

`compression: maximum` makes 7-Zip use its largest dictionary when building the
NSIS payload. Build time grows, install time grows a little, runtime is
unaffected because the archive is unpacked on install.

Saving: roughly 1 MB of installer, on top of the item below.

### 3.3 ExcelJS browser bundle (`electron-builder.yml`)

`require('exceljs')` resolves to `excel.js` → `lib/exceljs.nodejs.js`. The
`dist/` folder is the browser build and was shipped dead.

Saving: 19.87 MB on disk (2.6 MB in the installer).

### 3.4 Unused Drizzle dialects (`electron-builder.yml`)

`drizzle-orm` publishes one directory per SQL dialect. The app only opens the
`node:sqlite` driver, so everything except `node-sqlite`, `sqlite-core`, `sql`,
`query-builders`, `cache` and `up-migrations` is excluded.

Saving: 12.97 MB on disk (1.7 MB in the installer).

`up-migrations` **must stay**: `drizzle-orm/node-sqlite/migrator.cjs` requires
`../up-migrations/sqlite.cjs` when it runs, so excluding it builds an installer
that dies with `Cannot find module 'drizzle-orm/up-migrations/sqlite.cjs'` behind
a Windows error dialog. This is exactly what `npm run smoke:win` now catches.

### 3.5 Dependency classification (`package.json`)

electron-vite bundles renderer imports and externalises `dependencies` for the
main process, so anything only the renderer imports belongs in
`devDependencies` or it gets copied into the asar.

- `@tanstack/charts` → `devDependencies` (only imported by
  `src/renderer/src/components/charts/*`). Saving: 2.83 MB on disk.
- `@yornaath/batshit` removed. It belonged to the retired dashboard search and
  had no remaining imports. Saving: 0.1 MB.

### 3.6 Repo files that are not runtime files (`electron-builder.yml`)

`scripts/`, `test-results/`, `.herdr-sync/`, `.releaserc.json` and
`skills-lock.json` were being copied into the asar. The NSIS installer reads
`scripts/install-binding.nsh` from the project directory at build time, not from
the package, so excluding them is safe.

## 4. Result

| Part | Before | After | Change |
|---|---|---|---|
| Installer | 104.61 MB | **94.65 MB** | −9.96 MB (−9.5%) |
| Installed footprint | 386.35 MB | **327.02 MB** | −59.33 MB (−15.4%) |
| — Electron runtime | 312.71 MB | 312.71 MB | unchanged |
| — locales | 46.65 MB | 0.54 MB | −46.11 MB |
| — `app.asar` | 25.75 MB | 12.63 MB | −13.12 MB |
| — `app.asar.unpacked` | 1.14 MB | 1.14 MB | unchanged |

The installer target is met. The installed-footprint target is not, and cannot be
met with Electron: 312.71 MB of the 327.02 MB install is the Chromium/Node runtime
we do not build (95.6% of the footprint). Reaching 250 MB would mean deleting
runtime DLLs that potato PCs need as fallbacks (`vk_swiftshader.dll`,
`dxcompiler.dll`) or the Chromium licence bundle, or moving off Electron to a
WebView2 shell. None of those are worth the support cost today.

## 5. Rules for future changes

1. A package the renderer imports goes in `devDependencies`. A package the main
   process `require`s at runtime goes in `dependencies`.
2. Adding a Drizzle dialect or a `drizzle-orm/<dialect>` subpath means removing
   that directory from the exclusion list in `electron-builder.yml`.
3. Do not remove `vk_swiftshader.dll`, `vulkan-1.dll`, `dxcompiler.dll` or
   `dxil.dll` to save space. They are the software-rendering fallbacks that keep
   the app usable on machines without working GPU drivers.
4. Do not remove `LICENSES.chromium.html`. It is a redistribution requirement,
   and it is only ~2.5 MB inside the installer.
5. Run `npm run smoke:win` after touching `files`, `asarUnpack`, the afterPack
   hook or any `dependencies` entry. A green `build:win` does not prove the
   package runs.

## 6. Verification

```powershell
npm run typecheck   # 2 projects
npm run lint        # 0 errors
npm test            # 45 files, 365 tests
npm run build:win   # installer + win-unpacked
npm run smoke:win   # launches dist/win-unpacked/CrownCRM.exe
```

`npm run smoke:win` (`scripts/smoke-packaged.mjs`) launches the packaged
executable through Playwright against a throwaway `CROWN_BOOKS_USER_DATA`
directory, completes first-run setup over the real IPC bridge, and reads the
seeded numbering rows back out of SQLite. It fails loudly instead of leaving a
dialog for the user to find.

Measured size check:

```powershell
Get-ChildItem dist -File -Filter *.exe | Select-Object Name, Length
(Get-ChildItem dist/win-unpacked -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
```
