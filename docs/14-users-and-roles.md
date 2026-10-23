# 14 - Users and roles

The books now support more than one local operator. People sign in with an email
and password, roles carry explicit permission codes, and the main process is the
enforcement point for every staff and role command. The same pass also exposes
the actor and audit trail on a voucher.

## Where it lives

| Layer       | File                                                             | Responsibility                                                                           |
| ----------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Contract    | `src/shared/contracts/access.ts`                                 | Staff, role and permission read models; update/create schemas.                           |
| Schema      | `src/main/db/schema/identity.ts`                                 | Existing `users`, `roles`, `role_permissions`, `company_users`. No migration was needed. |
| Repository  | `src/main/repositories/identity.ts`                              | Staff list/update, role CRUD, permission grants, active-super count.                     |
| Repository  | `src/main/repositories/audit.ts`                                 | Append-only audit writes and actor joins.                                                |
| Guards      | `src/main/auth/access-guards.ts`                                 | Privilege-escalation checks for role grants and role assignment.                         |
| Application | `src/main/application/access.ts`                                 | Gated staff/role use cases, password reset, last-owner protection, audit.                |
| Application | `src/main/application/identity.ts`                               | `createStaffMember` now accepts `roleId`, checks assignment and audits the create.       |
| IPC         | `src/main/ipc/access.ts`                                         | `identity:staff`, `identity:roles`, `identity:permissions` and mutation channels.        |
| IPC         | `src/main/ipc/identity-read.ts`                                  | Reduced to the company profile read.                                                     |
| Preload     | `src/preload/index.ts`                                           | `window.api.identity` staff/role methods.                                                |
| UI          | `src/renderer/src/features/settings/pages/UsersRolesPage.tsx`    | People and Roles tabs, create/edit dialogs, password reset, permission editor.           |
| UI          | `src/renderer/src/features/vouchers/pages/VoucherDetailPage.tsx` | Hides cancel without `voucher.cancel`; shows actors and audit trail.                     |

## Local accounts

- Accounts are local to the installation. There is no cloud identity, invite
  email or PIN login. The existing email/password login is reused.
- Creating a person stores a hashed password, a company membership and a role.
  The password is never written to the audit trail.
- Deactivating a person sets both the membership and user status to `DISABLED`,
  which blocks login immediately. The person is not deleted, so old vouchers and
  audit rows keep their names.
- Reactivating the person restores both statuses.
- Resetting a password replaces the hash immediately. The old password stops
  working; the new one is not stored in audit data.

## Roles and permissions

The five seeded roles are:

| Role          | Type          | Access                                         |
| ------------- | ------------- | ---------------------------------------------- |
| Owner         | System, super | Every permission. Locked.                      |
| Admin         | System, super | Every permission. Locked.                      |
| Accountant    | Custom        | Masters, vouchers, payments, reports, backup.  |
| Billing Clerk | Custom        | Parties, items, billing, receipts and reports. |
| Auditor       | Custom        | Read-only books, reports and people/roles.     |

`is_super` short-circuits permission checks. System roles cannot be renamed,
have permissions removed, or be deleted. Custom roles can be created, edited and
deleted when they have no members.

Permission codes live in `src/main/db/permissions.ts` and are grouped by their
domain prefix in the role editor (`voucher.cancel`, `user.manage`, and so on).
The catalog is read from the database, so a new code only needs to be added to
the canonical list and seeded.

## Permission gates

| Action                                            | Permission                 |
| ------------------------------------------------- | -------------------------- |
| List people                                       | `user.view`                |
| List roles                                        | `user.view` or `role.view` |
| List the permission catalog                       | `role.view`                |
| Create a person                                   | `user.create`              |
| Edit a person, change role/status, reset password | `user.manage`              |
| Create, edit or delete a role                     | `role.manage`              |

The UI hides controls the session cannot use, but every IPC handler reaches an
application function that calls `requirePermission` or `requireAnyPermission`.
A direct IPC call from the renderer is rejected with the typed
`PERMISSION_DENIED` error.

### Privilege escalation guards

A non-super actor:

- can only grant permission codes they already hold;
- cannot assign a role that is super or contains permissions they lack;
- cannot manage a person whose role is more powerful than their own;
- cannot reset a more powerful person's password;
- cannot edit a role that currently holds permissions they lack.

This prevents a people manager from creating an Owner account or granting
themselves a permission through a new role.

## Owner protection

- Owner and Admin are system roles and cannot be edited or deleted.
- Nobody can change their own role or disable their own account.
- A change that would leave no active super membership is rejected with
  "At least one active Owner or Admin must remain." The check counts other
  active memberships, so the last owner cannot be demoted or disabled.
- Role deletion is limited to custom roles with zero members. People must be
  moved first.

## Audit trail

Every access mutation appends to `audit_events`:

| Entity | Actions                                                          |
| ------ | ---------------------------------------------------------------- |
| `USER` | `CREATE`, `UPDATE`, `DEACTIVATE`, `REACTIVATE`, `PASSWORD_RESET` |
| `ROLE` | `CREATE`, `UPDATE`, `DELETE`                                     |

Entries record the actor, before/after JSON and timestamp. Password values and
hashes are never included.

Voucher detail now joins the actor names for `created_by`, `posted_by` and
`cancelled_by`, and returns the voucher's audit entries. The detail page shows
"Created … by", "Cancelled … by" and an **Audit trail** section. The cancel
button only renders when the session has `voucher.cancel`; the main process still
rejects a direct call without it.

## UI notes

- `Settings → Users and Roles` has **People** and **Roles** tabs.
- People shows name, email, role, status and joined date. Owners can add a
  person, edit their name/role/status, reset a password, deactivate or
  reactivate. A person cannot deactivate themselves from this screen.
- Roles shows access summary, member count and system/custom type. The role
  dialog groups permissions by domain, with select-all per group and disabled
  checkboxes for codes the actor cannot grant.
- The page explains the local-account model and owner protection in a short
  banner instead of leaving the rules implicit.

## Tests

- `tests/main/application/access.test.ts` covers owner reads, billing-clerk
  denial, role CRUD, system-role locks, member deletion guard, duplicate names,
  staff create/update/deactivate/reactivate, password reset without audit
  leakage, self-protection, last-owner protection, privilege-escalation guards
  and unknown permission codes.
- `tests/main/application/vouchers.test.ts` asserts created/cancelled actor
  names and the `POST`/`CANCEL` audit entries, and proves a Billing Clerk can
  post but cannot cancel.
- `tests/e2e/ux-refresh.spec.ts` creates a Billing Clerk through the UI, signs in
  as that clerk, checks that the Users and Roles navigation and cancel button are
  absent, and calls `vouchers.cancel` directly to confirm the main process
  rejects it.

## Deliberate limits

- No invitations, email delivery, PIN login, SSO or cloud sync.
- Role and permission changes are captured in the in-memory session at login.
  An already signed-in person keeps their old permission set until they sign in
  again. This avoids silently changing a live session mid-task.
- There is no separate "profile" screen. A person's name can be changed by a
  user manager; password changes use the reset flow.
- Accounts are not hard-deleted. Deactivation keeps history and audit rows
  explainable.
