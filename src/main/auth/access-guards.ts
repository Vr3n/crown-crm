import { requireSession } from './session'
import { ForbiddenError } from '../domain/errors'
import { PERMISSIONS } from '../db/permissions'
import type { Role } from '../domain/identity'

/**
 * Privilege-escalation guards. A non-super actor may only hand out permissions
 * they already hold, and may not manage a role that is more powerful than
 * their own. Super roles bypass these checks.
 */
export function assertCanGrantPermissions(
  codes: string[],
  deniedPermission:
    typeof PERMISSIONS.ROLE_MANAGE | typeof PERMISSIONS.USER_MANAGE = PERMISSIONS.ROLE_MANAGE
): void {
  const session = requireSession()
  if (session.isSuper) return
  if (codes.some((code) => !session.permissions.includes(code))) {
    throw new ForbiddenError(deniedPermission)
  }
}

export function assertCanManageRole(role: Role, currentCodes: string[]): void {
  const session = requireSession()
  if (session.isSuper) return
  if (role.isSuper) throw new ForbiddenError(PERMISSIONS.ROLE_MANAGE)
  assertCanGrantPermissions(currentCodes, PERMISSIONS.ROLE_MANAGE)
}

export function assertCanAssignRole(role: Role, currentCodes: string[]): void {
  const session = requireSession()
  if (session.isSuper) return
  if (role.isSuper) throw new ForbiddenError(PERMISSIONS.USER_MANAGE)
  assertCanGrantPermissions(currentCodes, PERMISSIONS.USER_MANAGE)
}
