import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../../helpers/db'
import { setupCompany } from '../../../src/main/application/identity'
import { masters } from '../../../src/main/application/masters'
import { getSession, setSession } from '../../../src/main/auth/session'
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

describe('units', () => {
  it('lists the seeded units with usage counts and active state', () => {
    setUp()
    const units = masters.listUnits({ includeInactive: false })

    expect(units).toHaveLength(11)
    expect(units.every((unit) => unit.isSystem)).toBe(true)
    expect(units.every((unit) => unit.isActive)).toBe(true)
    expect(units.find((unit) => unit.name === 'Kg')).toMatchObject({
      symbol: 'kg',
      decimals: 3,
      usageCount: 0
    })
  })

  it('creates, renames and retires an unused custom unit', () => {
    setUp()
    const created = masters.createUnit({ name: 'Dozen', symbol: 'dz', decimals: 0 })
    expect(created).toMatchObject({ name: 'Dozen', symbol: 'dz', isActive: true })

    const renamed = masters.updateUnit({
      id: created.id,
      name: 'Dozen pack',
      symbol: 'dz',
      decimals: 0
    })
    expect(renamed.name).toBe('Dozen pack')

    const retired = masters.deactivateUnit(created.id)
    expect(retired.isActive).toBe(false)
    expect(masters.listUnits({ includeInactive: false }).some((unit) => unit.id === created.id)).toBe(
      false
    )
    expect(masters.listUnits({ includeInactive: true }).some((unit) => unit.id === created.id)).toBe(
      true
    )

    const reactivated = masters.updateUnit({ id: created.id, isActive: true })
    expect(reactivated.isActive).toBe(true)
  })

  it('rejects duplicate names or symbols, case-insensitively', () => {
    setUp()
    expect(() => masters.createUnit({ name: 'kg', symbol: 'KG', decimals: 3 })).toThrow(
      /already uses/
    )

    const custom = masters.createUnit({ name: 'Dozen', symbol: 'dz', decimals: 0 })
    expect(() =>
      masters.updateUnit({ id: custom.id, name: 'Box', symbol: 'box', decimals: 0 })
    ).toThrow(/already uses/)
  })

  it('will not retire a unit while an item still points at it', () => {
    setUp()
    const kg = masters.listUnits({ includeInactive: false }).find((unit) => unit.name === 'Kg')
    expect(kg).toBeDefined()

    masters.createItem({
      name: 'Sugar',
      uomId: kg?.id,
      gstRateBps: 500,
      isService: false
    })

    const withUsage = masters
      .listUnits({ includeInactive: false })
      .find((unit) => unit.id === kg?.id)
    expect(withUsage?.usageCount).toBe(1)
    expect(() => masters.deactivateUnit(kg!.id)).toThrow(/used by 1 item/)
  })
})

describe('tax rates', () => {
  it('starts with the GST 2.0 slabs and filters to the requested business date', () => {
    setUp()
    const current = masters.listTaxRates({ includeHistory: false, asOf: '2026-10-23' })
    expect(current.map((rate) => rate.gstRateBps).sort((a, b) => a - b)).toEqual([
      0, 500, 1800, 4000
    ])
    expect(current.every((rate) => rate.isCurrent)).toBe(true)
    expect(current.every((rate) => rate.effectiveTo === null)).toBe(true)
  })

  it('rejects an overlapping row for the same GST and cess combination', () => {
    setUp()
    masters.createTaxRate({
      gstRateBps: 2500,
      cessRateBps: 0,
      description: 'Special',
      effectiveFrom: '2026-11-01'
    })

    expect(() =>
      masters.createTaxRate({
        gstRateBps: 2500,
        cessRateBps: 0,
        effectiveFrom: '2026-12-01'
      })
    ).toThrow(/already runs from 2026-11-01/)
  })

  it('revises a rate by closing the old row and appending a new one', () => {
    setUp()
    const created = masters.createTaxRate({
      gstRateBps: 2500,
      cessRateBps: 0,
      description: 'Special',
      effectiveFrom: '2026-11-01'
    })

    const revised = masters.reviseTaxRate({
      id: created.id,
      gstRateBps: 3000,
      cessRateBps: 0,
      description: 'Special revised',
      effectiveFrom: '2026-12-01'
    })

    const history = masters.listTaxRates({
      includeHistory: true,
      asOf: '2026-12-15'
    })
    const old = history.find((rate) => rate.id === created.id)
    expect(old).toMatchObject({
      effectiveFrom: '2026-11-01',
      effectiveTo: '2026-11-30',
      isCurrent: false
    })

    const next = history.find((rate) => rate.id === revised.id)
    expect(next).toMatchObject({
      gstRateBps: 3000,
      effectiveFrom: '2026-12-01',
      effectiveTo: null,
      isCurrent: true
    })

    expect(() =>
      masters.reviseTaxRate({
        id: revised.id,
        gstRateBps: 3100,
        cessRateBps: 0,
        effectiveFrom: '2026-12-01'
      })
    ).toThrow(/must start after 2026-12-01/)
  })

  it('retires a rate on a chosen date without deleting its history', () => {
    setUp()
    const created = masters.createTaxRate({
      gstRateBps: 2500,
      cessRateBps: 0,
      effectiveFrom: '2026-11-01'
    })

    expect(() =>
      masters.retireTaxRate({ id: created.id, effectiveFrom: '2026-11-01' })
    ).toThrow(/end date must be after/)

    const retired = masters.retireTaxRate({
      id: created.id,
      effectiveFrom: '2027-01-01'
    })
    expect(retired.effectiveTo).toBe('2026-12-31')

    const history = masters.listTaxRates({
      includeHistory: true,
      asOf: '2027-01-15'
    })
    expect(history.find((rate) => rate.id === created.id)).toMatchObject({
      effectiveTo: '2026-12-31',
      isCurrent: false
    })
  })

  it('gates writes on settings.manage while allowing item viewers to read', () => {
    setUp()
    const owner = getSession()
    expect(owner).not.toBeNull()
    setSession({ ...owner!, isSuper: false, permissions: ['item.view'] })

    expect(() => masters.listUnits({ includeInactive: false })).not.toThrow()
    expect(() => masters.listTaxRates({ includeHistory: false })).not.toThrow()
    expect(() => masters.createUnit({ name: 'Dozen', symbol: 'dz', decimals: 0 })).toThrow(
      ForbiddenError
    )
    expect(() =>
      masters.createTaxRate({
        gstRateBps: 1200,
        cessRateBps: 0,
        effectiveFrom: '2026-11-01'
      })
    ).toThrow(ForbiddenError)

    setSession(owner)
  })
})
