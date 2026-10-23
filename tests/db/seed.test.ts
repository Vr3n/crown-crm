import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { setupTestDb } from '../helpers/db'
import { getDrizzle } from '../../src/main/db/connection'
import { seedCompanyDefaults, seedRolesForCompany, SEED_ROLES } from '../../src/main/db/seed'
import { companyRepo } from '../../src/main/repositories/identity'
import {
  accounts,
  accountGroups,
  paymentMethods,
  roles,
  taxRates,
  units,
  godowns
} from '../../src/main/db/schema'

setupTestDb()

function makeCompany(): number {
  const company = companyRepo.create({
    slug: 'acme',
    name: 'Acme Distributors',
    stateCode: '27',
    booksBeginDate: '2026-04-01'
  })
  seedRolesForCompany(company.id)
  seedCompanyDefaults(company.id, '2026-04-01')
  return company.id
}

describe('seedCompanyDefaults', () => {
  it('creates the chart of accounts with reserved system keys', () => {
    const companyId = makeCompany()
    const db = getDrizzle()

    const groups = db
      .select()
      .from(accountGroups)
      .where(eq(accountGroups.company_id, companyId))
      .all()
    expect(groups).toHaveLength(19)

    const rows = db.select().from(accounts).where(eq(accounts.company_id, companyId)).all()
    const keys = rows.map((r) => r.system_key).filter(Boolean)
    expect(keys).toEqual(
      expect.arrayContaining([
        'CASH',
        'BANK',
        'SALES',
        'PURCHASES',
        'OUTPUT_CGST',
        'OUTPUT_SGST',
        'OUTPUT_IGST',
        'INPUT_CGST',
        'INPUT_SGST',
        'INPUT_IGST',
        'ROUND_OFF',
        'COGS',
        'INVENTORY',
        'OPENING_DIFF'
      ])
    )
    expect(rows.every((r) => r.type.length > 0)).toBe(true)
  })

  it('creates units, tax rates, payment methods and one godown', () => {
    const companyId = makeCompany()
    const db = getDrizzle()

    expect(db.select().from(units).where(eq(units.company_id, companyId)).all()).toHaveLength(11)
    expect(db.select().from(taxRates).where(eq(taxRates.company_id, companyId)).all()).toHaveLength(
      4
    )
    expect(
      db.select().from(paymentMethods).where(eq(paymentMethods.company_id, companyId)).all()
    ).toHaveLength(7)
    const stores = db.select().from(godowns).where(eq(godowns.company_id, companyId)).all()
    expect(stores.map((s) => s.name)).toEqual(['Main Location'])
  })

  it('stores GST rates as basis points', () => {
    const companyId = makeCompany()
    const rows = getDrizzle()
      .select()
      .from(taxRates)
      .where(eq(taxRates.company_id, companyId))
      .all()
    expect(rows.map((r) => r.gst_rate_bps).sort((a, b) => a - b)).toEqual([0, 500, 1800, 4000])
  })

  it('is idempotent', () => {
    const companyId = makeCompany()
    const before = getDrizzle()
      .select()
      .from(accounts)
      .where(eq(accounts.company_id, companyId))
      .all()
    seedCompanyDefaults(companyId, '2026-04-01')
    const after = getDrizzle()
      .select()
      .from(accounts)
      .where(eq(accounts.company_id, companyId))
      .all()
    expect(after).toHaveLength(before.length)
  })
})

describe('seedRolesForCompany', () => {
  it('creates the five starter roles with the Owner as super', () => {
    const companyId = makeCompany()
    const rows = getDrizzle().select().from(roles).where(eq(roles.company_id, companyId)).all()
    expect(rows.map((r) => r.name).sort()).toEqual(SEED_ROLES.map((r) => r.name).sort())
    expect(rows.find((r) => r.name === 'Owner')?.is_super).toBe(true)
    expect(rows.find((r) => r.name === 'Auditor')?.is_super).toBe(false)
  })

  it('is idempotent', () => {
    const companyId = makeCompany()
    seedRolesForCompany(companyId)
    const rows = getDrizzle().select().from(roles).where(eq(roles.company_id, companyId)).all()
    expect(rows).toHaveLength(5)
  })
})
