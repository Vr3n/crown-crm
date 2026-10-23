import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../../helpers/db'
import {
  createStaffMember,
  login,
  logout,
  setupCompany
} from '../../../src/main/application/identity'
import {
  createRole,
  deleteRole,
  listPermissions,
  listRoles,
  listStaff,
  resetStaffPassword,
  updateRole,
  updateStaff
} from '../../../src/main/application/access'
import { getSession } from '../../../src/main/auth/session'
import { auditRepo } from '../../../src/main/repositories/audit'
import { staffRepo, userRepo } from '../../../src/main/repositories/identity'
import { ForbiddenError } from '../../../src/main/domain/errors'

setupTestDb()

const OWNER = {
  name: 'Acme Distributors',
  ownerFullName: 'Viren Patel',
  ownerEmail: 'owner@acme.in',
  ownerPassword: 'correct-horse',
  stateCode: '27',
  booksBeginDate: '2026-04-01'
}

function setUp(): void {
  setupCompany(OWNER)
}

function roleByName(name: string): ReturnType<typeof listRoles>[number] {
  const role = listRoles().find((candidate) => candidate.name === name)
  if (!role) throw new Error(`Missing role ${name}`)
  return role
}

function memberByEmail(email: string): ReturnType<typeof listStaff>[number] {
  const member = listStaff().find((candidate) => candidate.email === email)
  if (!member) throw new Error(`Missing user ${email}`)
  return member
}

describe('access reads', () => {
  it('lists people, roles and the permission catalog for an owner', () => {
    setUp()
    const staff = listStaff()
    expect(staff).toHaveLength(1)
    expect(staff[0]).toMatchObject({
      fullName: 'Viren Patel',
      email: 'owner@acme.in',
      roleName: 'Owner',
      isSuper: true,
      isSelf: true,
      status: 'ACTIVE'
    })

    const roles = listRoles()
    expect(roles.map((role) => role.name)).toEqual([
      'Owner',
      'Admin',
      'Accountant',
      'Billing Clerk',
      'Auditor'
    ])
    expect(roles.find((role) => role.name === 'Owner')).toMatchObject({
      isSystemRole: true,
      isSuper: true,
      memberCount: 1
    })
    expect(roles.find((role) => role.name === 'Billing Clerk')?.permissionCodes).toContain(
      'voucher.post'
    )

    const permissions = listPermissions()
    expect(permissions.length).toBeGreaterThan(25)
    expect(permissions.find((permission) => permission.code === 'voucher.cancel')).toMatchObject({
      domain: 'voucher'
    })
  })

  it('hides people and roles from a billing clerk without user.view', () => {
    setUp()
    createStaffMember({
      fullName: 'Asha Rao',
      email: 'asha@acme.in',
      password: 'billing-pass',
      roleName: 'Billing Clerk'
    })
    logout()
    login({ email: 'asha@acme.in', password: 'billing-pass' })

    expect(() => listStaff()).toThrow(ForbiddenError)
    expect(() => listRoles()).toThrow(ForbiddenError)
    expect(() => listPermissions()).toThrow(ForbiddenError)
  })
})

describe('roles', () => {
  it('creates, edits and deletes a custom role with an audit trail', () => {
    setUp()
    const created = createRole({
      name: 'Store Manager',
      description: 'Items, stock and purchase bills',
      permissionCodes: ['item.view', 'item.create', 'voucher.view']
    })
    expect(created).toMatchObject({
      name: 'Store Manager',
      isSystemRole: false,
      isSuper: false,
      memberCount: 0
    })
    expect(created.permissionCodes).toEqual(['item.create', 'item.view', 'voucher.view'])

    const updated = updateRole({
      id: created.id,
      name: 'Stock Manager',
      permissionCodes: ['item.view', 'item.edit', 'voucher.view']
    })
    expect(updated.name).toBe('Stock Manager')
    expect(updated.permissionCodes).toEqual(['item.edit', 'item.view', 'voucher.view'])

    const audit = auditRepo.list(getSession()!.companyId, 'ROLE', created.id)
    expect(audit.map((entry) => entry.action)).toEqual(['CREATE', 'UPDATE'])
    expect(audit[0]?.actorName).toBe('Viren Patel')

    deleteRole(created.id)
    expect(listRoles().some((role) => role.id === created.id)).toBe(false)
  })

  it('locks system roles and refuses to delete a role with members', () => {
    setUp()
    const ownerRole = roleByName('Owner')
    expect(() => updateRole({ id: ownerRole.id, name: 'Super Owner' })).toThrow(/system roles/i)
    expect(() => deleteRole(ownerRole.id)).toThrow(/system roles/i)

    const custom = createRole({
      name: 'Temporary',
      permissionCodes: ['party.view']
    })
    createStaffMember({
      fullName: 'Tara Shah',
      email: 'tara@acme.in',
      password: 'temporary-pass',
      roleId: custom.id
    })

    expect(() => deleteRole(custom.id)).toThrow(/still assigned/i)
    const billing = roleByName('Billing Clerk')
    const tara = memberByEmail('tara@acme.in')
    updateStaff({ id: tara.id, roleId: billing.id })
    deleteRole(custom.id)
    expect(listRoles().some((role) => role.id === custom.id)).toBe(false)
  })

  it('rejects duplicate role names case-insensitively', () => {
    setUp()
    createRole({ name: 'Store Manager', permissionCodes: [] })
    expect(() => createRole({ name: 'store manager', permissionCodes: [] })).toThrow(
      /already exists/i
    )
  })
})

describe('people', () => {
  it('creates a person by role id, changes their role and deactivates them', () => {
    setUp()
    const billing = roleByName('Billing Clerk')
    const created = createStaffMember({
      fullName: 'Asha Rao',
      email: 'asha@acme.in',
      password: 'billing-pass',
      roleId: billing.id
    })
    expect(created.userId).toBeGreaterThan(0)

    const member = memberByEmail('asha@acme.in')
    const accountant = roleByName('Accountant')
    const updated = updateStaff({ id: member.id, roleId: accountant.id })
    expect(updated.roleName).toBe('Accountant')

    const disabled = updateStaff({ id: member.id, status: 'DISABLED' })
    expect(disabled.status).toBe('DISABLED')
    logout()
    expect(() => login({ email: 'asha@acme.in', password: 'billing-pass' })).toThrow()

    login({ email: 'owner@acme.in', password: 'correct-horse' })
    updateStaff({ id: member.id, status: 'ACTIVE' })
    logout()
    expect(login({ email: 'asha@acme.in', password: 'billing-pass' }).userEmail).toBe(
      'asha@acme.in'
    )
  })

  it('resets a password without storing it in the audit trail', () => {
    setUp()
    createStaffMember({
      fullName: 'Asha Rao',
      email: 'asha@acme.in',
      password: 'billing-pass',
      roleName: 'Billing Clerk'
    })
    const member = memberByEmail('asha@acme.in')
    resetStaffPassword({ id: member.id, password: 'new-secret-pass' })

    const audit = auditRepo.list(getSession()!.companyId, 'USER', member.userId)
    const reset = audit.find((entry) => entry.action === 'PASSWORD_RESET')
    expect(reset?.actorName).toBe('Viren Patel')
    expect(JSON.stringify(reset)).not.toContain('new-secret-pass')
    expect(JSON.stringify(reset)).not.toContain('billing-pass')

    logout()
    expect(() => login({ email: 'asha@acme.in', password: 'billing-pass' })).toThrow()
    expect(login({ email: 'asha@acme.in', password: 'new-secret-pass' }).userEmail).toBe(
      'asha@acme.in'
    )
  })

  it('blocks changing your own role or disabling yourself', () => {
    setUp()
    const me = listStaff()[0]
    const accountant = roleByName('Accountant')
    expect(() => updateStaff({ id: me.id, roleId: accountant.id })).toThrow(/own role/i)
    expect(() => updateStaff({ id: me.id, status: 'DISABLED' })).toThrow(/own account/i)
  })

  it('keeps at least one active owner even from a stale super session', () => {
    setUp()
    const admin = roleByName('Admin')
    createStaffMember({
      fullName: 'Second Owner',
      email: 'second@acme.in',
      password: 'second-pass',
      roleId: admin.id
    })
    logout()
    login({ email: 'second@acme.in', password: 'second-pass' })
    const second = memberByEmail('second@acme.in')

    // Simulate the second owner being disabled elsewhere while their session is
    // still live, so the last-super guard is the only thing left protecting books.
    staffRepo.update(second.id, { status: 'DISABLED' })
    userRepo.update(second.userId, { status: 'DISABLED' })

    const owner = memberByEmail('owner@acme.in')
    const accountant = roleByName('Accountant')
    expect(() => updateStaff({ id: owner.id, roleId: accountant.id })).toThrow(
      /at least one active owner/i
    )
  })
})

describe('privilege escalation guards', () => {
  it('prevents a non-super role manager from granting permissions they lack', () => {
    setUp()
    const roleManager = createRole({
      name: 'Role Manager',
      permissionCodes: ['user.view', 'role.view', 'role.manage']
    })
    createStaffMember({
      fullName: 'Mia Sen',
      email: 'mia@acme.in',
      password: 'manager-pass',
      roleId: roleManager.id
    })
    logout()
    login({ email: 'mia@acme.in', password: 'manager-pass' })

    expect(() => createRole({ name: 'Escalated', permissionCodes: ['voucher.cancel'] })).toThrow(
      ForbiddenError
    )
    expect(() => listPermissions()).not.toThrow()
  })

  it('prevents a people manager from assigning a more powerful role', () => {
    setUp()
    const peopleManager = createRole({
      name: 'People Manager',
      permissionCodes: ['user.view', 'user.create', 'user.manage']
    })
    createStaffMember({
      fullName: 'Mia Sen',
      email: 'mia@acme.in',
      password: 'manager-pass',
      roleId: peopleManager.id
    })
    const accountant = roleByName('Accountant')
    createStaffMember({
      fullName: 'Existing Accountant',
      email: 'accounts@acme.in',
      password: 'account-pass',
      roleId: accountant.id
    })

    logout()
    login({ email: 'mia@acme.in', password: 'manager-pass' })

    expect(() =>
      createStaffMember({
        fullName: 'New Owner',
        email: 'new-owner@acme.in',
        password: 'owner-pass',
        roleName: 'Owner'
      })
    ).toThrow(ForbiddenError)

    expect(() =>
      createStaffMember({
        fullName: 'New Accountant',
        email: 'new-accountant@acme.in',
        password: 'account-pass',
        roleId: accountant.id
      })
    ).toThrow(ForbiddenError)

    const existing = memberByEmail('accounts@acme.in')
    expect(() => updateStaff({ id: existing.id, status: 'DISABLED' })).toThrow(ForbiddenError)
    expect(() => resetStaffPassword({ id: existing.id, password: 'another-pass' })).toThrow(
      ForbiddenError
    )

    const sameRole = createStaffMember({
      fullName: 'Another Manager',
      email: 'another@acme.in',
      password: 'manager-pass',
      roleId: peopleManager.id
    })
    expect(sameRole.userId).toBeGreaterThan(0)
  })

  it('rejects unknown permission codes', () => {
    setUp()
    expect(() =>
      createRole({ name: 'Bogus', permissionCodes: ['voucher.launch-rockets'] })
    ).toThrow(/not recognised/i)
  })
})
