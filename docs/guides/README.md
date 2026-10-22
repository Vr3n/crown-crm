# Crown Books user guide

The PDF is written for the people who use the application, not for developers.

- **Full guide:** [`crown-books-user-guide.pdf`](crown-books-user-guide.pdf) — 32 pages, 10 chapters, 30 figures.
- **Quick start:** [`crown-books-10-minute-quick-start.pdf`](crown-books-10-minute-quick-start.pdf) — eight pages, one screen per page.
- **Built HTML:** [`crown-books-user-guide.html`](crown-books-user-guide.html)
- **Source:** [`src/`](src/) — one partial per chapter, plus `guide.css` and `template.html`.
- **Screenshots:** [`assets/screens/`](assets/screens/) — full captures and compact `-detail` crops.
- **Callout positions:** [`assets/annotations.json`](assets/annotations.json)

## How the guide is laid out

- A4, 176 mm text column, 17 mm side margins.
- A procedure is two columns: 58 mm of numbered steps and a 112 mm screenshot. The whole
  block moves to the next page rather than splitting the instructions from the picture.
- The red number on a screenshot is the step number. Steps without a marker have nothing
  specific to point at. Reference figures use a key under the caption instead.
- Report screenshots use a 120 mm crop that ends just below the table, so the numbers stay
  readable instead of shrinking into a mostly empty app window.
- Chapter openers always start a new page. Section headings are never left alone at the bottom
  of a page, and tables are kept with their heading.
- TOC page numbers, chapter bookmarks and PDF metadata are generated on the second render pass.

## Rebuilding it

The screenshots come from the real Electron build.

```powershell
npx electron-vite build
node scripts/guide/capture-guide.mjs
python scripts/guide/crop-guide-assets.py
node scripts/guide/build-guide.mjs
node scripts/guide/render-guide-pdf.mjs
node scripts/guide/render-guide-pdf.mjs docs/guides/crown-books-10-minute-quick-start.html docs/guides/crown-books-10-minute-quick-start.pdf --quick
```

`capture-guide.mjs` creates a throwaway company, posts a month of purchases, sales, receipts,
payments and adjustments, captures the screens and writes the callout coordinates. It removes
the throwaway database when it finishes. `crop-guide-assets.py` makes the compact report crops
used by the guide; run it after any recapture.

`build-guide.mjs` assembles the partials into the built HTML and checks that every screenshot
referenced by the guide exists. `render-guide-pdf.mjs` prints the PDF twice: the first pass finds
each chapter's start page, those numbers are filled into the contents page, and the second pass
adds bookmarks and metadata.

To inspect the PDF as images:

```powershell
uv run --with pymupdf --with pillow python scripts/guide/preview_pdf.py
```

The preview images are written to `%LOCALAPPDATA%\Temp\opencode\guide-pdf`.

## Editing the guide

- Write one action per numbered step, in the order the reader performs it.
- Keep a procedure block shorter than one printed page. If it grows, cut prose rather than
  letting it split.
- Marker numbers must match step numbers. If you add a step, renumber the markers on that figure.
- Update the chapter's `In this chapter` line and the contents page if a section is added or removed.
- Every figure needs a caption that says what the reader is looking at, not just "Figure 6.2".
