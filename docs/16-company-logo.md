# 16 — Company logo

Issue: the company avatar on the Company page showed initials with no way to
change them. This change adds a small pen affordance that uploads, replaces and
removes the logo, and persists it on the company row.

## Storage: a data URL on `companies.logo`

The logo is stored as a `data:image/...;base64,...` string in the existing
`companies.logo` column. No migration was needed: the column has been part of
the core schema since `20261021000000_accounting_core` (line 21).

Why not a file under `userData`:

- A backup is a plain copy of `crown-books.db` (`docs/15-backup.md`). A logo in
  a sibling file would silently disappear on restore unless the backup grew a
  second asset and a manifest.
- Printing and PDF export need the image while rendering a document. A data URL
  is available to the renderer without a second IPC read or a `file://` path.
- SQLite handles a few hundred kilobytes in a row comfortably. The SQLite forum
  discussion on storing images confirms the trade-off: small images are fine as
  blobs/text; large media belongs outside the database. A 512px logo is small.

The cap is **512 KiB of encoded text** (`MAX_COMPANY_LOGO_DATA_URL_LENGTH`),
which is roughly 384 KiB of binary image. A prepared 512px logo is normally far
below that; the cap is a guard against a pathological file, not a target.

Accepted formats are PNG, JPEG and WebP. SVG is deliberately rejected: it can
carry script and is unnecessary for a raster logo.

References:

- SQLite forum, storing images in the database:
  <https://sqlite.org/forum/forumpost/7702be1a335f95f3?raw=>
- MDN, using files from web applications (file input + `FileReader`):
  <https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications>
- Electron context isolation (why the renderer prepares the data URL instead of
  receiving a filesystem path):
  <https://electronjs.org/docs/latest/tutorial/context-isolation>

## Boundary and persistence

`src/shared/contracts/identity.ts` now exports:

- `MAX_COMPANY_LOGO_DATA_URL_LENGTH = 512 * 1024`
- `isCompanyLogoDataUrl(value)` — PNG/JPEG/WebP base64 only
- `companyLogoInputSchema` — nullable, size-capped, shape-checked
- `logo` on `updateCompanyInputSchema` and `CompanyProfile`

`updateCompany` uses patch semantics:

| Input                   | Result                            |
| ----------------------- | --------------------------------- |
| `logo` omitted          | stored value is untouched         |
| valid PNG/JPEG/WebP     | replaces the stored logo          |
| `''` or `null`          | clears the logo                   |
| wrong MIME or oversized | `ValidationError` at the boundary |

The Company editor never sends `logo`, so saving the identity form keeps the
current image. The repository maps `logo` in `CompanyRow`, `mapCompany` and
`companyRepo.update`; `identity-read.ts` exposes it on the profile read model.

Logo changes intentionally do not write an audit row, matching the rest of
`updateCompany`.

## Renderer pipeline

`src/renderer/src/lib/company-logo.ts` turns a picked `File` into the stored
string:

1. Reject anything that is not PNG/JPEG/WebP. If `File.type` is empty (some
   Windows shell paths), fall back to the file extension.
2. Decode with `createImageBitmap`, falling back to an `<img>` + object URL.
3. Scale so the longest edge is at most 512px, never upscaling. Large images are
   halved repeatedly before the final draw to avoid aliasing thin strokes.
4. Encode:
   - PNG input tries PNG first to keep transparency, then WebP at 0.9/0.8/0.7/0.6.
   - JPEG/WebP input goes straight to WebP at the same qualities.
5. Return the first result within the 512 KiB cap, otherwise throw a friendly
   error.

Re-encoding from canvas pixels also means a mislabelled source file cannot put
arbitrary bytes into the database: the stored value is always real PNG/WebP
output.

Canvas resize reference:

- Dynamsoft, resizing an image with JavaScript canvas:
  <https://www.dynamsoft.com/codepool/how-to-resize-image-with-javascript.html>

## Screen

`CompanyLogoAvatar` replaces the static initials block in `CompanySummary`:

- 48px square, `object-contain`, subtle border, no distortion. The box keeps a
  `bg-card` background so transparent PNGs stay legible; initials use `bg-muted`.
- A 24px pen button sits at the top-right (`-right-2 -top-2`) and is always
  visible. 24px is the WCAG 2.5.8 minimum target size.
- The button is a real `<button>` with `aria-label="Change company logo"` and a
  visible focus ring, so it is keyboard reachable.
- It opens a hidden `<input type="file" accept="image/png,image/jpeg,image/webp">`
  labelled **Company logo file**. The input is `sr-only` with `tabIndex={-1}`;
  the pen is the only tab stop.
- When a logo exists, a small **Remove** text button appears under the avatar.
  It opens `ConfirmDialog`; removal is never one click. The action row reserves
  height so adding/removing the logo does not shift the card.
- While decoding or saving, the pen shows a spinner and both actions are
  disabled. Success and failure use toasts; the error text comes from the
  boundary or the preparation helper.

The upload goes through `window.api.identity.updateCompany({ logo })`. On success
the mutation writes the returned profile into `['company','profile']` and
invalidates it, so the avatar and any other consumer update immediately.

Avatar-upload interaction references:

- ReUI file upload (avatar preview + edit affordance):
  <https://reui.io/docs/components/radix/file-upload>
- shadcnblocks avatar upload:
  <https://www.shadcnblocks.com/component/file-upload/file-upload-special-1>
- WCAG 2.5.8 target size minimum:
  <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum>

## Tests

- `tests/main/application/company-logo.test.ts`
  - valid data URL persists and survives an unrelated company patch
  - oversized encoded value is rejected
  - SVG and non-data-URL values are rejected
  - `''` and `null` clear the logo
  - boundary schema accepts the three MIME types and rejects the rest
- `tests/renderer/company-logo.test.tsx`
  - initials when no logo
  - `<img>` plus accessible pen and remove buttons when a logo exists
  - pen click opens the labelled file input
  - remove asks for confirmation and does nothing on cancel
  - confirming calls `updateCompany({ logo: null })`
- `tests/e2e/ux-refresh.spec.ts`
  - uploads a tiny PNG with `setInputFiles`, asserts the rendered logo
  - reloads and asserts persistence
  - removes the logo through the dialog, asserts initials return
  - reloads again to prove the removal was saved

## Not in scope

- The logo is not yet drawn on printed invoices or exported PDFs. The data is on
  the profile read model, so the print work can consume it without another
  storage change.
- Cropping and manual zoom are not offered; the image is fitted with
  `object-contain`.
