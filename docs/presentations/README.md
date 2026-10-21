# Stakeholder decks

Two HTML slide decks that accompany the written plan. Open either file in a browser. No build step, no server, no network.

| File | Subject | Slides |
|---|---|---|
| `01-technical-plan.html` | What changes in the codebase, why, in what order, at what risk | 21 |
| `02-data-flow-and-schema.html` | How a party, a bill, a receipt and a stock movement become a report | 21 |

`03-e2e-flow.html` is a scrollable evidence report rather than a slide deck: 27 screenshots captured by Playwright, grouped by phase, with the commands and the coverage matrix.

## Controls

| Input | Action |
|---|---|
| Right arrow, Space, Page Down, Enter | Next slide |
| Left arrow, Page Up, Backspace | Previous slide |
| Click anywhere | Next slide |
| G or the menu button | Slide index |
| Escape | Close the index |
| Home, End | First or last slide |
| Swipe | Next or previous on a touch screen |

The URL hash tracks the slide, so `...html#12` opens slide 12. Useful when sharing a specific exhibit.

## Design

Both decks use the same "Ledger Paper" system as the product: warm paper, ink text, hairline rules, one ink blue accent, tabular numerals. Section colour is used only for meaning: brick for risk and deletion, green for money in and acceptance, amber for caution.

Exhibits animate on entry with GSAP. Animation is limited to position, opacity and scale, and the slide becomes fully visible after a short timeout even if the animation library fails to load. Everything works with the keyboard and respects `prefers-reduced-motion`.

GSAP is vendored at `vendor/gsap.min.js` (3.12.5, standard licence) so the decks work offline. If the local file is missing, the page falls back to the CDN.

## Printing

The decks are screen-first. For a printed handout, use the PDF exports generated from these files rather than printing the browser view, because slides are positioned on a fixed 1600 by 900 canvas and scale to the window.

## Keeping them current

The wording is drawn from `docs/00` to `docs/09`. When a decision in `docs/07-phase-plan.md` changes, update the decision slide in deck 01 and the approval slide in deck 02 in the same commit. Page numbers appear in the footer; if a slide is added or removed, renumber the rest.
