import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../../helpers/db'
import { setupCompany } from '../../../src/main/application/identity'
import { postVoucher } from '../../../src/main/application/vouchers'
import { reports } from '../../../src/main/application/reports'
import { partyRepo, itemRepo } from '../../../src/main/repositories/masters'

setupTestDb()

function setup(): { companyId: number; customerId: number; itemId: number } {
  const session = setupCompany({
    name: 'Acme',
    ownerFullName: 'Owner',
    ownerEmail: 'owner@acme.in',
    ownerPassword: 'correct-horse',
    stateCode: '27',
    booksBeginDate: '2026-04-01'
  })
  const customer = partyRepo.create(
    session.companyId,
    {
      name: 'Acme Distributor',
      phone: null,
      email: null,
      gstin: null,
      stateCode: '27',
      billingAddress: null,
      isCustomer: true,
      isSupplier: false,
      creditDays: 30,
      creditLimitMinor: 0,
      openingBalanceMinor: 0,
      openingBalanceDate: null,
      notes: null
    },
    null
  )
  const item = itemRepo.create(
    session.companyId,
    {
      name: 'SSD',
      sku: null,
      hsnSac: '8523',
      uomId: null,
      gstRateBps: 1800,
      isService: false,
      salePriceMinor: 385593,
      purchasePriceMinor: 300000,
      openingQtyE4: 0,
      openingRateMinor: 0,
      reorderLevelE4: 0
    },
    null
  )
  return { companyId: session.companyId, customerId: customer.id, itemId: item.id }
}

function sell(customerId: number, itemId: number): number {
  return postVoucher({
    requestId: `sale-${Math.random()}`,
    type: 'SALES',
    date: '2026-09-11',
    partyId: customerId,
    lines: [
      {
        itemId,
        description: 'EVM 256GB SSD',
        qtyE4: 10000,
        rateMinor: 385593,
        rateIncludesTax: false,
        discountBps: 0,
        gstRateBps: 1800
      }
    ],
    journalLines: [],
    allocations: []
  }).id
}

describe('reports', () => {
  it('trial balance always agrees', () => {
    const { customerId, itemId } = setup()
    sell(customerId, itemId)
    const rows = reports.trialBalance()
    const debit = rows.reduce((sum, row) => sum + row.debitMinor, 0)
    const credit = rows.reduce((sum, row) => sum + row.creditMinor, 0)
    expect(debit).toBe(credit)
  })

  it('profit and loss nets sales against cost of goods sold', () => {
    const { customerId, itemId } = setup()
    sell(customerId, itemId)
    const report = reports.profitLoss('2026-04-01', '2027-03-31')
    expect(report.totalIncomeMinor).toBe(385593)
    expect(report.totalExpenseMinor).toBe(299999)
    expect(report.netProfitMinor).toBe(85594)
  })

  it('balance sheet balances after a sale on credit', () => {
    const { customerId, itemId } = setup()
    sell(customerId, itemId)
    const report = reports.balanceSheet('2026-04-01', '2027-03-31')
    expect(report.differenceMinor).toBe(0)
  })

  it('receivables report and ageing buckets agree', () => {
    const { customerId, itemId } = setup()
    sell(customerId, itemId)
    const receivable = reports.receivables('2026-10-21')
    expect(receivable[0].totalMinor).toBe(455000)

    const ageing = reports.ageingBuckets('2026-10-21', 'DUE_DATE')
    expect(ageing[0].totalMinor).toBe(455000)
    expect(ageing[0].bucketsMinor.reduce((sum, value) => sum + value, 0)).toBe(455000)
  })

  it('party statement carries a running balance', () => {
    const { customerId, itemId } = setup()
    sell(customerId, itemId)
    const rows = reports.statement(customerId, '2026-04-01', '2026-12-31')
    expect(rows).toHaveLength(1)
    expect(rows[0].balanceMinor).toBe(455000)
  })
})
