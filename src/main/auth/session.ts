import { SessionContext } from '../../shared/contracts/identity'
import { ForbiddenError, UnauthenticatedError } from '../domain/errors'
import { PermissionCode } from '../db/permissions'

let currentSession: SessionContext | null = null

export function setSession(session: SessionContext | null): void {
  currentSession = session
}

export function getSession(): SessionContext | null {
  return currentSession
}

export function requireSession(): SessionContext {
  if (!currentSession) {
    throw new UnauthenticatedError()
  }
  return currentSession
}

/**
 * The enforcement point (Module 06 / Module 15). Every Command handler calls this
 * with the permission code it needs. Super roles short-circuit the check. Code
 * checks Permissions, never role names.
 */
export function requirePermission(code: PermissionCode): void {
  const session = requireSession()
  if (session.isSuper) return
  if (!session.permissions.includes(code)) {
    throw new ForbiddenError(code)
  }
}

/** The active organization id, for stamping onto org-scoped records. */
export function currentOrganizationId(): number {
  return requireSession().organizationId
}
