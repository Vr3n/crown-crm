import { hashPassword } from '../auth/password'
import {
  assertCanAssignRole,
  assertCanGrantPermissions,
  assertCanManageRole
} from '../auth/access-guards'
import {
  currentCompanyId,
  getSession,
  requireAnyPermission,
  requirePermission,
  requireSession,
  setSession
} from '../auth/session'
import { withTransaction } from '../db/connection'
import { PERMISSIONS } from '../db/permissions'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors'
import { auditRepo } from '../repositories/audit'
import { permissionRepo, roleRepo, staffRepo, userRepo } from '../repositories/identity'
import type { Role } from '../domain/identity'
import type {
  CreateRoleInput,
  PermissionOutput,
  ResetStaffPasswordInput,
  RoleOutput,
  StaffMemberOutput,
  UpdateRoleInput,
  UpdateStaffInput
} from '../../shared/contracts/access'

function humanizePermission(code: string): string {
  return code
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function roleOutput(companyId: number, role: Role): RoleOutput {
  const permissionCodes = (
    role.isSuper
      ? permissionRepo.list().map((permission) => permission.code)
      : roleRepo.findPermissionCodes(role.id)
  ).sort()
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystemRole: role.isSystemRole,
    isSuper: role.isSuper,
    permissionCodes,
    memberCount: roleRepo.memberCount(companyId, role.id)
  }
}

function validatePermissionCodes(codes: string[]): string[] {
  const unique = [...new Set(codes.map((code) => code.trim()).filter(Boolean))]
  const found = permissionRepo.findCodes(unique)
  if (found.length !== unique.length) {
    throw new ValidationError('One or more selected permissions are not recognised')
  }
  return unique.sort()
}

function normalizeRoleName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length < 2) throw new ValidationError('Role name must be at least 2 characters')
  return name
}

function assertCanManageStaff(target: { role: Role }): void {
  const actor = requireSession()
  if (actor.isSuper) return
  if (target.role.isSuper) throw new ForbiddenError(PERMISSIONS.USER_MANAGE)
  const codes = roleRepo.findPermissionCodes(target.role.id)
  if (codes.some((code) => !actor.permissions.includes(code))) {
    throw new ForbiddenError(PERMISSIONS.USER_MANAGE)
  }
}

/** Staff list with role and status, gated by `user.view`. */
export function listStaff(): StaffMemberOutput[] {
  requirePermission(PERMISSIONS.USER_VIEW)
  const actor = getSession()
  return staffRepo.listForCompany(currentCompanyId()).map((row) => ({
    ...row,
    status: row.status,
    isSelf: row.userId === actor?.userId
  }))
}

/** Role list. A user manager needs roles for assignment even without `role.view`. */
export function listRoles(): RoleOutput[] {
  requireAnyPermission([PERMISSIONS.USER_VIEW, PERMISSIONS.ROLE_VIEW])
  const companyId = currentCompanyId()
  return roleRepo.listByCompany(companyId).map((role) => roleOutput(companyId, role))
}

/** Permission catalog used by the role editor. */
export function listPermissions(): PermissionOutput[] {
  requirePermission(PERMISSIONS.ROLE_VIEW)
  return permissionRepo.list().map((permission) => ({
    code: permission.code,
    description: permission.description ?? humanizePermission(permission.code),
    domain: permission.code.split('.')[0] ?? 'other'
  }))
}

export function createRole(input: CreateRoleInput): RoleOutput {
  requirePermission(PERMISSIONS.ROLE_MANAGE)
  const actor = requireSession()
  const companyId = currentCompanyId()
  const name = normalizeRoleName(input.name)
  if (roleRepo.findByNameInsensitive(companyId, name)) {
    throw new ValidationError(`A role named "${name}" already exists`)
  }
  const permissionCodes = validatePermissionCodes(input.permissionCodes)
  assertCanGrantPermissions(permissionCodes, PERMISSIONS.ROLE_MANAGE)
  const description = input.description?.trim() || null

  return withTransaction(() => {
    const role = roleRepo.create(companyId, { name, description })
    roleRepo.setPermissions(role.id, permissionCodes)
    auditRepo.record({
      companyId,
      entity: 'ROLE',
      entityId: role.id,
      action: 'CREATE',
      after: { name, description, permissionCodes },
      actorUserId: actor.userId
    })
    return roleOutput(companyId, role)
  })
}

export function updateRole(input: UpdateRoleInput): RoleOutput {
  requirePermission(PERMISSIONS.ROLE_MANAGE)
  const actor = requireSession()
  const companyId = currentCompanyId()
  const role = roleRepo.findById(companyId, input.id)
  if (!role) throw new NotFoundError('Role not found')
  if (role.isSystemRole) {
    throw new ValidationError('Owner and Admin are locked system roles and cannot be edited')
  }

  const currentCodes = roleRepo.findPermissionCodes(role.id)
  assertCanManageRole(role, currentCodes)

  const name = input.name === undefined ? role.name : normalizeRoleName(input.name)
  if (roleRepo.findByNameInsensitive(companyId, name, role.id)) {
    throw new ValidationError(`A role named "${name}" already exists`)
  }
  const description =
    input.description === undefined ? role.description : input.description?.trim() || null
  const permissionCodes =
    input.permissionCodes === undefined ? undefined : validatePermissionCodes(input.permissionCodes)
  if (permissionCodes) {
    assertCanGrantPermissions(permissionCodes, PERMISSIONS.ROLE_MANAGE)
  }

  return withTransaction(() => {
    const updated = roleRepo.update(companyId, role.id, { name, description })
    if (!updated) throw new NotFoundError('Role not found')
    if (permissionCodes) roleRepo.setPermissions(role.id, permissionCodes)
    auditRepo.record({
      companyId,
      entity: 'ROLE',
      entityId: role.id,
      action: 'UPDATE',
      before: { name: role.name, description: role.description, permissionCodes: currentCodes },
      after: {
        name,
        description,
        permissionCodes: permissionCodes ?? currentCodes
      },
      actorUserId: actor.userId
    })
    return roleOutput(companyId, updated)
  })
}

export function deleteRole(id: number): void {
  requirePermission(PERMISSIONS.ROLE_MANAGE)
  const actor = requireSession()
  const companyId = currentCompanyId()
  const role = roleRepo.findById(companyId, id)
  if (!role) throw new NotFoundError('Role not found')
  if (role.isSystemRole) {
    throw new ValidationError('Owner and Admin are locked system roles and cannot be deleted')
  }
  const currentCodes = roleRepo.findPermissionCodes(role.id)
  assertCanManageRole(role, currentCodes)

  const members = roleRepo.memberCount(companyId, role.id)
  if (members > 0) {
    throw new ConflictError(
      `This role is still assigned to ${members} ${members === 1 ? 'person' : 'people'}. Move them to another role first.`
    )
  }

  withTransaction(() => {
    roleRepo.delete(companyId, role.id)
    auditRepo.record({
      companyId,
      entity: 'ROLE',
      entityId: role.id,
      action: 'DELETE',
      before: { name: role.name, description: role.description, permissionCodes: currentCodes },
      actorUserId: actor.userId
    })
  })
}

export function updateStaff(input: UpdateStaffInput): StaffMemberOutput {
  requirePermission(PERMISSIONS.USER_MANAGE)
  const actor = requireSession()
  const companyId = currentCompanyId()
  const target = staffRepo.findForCompany(companyId, input.id)
  if (!target) throw new NotFoundError('User not found')
  assertCanManageStaff(target)

  const isSelf = target.user.id === actor.userId
  if (isSelf && input.roleId !== undefined && input.roleId !== target.role.id) {
    throw new ValidationError('You cannot change your own role')
  }
  if (isSelf && input.status === 'DISABLED') {
    throw new ValidationError('You cannot disable your own account')
  }

  const fullName = input.fullName === undefined ? target.user.fullName : input.fullName.trim()
  if (!fullName) throw new ValidationError('Full name is required')

  let nextRole: Role | null = null
  if (input.roleId !== undefined) {
    nextRole = roleRepo.findById(companyId, input.roleId)
    if (!nextRole) throw new NotFoundError('Role not found')
    const nextCodes = nextRole.isSuper
      ? permissionRepo.list().map((p) => p.code)
      : roleRepo.findPermissionCodes(nextRole.id)
    assertCanAssignRole(nextRole, nextCodes)
  }

  const losingSuper =
    target.role.isSuper && (input.status === 'DISABLED' || (nextRole !== null && !nextRole.isSuper))
  if (losingSuper && staffRepo.countActiveSupers(companyId, target.staff.id) === 0) {
    throw new ValidationError('At least one active Owner or Admin must remain')
  }

  return withTransaction(() => {
    if (input.fullName !== undefined) {
      userRepo.update(target.user.id, { fullName })
    }
    if (input.status !== undefined) {
      userRepo.update(target.user.id, { status: input.status })
    }
    if (input.roleId !== undefined || input.status !== undefined) {
      staffRepo.update(target.staff.id, {
        roleId: input.roleId,
        status: input.status
      })
    }

    auditRepo.record({
      companyId,
      entity: 'USER',
      entityId: target.user.id,
      action:
        input.status === 'DISABLED'
          ? 'DEACTIVATE'
          : input.status === 'ACTIVE'
            ? 'REACTIVATE'
            : 'UPDATE',
      before: {
        fullName: target.user.fullName,
        roleId: target.role.id,
        status: target.staff.status
      },
      after: {
        fullName,
        roleId: input.roleId ?? target.role.id,
        status: input.status ?? target.staff.status
      },
      actorUserId: actor.userId
    })

    if (isSelf && input.fullName !== undefined) {
      setSession({ ...actor, userFullName: fullName })
    }

    const refreshed = staffRepo.listForCompany(companyId).find((row) => row.id === target.staff.id)
    if (!refreshed) throw new NotFoundError('User not found')
    return { ...refreshed, isSelf }
  })
}

export function resetStaffPassword(input: ResetStaffPasswordInput): void {
  requirePermission(PERMISSIONS.USER_MANAGE)
  const actor = requireSession()
  const companyId = currentCompanyId()
  const target = staffRepo.findForCompany(companyId, input.id)
  if (!target) throw new NotFoundError('User not found')
  assertCanManageStaff(target)
  if (input.password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters')
  }

  withTransaction(() => {
    userRepo.update(target.user.id, { passwordHash: hashPassword(input.password) })
    auditRepo.record({
      companyId,
      entity: 'USER',
      entityId: target.user.id,
      action: 'PASSWORD_RESET',
      after: { userId: target.user.id },
      actorUserId: actor.userId
    })
  })
}
