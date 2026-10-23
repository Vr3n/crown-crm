import { describe, expect, it } from 'vitest'
import { setupTestDb } from '../../helpers/db'
import { setupCompany } from '../../../src/main/application/identity'
import { updateNumbering } from '../../../src/main/application/numbering'
import { dashboardRepo } from '../../../src/main/repositories/dashboard'
import { partyRepo, itemRepo } from '../../../src/main/repositories/masters'
import { postVoucher } from '../../../src/main/application/vouchers'

setupTestDb()

function company(): number {
  return setupCompany({
    name: 'Acme Distributors',
    ownerFullName: 'Owner',
    ownerEmail: 'owner@acme.in',
    ownerPassword: 'correct-horse',
    stateCode: '27',
    booksBeginDate: '2026-04-01'
  }).companyId
}

function seedMasters(companyId: number): { supplier: number; customer: number; item: number } {
  const supplier = partyRepo.create(
    companyId,
    {
      name: 'TechConnect',
      phone: null,
      email: null,
      gstin: null,
      stateCode: null,
      billingAddress: null,
      isCustomer: false,
      isSupplier: true,
      creditDays: 30,
      creditLimitMinor: 0,
      openingBalanceMinor: 0,
      openingBalanceDate: null,
      notes: null
    },
    null
  ).id

  const customer = partyRepo.create(
    companyId,
    {
      name: 'Sharma Traders',
      phone: null,
      email: null,
      gstin: null,
      stateCode: null,
      billingAddress: null,
      isCustomer: true,
      isSupplier: false,
      creditDays: 15,
      creditLimitMinor: 0,
      openingBalanceMinor: 0,
      openingBalanceDate: null,
      notes: null
    },
    null
  ).id

  const item = itemRepo.create(
    companyId,
    {
      name: 'SSD 256GB',
      sku: null,
      hsnSac: '8523',
      uomId: null,
      gstRateBps: 1800,
      isService: false,
      salePriceMinor: 500000,
      purchasePriceMinor: 300000,
      openingQtyE4: 0,
      openingRateMinor: 0,
      reorderLevelE4: 0
    },
    null
  ).id

  return { supplier, customer, item }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

describe('dashboard read model', () => {
  it('starts with only the numbering step outstanding', () => {
    const companyId = company()
    const summary = dashboardRepo.summary(companyId)

    expect(summary.setup.total).toBe(6)
    expect(summary.setup.done).toBe(0)
    expect(summary.setup.steps.find((step) => step.id === 'numbering')?.done).toBe(false)
    expect(summary.recentVouchers).toEqual([])
    expect(summary.monthly).toHaveLength(6)
    expect(summary.monthly.every((month) => month.salesMinor === 0)).toBe(true)
  })

  it('reflects masters, numbering and posted vouchers', () => {
    const companyId = company()
    const { supplier, customer, item } = seedMasters(companyId)

    updateNumbering({
      requestId: 'req-numbering',
      items: [
        {
          voucherType: 'PURCHASE',
          series: 'PUR',
          prefix: 'PUR/',
          suffix: '',
          padding: 4,
          startNumber: 1,
          restartYearly: true,
          manualOverride: false
        }
      ]
    })

    const purchase = postVoucher({
      requestId: 'req-purchase',
      type: 'PURCHASE',
      date: today(),
      dueDate: daysAgo(5),
      partyId: supplier,
      lines: [
        {
          itemId: item,
          description: 'SSD 256GB',
          qtyE4: 10_000,
          rateMinor: 300000,
          rateIncludesTax: false,
          discountBps: 0,
          gstRateBps: 1800
        }
      ]
    })

    postVoucher({
      requestId: 'req-sale',
      type: 'SALES',
      date: today(),
      dueDate: daysAgo(10),
      partyId: customer,
      lines: [
        {
          itemId: item,
          description: 'SSD 256GB',
          qtyE4: 10_000,
          rateMinor: 500000,
          rateIncludesTax: false,
          discountBps: 0,
          gstRateBps: 1800
        }
      ]
    })

    const summary = dashboardRepo.summary(companyId)

    expect(summary.setup.done).toBe(5)
    expect(summary.setup.steps.find((step) => step.id === 'numbering')?.done).toBe(true)
    expect(summary.setup.steps.find((step) => step.id === 'parties')?.done).toBe(true)
    expect(summary.setup.steps.find((step) => step.id === 'items')?.done).toBe(true)
    expect(summary.setup.steps.find((step) => step.id === 'purchase')?.done).toBe(true)
    expect(summary.setup.steps.find((step) => step.id === 'sale')?.done).toBe(true)
    expect(summary.setup.steps.find((step) => step.id === 'opening')?.done).toBe(false)

    expect(summary.recentVouchers).toHaveLength(2)
    expect(summary.recentVouchers[0].type).toBe('SALES')

    const month = today().slice(0, 7)
    const current = summary.monthly.find((row) => row.month === month)
    expect(current?.salesMinor).toBeGreaterThan(0)
    expect(current?.purchasesMinor).toBeGreaterThan(0)

    const overdue = summary.ageing.find((bucket) => bucket.bucket === '1-30')
    expect(overdue?.receivableMinor).toBeGreaterThan(0)
    expect(overdue?.payableMinor).toBeGreaterThan(0)

    expect(summary.attention[0].id).toBe('overdue')
    expect(purchase.number).toBe('PUR/0001')
  })
})
