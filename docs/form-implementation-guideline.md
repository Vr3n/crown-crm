# Form and dialog implementation guideline

Applies to: capture forms, dialogs, sheets and the voucher entry page.
Read with: `06-design-system.md`, `03-voucher-posting-rules.md`

## 1. Choose the right surface

| Surface | Use for | Examples |
|---|---|---|
| Full page | A document with lines, totals and a post action | Sales invoice, purchase bill, receipt |
| Dialog | A short record with 3 to 8 fields, no lines | New party, new item, new account |
| Sheet | Detail that sits beside a list without losing context | Party quick view, bill detail |
| Inline row | A single value in a table | Editing a due date, a credit limit |

Do not put a voucher in a dialog. Do not put an eight field master in a sheet.

## 2. Anatomy

```
┌ Header ────────────────────────────────────────┐
│ Title                          [secondary] [primary] │
├ Body ──────────────────────────────────────────┤
│ Field groups in reading order                  │
│ Errors inline, next to the field               │
│ Totals block, sticky at the bottom if lines    │
└ Footer ────────────────────────────────────────┘
```

Rules:

1. Label above the input, always. Never placeholder as label.
2. Required fields marked with a word in the label row, not only an asterisk.
3. Helper text under the label, error text under the input, never both fighting for the same line.
4. Field groups separated by 20px, related fields 8px apart.
5. Primary action right aligned, secondary left of it, destructive separated and confirmed.
6. The primary action states the outcome: "Post invoice", not "Submit".
7. Escape closes, with a confirmation only when there are unsaved changes.
8. Focus the first meaningful field on open. Focus the party field on a new voucher.

## 3. State with TanStack Form

One form instance per surface. Validation runs on blur and on submit; never on every keystroke for expensive rules.

```ts
const form = useForm({
  defaultValues,
  validators: { onSubmit: voucherSchema, onBlur: stepSchema },
  onSubmit: async ({ value }) => postVoucher(value)
})
```

Rules:

1. Field level schema for format. Form level schema for cross field rules.
2. Cross field rules: due date not before voucher date, discount not above line value, quantity positive, rate not negative.
3. Server errors map back to fields by `error.path`. A general error goes to a banner above the footer.
4. Do not disable the primary button because of an invalid field the user cannot see. On click, reveal the first error and focus it.
5. A submit in flight disables the button and shows progress inside it. It does not replace the form with a spinner.

## 4. Voucher entry specifics

### Layout

```
Party row: picker, balance, credit days, hold warning
Header row: date, due date, reference, place of supply
Lines: item, description, HSN, qty, unit, rate, discount, GST, amount
Totals rail: taxable, CGST, SGST, IGST, cess, round off, total, in words
Footer: save draft, post, print
```

### Behaviour

- Item picker searches name, SKU and HSN. Selecting fills description, HSN, unit, rate and GST from the item.
- A line can be free text. It keeps its snapshot and never touches stock.
- Rate entry supports inclusive and exclusive. The toggle does not change the typed number; it changes the interpretation and the computed taxable value.
- Discount accepts a percent or an amount, never both. Switching clears the other.
- Totals recompute on every line change, locally, with the same rounding function the server uses.
- The posted totals are whatever the server returns. If the preview and the server disagree by a paisa, the server wins and the UI shows the posted values.
- On post success: clear the form, show a toast with the voucher number and a link, keep the party and date for the next entry.
- On post failure: keep every value, show the error at the field or in the banner, never lose the grid.

### Keyboard

The grid must be fully usable without a mouse.

| Key | Action |
|---|---|
| Enter | Commit the cell, move down |
| Tab | Next cell |
| Shift+Tab | Previous cell |
| Alt+Insert | Add a line |
| Alt+Delete | Remove the current line, with confirm |
| Ctrl+Enter | Post |
| F4 | Open the party picker |
| F2 | Focus the date |
| Esc | Leave the page, confirm if dirty |

## 5. Pickers

Party picker:

- debounced search at 200 ms
- shows name, phone, GSTIN, balance, credit days
- creates a party inline without leaving the voucher, in a nested dialog that returns the new id
- filters to customers on a sale, suppliers on a purchase
- warns, not blocks, when the party is over the credit limit

Item picker:

- search by name, SKU, HSN
- shows unit, GST rate, sale price, stock on hand
- service items are labelled
- inactive items are hidden by default with a toggle to show them
- allows a free text line when nothing matches

## 6. Numbers and dates

- Money inputs accept `1,23,456.78`, `123456.78` and `123456`. They store paise.
- Quantity accepts up to four decimals.
- Date inputs accept `DD-MM-YYYY` typed, and a picker for the rest.
- The financial year is shown next to the date when the date falls outside the current year.
- Never let a date outside an open period be posted without a clear error before submit.

## 7. Validation messages

Plain, specific, actionable.

| Bad | Good |
|---|---|
| Invalid input | Rate must be greater than zero |
| Error | This bill is 2,000 over the amount received |
| Something went wrong | Could not post: the voucher number is already used. Try again |
| Required | Party is required to post a credit sale |

No exclamation marks. No emoji. No "Oops".

## 8. Accessibility

- Every input has a `label` bound by `htmlFor`.
- Errors use `aria-describedby` and `aria-invalid`.
- The totals block announces changes politely, once per change, not per keystroke.
- Dialogs trap focus and restore it on close.
- The grid announces row and column position for screen readers.
- Colour is never the only signal.

## 9. Testing a form

Every form has:

1. A render test with empty state.
2. A validation test per rule, asserting the message and the focus target.
3. A successful submit test asserting the payload shape.
4. A server error test asserting the error lands on the right field.
5. A keyboard path test for the primary task.

Voucher entry additionally tests the totals math, the inclusive toggle, and add/remove line.

## 10. Anti patterns

- A dialog inside a dialog more than one level deep.
- A disabled post button with no explanation.
- Losing entered lines on a failed post.
- Computing tax in the component with a different function than the server.
- Auto saving a posted voucher.
- A "Cancel" button that deletes data.
- Placeholder text used as the only label.
- Form fields that reset when the user tabs away.
