# User guide PDF layout

## Why this exists

The first edition of `crown-books-user-guide.pdf` had good content but poor pagination. The
52-page PDF was built as one long HTML flow with large full-width screenshots and
`break-inside: avoid` on every figure. The result was:

- Half-empty pages. Chapter 2 ended after the company screenshot, the field table started on the
  next page, and chapter 4 had a page with only one table on it.
- Instructions separated from their screenshot. A section heading and its table could sit at the
  bottom of one page while the picture that explained it was on the next.
- Two competing step lists. The numbered callout legend under each figure repeated the numbered
  steps in the body, often in a different order and with different numbers.
- Three tables of contents. "What the guide covers", "Contents at a glance" and the real contents
  page all listed the same chapters, and every chapter repeated the list again in a blue box.
- Repeated warnings. The posted-voucher rule, reserved masters and "not in this edition" notes
  appeared in several places.
- Screenshots with a large empty app window below a short table, which made the table text tiny.

## What changed

### Source

The guide is now assembled from one partial per chapter:

```
docs/guides/src/
  00-cover.html
  01-front.html
  02-toc.html
  03-ch01.html ... 12-ch10.html
  guide.css
  template.html
```

`scripts/guide/build-guide.mjs` inlines the stylesheet, validates that every screenshot exists
and writes `docs/guides/crown-books-user-guide.html`. The built HTML is committed so the guide
can be opened without running the build.

### Page system

- A4, 176 x 261 mm text area, 17 mm side margins, 19 mm top and 17 mm bottom.
- 9.4 pt body text, 1.5 line height. Section headings 13.2 pt with a 0.5 pt rule and the section
  number in monospace red.
- Two-column procedures: 58 mm of steps, 6 mm gutter, 112 mm screenshot.
- `break-inside: avoid` is applied to the whole procedure block, so the heading, steps and
  screenshot cannot be split. A block is kept below one page height so it always fits.
- Chapter openers force a page break. Section headings and tables are wrapped in `.keep` blocks.
- Report figures use a 150 mm width and a compact crop. Wide figures (the printed invoice,
  the opening-balance strip) use the full 176 mm column.

### Content

- One contents page: chapter number, title, one-line description and the page number. The two
  duplicate "what this covers" tables and the per-chapter blue box are gone.
- Each procedure has one numbered list. Marker numbers are the step numbers; steps with no field
  to point at simply have no marker. Reference figures use a short key under the caption.
- Front matter is two pages: how to use the guide, then the contents and the recommended reading
  paths.
- Chapter checklists that only repeated the steps were removed. The remaining checklists are
  verification lists (opening balances, stock, GST return), not a second procedure.
- Warnings are kept once, at the point where the mistake happens.
- The purchase print section was removed because the same flow is covered for sales; the print
  instruction now sits in "What posting does".

### Screenshots

`capture-guide.mjs` still captures the full 1785 x 1043 app window. `crop-guide-assets.py` creates
the report crops used by the guide:

- parties, items, payables, receivables, ageing, stock, both registers, journals and backup are
  cropped just below the table;
- the first-run screen is cropped to the form (the left marketing panel is gone);
- the opening-balances section is cropped to the section itself, with side margins for the
  callouts and no top margin, so the section above it does not leak into the figure.

Marker percentages are measured against the capture, then `sync-annotations.mjs` rewrites them
into the partials by marker order and remaps the crops (`CROPS` in both scripts must agree). A
crop height change therefore needs no manual arithmetic.

Callouts sit in white space, not on top of the interface text: dialog forms keep a 44 px crop
margin and pull the marker into the left margin (`dx: -26`), and the printed invoice places each
marker beside its block because the page has almost no margin of its own.

### PDF finishing

`render-guide-pdf.mjs` renders twice:

1. Print a temporary PDF and find the page where each `Chapter NN` kicker appears.
2. Fill those numbers into the contents page and print the final PDF.

`pdf_polish.py` then adds 13 bookmarks (cover, front matter, contents, 10 chapters) and the
document metadata.

## Result

- 52 pages to 41 pages.
- 32 figures, all with captions; 123 callout markers.
- No procedure is split across pages; no section heading is orphaned at the bottom of a page.
- Page numbers in the contents match the final PDF.
- Chapter bookmarks work in any PDF reader.

## Maintenance rules

- Keep a procedure block under one printed page. If it grows past that, cut text or move a
  supporting table to its own section; do not remove the `break-inside: avoid`.
- Marker numbers must match step numbers. Renumber both together.
- Keep report figures cropped below the last table row. A full app window at 150 mm makes the
  numbers unreadable.
- After adding a chapter, update the contents partial; the bookmark list is generated from the
  `.chapter` elements automatically.
- Rebuild and check the contact sheet before committing: `node scripts/guide/build-guide.mjs`,
  `node scripts/guide/render-guide-pdf.mjs`, then `preview_pdf.py`.
