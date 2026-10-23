# Forms refresh: required state, live validation and field help

Implements issues #2 and the form rules in `docs/form-implementation-guideline.md`.

## What changed

- `components/ui/field.tsx` now accepts `required` and `help`. Required labels
  render a visible asterisk plus a screen-reader "(required)" suffix. `Field`
  renders a help affordance in the label row and keeps the single hint/error
  line.
- `components/ui/field-help.tsx` adds a keyboard reachable help button. The
  tooltip opens on hover and focus, and a visually hidden copy of the text is
  linked with `aria-describedby`, so help never depends on a mouse.
- `components/ui/form-field.tsx` is the TanStack Form adapter. It validates on
  blur, then re-validates on change once the field is touched or the form has
  been submitted. `focusFirstError` moves focus and scrolls the first invalid
  field into view on an invalid submit.
- `lib/form-help.ts` holds every field explanation. Dialog copy, tests and the
  user guide read the same source.
- `features/parties/party-form.ts` holds the Zod schema, field rules and payload
  mapping. `features/parties/components/party-dialog.tsx` is the reference
  implementation.
- Item, account and journal surfaces reuse the same primitives.

## Behaviour

1. Required fields are marked before interaction.
2. An empty required field shows an error after blur or submit, never on the
   first keystroke.
3. Once touched, fixing a value clears the error immediately.
4. Submitting reveals and focuses the first invalid field. The primary button
   is never disabled because of an unseen validation rule.
5. Errors remain inline, below the control, linked by `aria-describedby`. They
   are never hidden in a tooltip.
6. Help is optional text, not the only place a rule is stated.

## Tests

- `tests/renderer/field.test.tsx` covers the marker, legend, help description,
  keyboard focus and error precedence.
- `tests/renderer/party-form.test.ts` covers every schema rule and the payload
  conversion, including paise rounding and blank-to-null.
- `tests/e2e/ux-refresh.spec.ts` covers invalid then valid email in the party
  dialog and the purchase bill flow.

## Adding a field

1. Add the explanation to `FIELD_HELP` with a one sentence summary and at most
   three bullets.
2. Add the rule to the feature schema or the field-level rule function.
3. Render it with `FormTextField` (TanStack Form) or `Field` (other controls).
4. Pass `required`, `help` and the tooltip content; do not write copy inline.
5. Add a rule test and, if the field is central, an E2E assertion.
