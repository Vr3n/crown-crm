import { describe, expect, it } from 'vitest'
import { setupTestDb } from '../../helpers/db'
import { setupCompany } from '../../../src/main/application/identity'
import { summaryRepo } from '../../../src/main/repositories/summaries'
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

function party(companyId: number, name: string, customer: boolean, supplier: boolean): number {
  return partyRepo.create(
    companyId,
    {
      name,
      phone: null,
      email: null,
      gstin: null,
      stateCode: null,
      billingAddress: null,
      isCustomer: customer,
      isSupplier: supplier,
      creditDays: 30,
      creditLimitMinor: 0,
      openingBalanceMinor: 0,
      openingBalanceDate: null,
      notes: null
    },
    null
  ).id
}

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

describe('party summary', () => {
  it('counts, totals, overdue and top balances', () => {
    const companyId = company()
    const customer = party(companyId, 'Sharma Traders', true, false)
    const supplier = party(companyId, 'TechConnect', false, true)
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

    postVoucher({
      requestId: 'req-pur',
      type: 'PURCHASE',
      date: today(),
      dueDate: daysAgo(10),
      partyId: supplier,
      lines: [
        {
          itemId: item,
          description: 'SSD',
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
      dueDate: daysAgo(15),
      partyId: customer,
      lines: [
        {
          itemId: item,
          description: 'SSD',
          qtyE4: 1_000,
          rateMinor: 500000,
          rateIncludesTax: false,
          discountBps: 0,
          gstRateBps: 1800
        }
      ]
    })

    const summary = summaryRepo.parties(companyId)

    expect(summary.customerCount).toBe(1)
    expect(summary.supplierCount).toBe(1)
    expect(summary.receivableMinor).toBeGreaterThan(0)
    expect(summary.payableMinor).toBeGreaterThan(0)
    expect(summary.overdueReceivableMinor).toBeGreaterThan(0)
    expect(summary.overduePayableMinor).toBeGreaterThan(0)
    expect(summary.topReceivables[0]?.name).toBe('Sharma Traders')
    expect(summary.topPayables[0]?.name).toBe('TechConnect')

    const bucketTotal = summary.ageing.reduce((sum, row) => sum + row.receivableMinor, 0)
    expect(bucketTotal).toBe(summary.receivableMinor)
  })
})

describe('voucher summary', () => {
  it('totals a period and splits by type and party', () => {
    const companyId = company()
    const customer = party(companyId, 'Sharma Traders', true, false)
    const supplier = party(companyId, 'TechConnect', false, true)
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

    postVoucher({
      requestId: 'req-vc-pur',
      type: 'PURCHASE',
      date: today(),
      dueDate: today(),
      partyId: supplier,
      lines: [
        {
          itemId: item,
          description: 'SSD',
          qtyE4: 10_000,
          rateMinor: 300000,
          rateIncludesTax: false,
          discountBps: 0,
          gstRateBps: 1800
        }
      ]
    })
    postVoucher({
      requestId: 'req-vc-sale',
      type: 'SALES',
      date: today(),
      dueDate: today(),
      partyId: customer,
      lines: [
        {
          itemId: item,
          description: 'SSD',
          qtyE4: 1_000,
          rateMinor: 500000,
          rateIncludesTax: false,
          discountBps: 0,
          gstRateBps: 1800
        }
      ]
    })

    const all = summaryRepo.vouchers(companyId, undefined, daysAgo(5), today())
    expect(all.count).toBe(2)
    expect(all.totalMinor).toBeGreaterThan(0)
    expect(all.averageMinor).toBe(Math.round(all.totalMinor / 2))
    expect(all.monthly.length).toBe(1)
    expect(all.topParties.length).toBe(2)

    const sales = summaryRepo.vouchers(companyId, 'SALES', daysAgo(5), today())
    expect(sales.count).toBe(1)
    expect(sales.outstandingMinor).toBe(sales.totalMinor)
  })
})

describe('item summary', () => {
  it('values stock and flags low and out of stock', () => {
    const companyId = company()
    itemRepo.create(
      companyId,
      {
        name: 'Tracked',
        sku: null,
        hsnSac: null,
        uomId: null,
        gstRateBps: 0,
        isService: false,
        salePriceMinor: 100,
        purchasePriceMinor: 50,
        openingQtyE4: 0,
        openingRateMinor: 0,
        reorderLevelE4: 5_000
      },
      null
    )
    itemRepo.create(
      companyId,
      {
        name: 'Consulting',
        sku: null,
        hsnSac: null,
        uomId: null,
        gstRateBps: 0,
        isService: true,
        salePriceMinor: 1000,
        purchasePriceMinor: 0,
        openingQtyE4: 0,
        openingRateMinor: 0,
        reorderLevelE4: 0
      },
      null
    )

    const summary = summaryRepo.items(companyId)

    expect(summary.itemCount).toBe(2)
    expect(summary.serviceCount).toBe(1)
    // Tracked item has no stock yet, so it is out of stock.
    expect(summary.outOfStockCount).toBe(1)
    expect(summary.lowStockCount).toBe(0)
  })
})
