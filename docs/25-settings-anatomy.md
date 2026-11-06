# Settings anatomy

Status: implemented for issue #21
Applies to: Company, Voucher numbering, Units, Tax Rates, Users and Roles
Read with: `06-design-system.md`, `form-implementation-guideline.md`

## 1. Page contract

Every settings page answers three questions without opening a dialog.

1. What does this setting change?
2. What is its current state?
3. What is the next action?

The order is the same on every page. A consequence sentence or panel comes
first, then a state strip, then the table, then the actions. Counts sit in a KPI
strip so the state is visible before the rows are read. One primary action per
page. Actions stay inside the existing permission rules.

This is a presentation change. The schema, the IPC surface, the write paths and
the permission checks are unchanged.

## 2. Company

A sentence above the summary states the consequence. The profile sets the
identity and tax details printed on every document, the financial year used by
reports and numbering, and the opening date.

Setup readiness shows four checks as status pills with the current value.

| Check             | Ready value          | Missing value         |
| ----------------- | -------------------- | --------------------- |
| GSTIN             | the GSTIN            | `Not on file`         |
| Voucher numbering | `Set`                | `Not set`             |
| Books begin       | the formatted date   | `Not set`             |
| Financial year    | the financial year   | the financial year    |

Readiness rules live in `src/renderer/src/lib/company-readiness.ts` and are pure.

1. Missing numbering comes first because no voucher can post without a number.
   The action is `Set up voucher numbering` and links to `/settings/numbering`.
2. Missing GSTIN comes second, once numbering is set. The action is
   `Add GSTIN (optional)` and points to `#company-identity`. A missing GSTIN is
   neutral, not a warning. An unregistered business is a legitimate state.
3. When both are set there is no next action. The footer shows `Ready`.
4. Books begin and financial year are information only. They never replace the
   two actions above.

The editor's identity section carries `id="company-identity"` so the GSTIN
action can scroll to the field.

## 3. Voucher numbering

A summary row sits above the table. It shows the next sales invoice, the next
purchase bill and the last saved time. The numbers use the same live preview as
the table, so edits appear in both places.

`numberingSetupAt` is updated on every successful save. The label is
`Last saved`, not `Last changed`.

If the company profile query is unavailable, the table still renders and the
last saved line is left out. The page never blocks on the profile.

The date-token help and the inline next number on every row are unchanged.

## 4. Units

The KPI strip shows active units, units used by items, and inactive units.

The page fetches all units and filters inactive rows in the renderer. The
`Show inactive units` toggle therefore does not change the counts.

New items start with no unit. The page says this plainly. Every stocked item
needs a unit before stock can be tracked. There is no default unit setting, and
this page does not invent one.

A unit used by an item cannot be retired. The row shows `In use by N items` next
to the disabled Retire action. The disabled state is not explained only in a
tooltip.

## 5. Tax rates

The KPI strip shows current rates, upcoming or ended rates, and total rows.

The page fetches the full history and filters the table when
`Show ended and upcoming rates` is off. The counts do not change with the
toggle. The current count reads `isCurrent` from the RPC, so the renderer and
the backend agree on the business date.

New items start at 0% GST and 0% cess. The page says this plainly. There is no
default rate setting, and this page does not invent one.

The effective-dated explanation and the revision and retirement dialogs are
unchanged. Posted documents keep the rate stored on their lines.

## 6. Users and roles

The KPI strip shows active people, disabled people, roles and custom roles.

The People table shows one line under the role name. It uses the role
description. When the description is empty the fallback is one of:

1. `Every permission in the app` for the super role.
2. `N permissions granted` for a role with permissions.
3. `No permissions granted` for a role with none.

The role picker in the new and edit person dialogs shows the selected role's
consequence as the hint. The consequence is visible where the role is assigned,
not only on the Roles tab.

System role locks and permission gating are unchanged.

## 7. Default-state wording

| Page              | Wording                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Company           | `This profile sets the identity and tax details printed on every document, the financial year used by reports and numbering, and the opening date.` |
| Company, GSTIN    | `Not on file` and `Optional if the business is unregistered`                                |
| Units             | `New items start with no unit. Every stocked item needs one before its stock can be tracked.` |
| Units, retire     | `In use by N items`                                                                          |
| Tax rates         | `New items start at 0% GST and 0% cess. Choose the rate on the item when it needs one.`      |
| Users and roles   | Role description, or `N permissions granted`, or `No permissions granted`                    |

## 8. Tests

`tests/shared/company-readiness.test.ts` covers the readiness order, the
optional GSTIN action, the numbering action, the ready state and the financial
year label.

`tests/renderer/settings-anatomy.test.tsx` covers:

1. Company readiness with both missing: the required numbering action comes
   first.
2. Company readiness with numbering missing: one action, linked to
   `/settings/numbering`.
3. Company readiness with numbering set and GSTIN missing: the optional GSTIN
   action anchors to the identity section.
4. Numbering: the last saved line and the next sales and purchase numbers.
5. Numbering: the table still renders when the profile is unavailable.
6. Units: a unit used by items shows `In use by 3 items` and a disabled Retire
   action.
