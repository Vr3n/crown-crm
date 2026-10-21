import { describe, it, expect } from 'vitest'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import { resolveAttribution } from '../../../src/main/application/pdf'
import { getDb } from '../../../src/main/db/connection'
import { roleRepo, staffRepo, userRepo } from '../../../src/main/repositories/identity'

/**
 * Attribution resolver regression tests (Issue #111 review).
 * The name comes from the stamped User row unconditionally; only the
 * "(Role)" suffix depends on an ACTIVE staff membership.
 */
setupSalesDb()

describe('resolveAttribution', () => {
  it('resolves an active staffer as "Full Name (Role)"', () => {
    const { organizationId, userId } = seedOrgWithSession()
    expect(resolveAttribution(organizationId, userId)).toBe('Priya Verma (Owner)')
  })

  it('returns null when the User row itself is missing', () => {
    const { organizationId } = seedOrgWithSession()
    expect(resolveAttribution(organizationId, 99999)).toBeNull()
  })

  it('keeps the name without role once the staffer is deactivated', () => {
    const { organizationId, userId } = seedOrgWithSession()
    getDb()
      .prepare('UPDATE organization_staff SET status = ? WHERE organization_id = ? AND user_id = ?')
      .run('DISABLED', organizationId, userId)
    expect(resolveAttribution(organizationId, userId)).toBe('Priya Verma')
  })

  it('keeps the name without role once the membership row is removed', () => {
    const { organizationId, userId } = seedOrgWithSession()
    getDb()
      .prepare('DELETE FROM organization_staff WHERE organization_id = ? AND user_id = ?')
      .run(organizationId, userId)
    expect(resolveAttribution(organizationId, userId)).toBe('Priya Verma')
  })

  it('resolves a non-owner role suffix from the active membership', () => {
    const { organizationId } = seedOrgWithSession()
    const role = roleRepo.findByName(organizationId, 'Manager')!
    const user = userRepo.create({
      fullName: 'Ravi Menon',
      email: 'ravi@fitgym.com',
      passwordHash: 'hash'
    })
    staffRepo.create({ organizationId, userId: user.id, roleId: role.id })
    expect(resolveAttribution(organizationId, user.id)).toBe('Ravi Menon (Manager)')
  })
})
