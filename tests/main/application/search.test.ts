import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../../helpers/db'
import { setupCompany, createStaffMember, login, logout } from '../../../src/main/application/identity'
import { masters } from '../../../src/main/application/masters'
import { search } from '../../../src/main/application/search'
import { getDrizzle } from '../../../src/main/db/connection'
import { vouchers } from '../../../src/main/db/schema'

setupTestDb()

const OWNER = {
  name: 'Acme Distributors',
  ownerFullName: 'Viren Patel',
  ownerEmail: 'owner@acme.in',
  ownerPassword: 'correct-horse',
  stateCode: '27',
  booksBeginDate: '2026-04-01'
}

function seedSearchableRows(): { partyId: number; itemId: number; voucherId: number } {
  setupCompany(OWNER)
  const party = masters.createParty({
    name: 'Acme Traders',
    phone: '9876543210',
    isCustomer: true,
    isSupplier: false
  })
  const item = masters.createItem({
    name: 'Steel Bracket',
    sku: 'SB-100',
    hsnSac: '7308',
    gstRateBps: 1800,
    isService: false
  })
  const voucher = getDrizzle()
    .insert(vouchers)
    .values({
      company_id: 1,
      voucher_type: 'SALES',
      series: 'INV',
      number: 'INV-0001',
      fy: '2026-27',
      voucher_date: '2026-10-23',
      party_id: party.id,
      narration: 'First sale',
      status: 'POSTED',
      total_minor: 118000
    })
    .returning({ id: vouchers.id })
    .get()
  return { partyId: party.id, itemId: item.id, voucherId: voucher.id }
}

describe('global search', () => {
  it('finds parties, items, posted vouchers and accounts', () => {
    const { partyId, itemId, voucherId } = seedSearchableRows()

    const parties = search({ query: 'acme' })
    expect(parties.groups.find((group) => group.kind === 'PARTY')?.items[0]).toMatchObject({
      id: partyId,
      title: 'Acme Traders'
    })

    const items = search({ query: 'sb-100' })
    expect(items.groups.find((group) => group.kind === 'ITEM')?.items[0]).toMatchObject({
      id: itemId,
      title: 'Steel Bracket'
    })

    const vouchersResult = search({ query: 'INV-0001' })
    expect(vouchersResult.groups.find((group) => group.kind === 'VOUCHER')?.items[0]).toMatchObject({
      id: voucherId,
      title: 'INV-0001',
      subtitle: 'SALES · Acme Traders'
    })

    const accounts = search({ query: 'cash' })
    expect(accounts.groups.find((group) => group.kind === 'ACCOUNT')?.items.length).toBeGreaterThan(0)
  })

  it('hides inactive masters and non-posted vouchers', () => {
    const { partyId, itemId } = seedSearchableRows()
    getDrizzle()
      .insert(vouchers)
      .values({
        company_id: 1,
        voucher_type: 'SALES',
        series: 'INV',
        number: 'DRAFT-0002',
        fy: '2026-27',
        voucher_date: '2026-10-23',
        status: 'DRAFT'
      })
      .run()

    masters.deactivateParty(partyId)
    masters.deactivateItem(itemId)

    expect(search({ query: '9876543210' }).total).toBe(0)
    expect(search({ query: 'Steel Bracket' }).total).toBe(0)
    expect(search({ query: 'DRAFT-0002' }).total).toBe(0)
  })

  it('only returns families the signed-in role may view', () => {
    seedSearchableRows()
    createStaffMember({
      fullName: 'Asha Rao',
      email: 'asha@acme.in',
      password: 'billing-pass',
      roleName: 'Billing Clerk'
    })
    logout()
    login({ email: 'asha@acme.in', password: 'billing-pass' })

    const result = search({ query: 'acme' })
    expect(result.groups.map((group) => group.kind)).not.toContain('ACCOUNT')
    expect(result.groups.map((group) => group.kind)).toEqual(
      expect.arrayContaining(['PARTY', 'VOUCHER'])
    )
  })

  it('keeps every group capped for a fast palette', () => {
    setupCompany(OWNER)
    for (let index = 0; index < 8; index += 1) {
      masters.createParty({
        name: `Acme Party ${index}`,
        isCustomer: true,
        isSupplier: false
      })
    }

    const result = search({ query: 'Acme Party' })
    expect(result.groups.find((group) => group.kind === 'PARTY')?.items).toHaveLength(5)
    expect(result.groups.every((group) => group.items.length <= 5)).toBe(true)
    expect(result.total).toBe(10)
  })

  it('requires an authenticated session', () => {
    setupCompany(OWNER)
    logout()
    expect(() => search({ query: 'acme' })).toThrow()
  })
})
