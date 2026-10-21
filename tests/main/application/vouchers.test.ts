import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { setupTestDb } from '../../helpers/db'
import { setupCompany } from '../../../src/main/application/identity'
import {
  postVoucher,
  cancelVoucher,
  getOutstanding,
  getVoucher
} from '../../../src/main/application/vouchers'
import { partyRepo, itemRepo } from '../../../src/main/repositories/masters'
import { getDb, getDrizzle } from '../../../src/main/db/connection'
import { vouchers } from '../../../src/main/db/schema'
import type { PartyRow } from '../../../src/shared/contracts/masters'

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

function party(companyId: number, name: string, customer: boolean, supplier: boolean): PartyRow {
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
  )
}

function item(companyId: number, name: string, rate: number): number {
  return itemRepo.create(
    companyId,
    {
      name,
      sku: null,
      hsnSac: '8523',
      uomId: null,
      gstRateBps: 1800,
      isService: false,
      salePriceMinor: rate,
      purchasePriceMinor: 300000,
      openingQtyE4: 0,
      openingRateMinor: 0,
      reorderLevelE4: 0
    },
    null
  ).id
}

function ledgerBalance(companyId: number): { debit: number; credit: number } {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(l.debit_minor),0) AS debit, COALESCE(SUM(l.credit_minor),0) AS credit
       FROM ledger_lines l JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
       WHERE l.company_id = ?`
    )
    .get(companyId) as { debit: number; credit: number }
  return row
}

describe('posting a purchase', () => {
  it('computes tax, writes stock and balances the ledger', () => {
    const companyId = company()
    const supplier = party(companyId, 'TechConnect', false, true)
    const ssd = item(companyId, 'SSD 256GB', 385593)

    const posted = postVoucher({
      requestId: 'req-purchase-1',
      type: 'PURCHASE',
      date: '2026-07-13',
      partyId: supplier.id,
      lines: [
        {
          itemId: ssd,
          description: 'Epson Ink Black',
          qtyE4: 10_000,
          rateMinor: 34_000,
          rateIncludesTax: false,
          discountBps: 1525,
          gstRateBps: 1800
        },
        {
          itemId: ssd,
          description: 'Epson Ink Cyan',
          qtyE4: 10_000,
          rateMinor: 48_500,
          rateIncludesTax: false,
          discountBps: 1525,
          gstRateBps: 1800
        }
      ]
    })

    expect(posted.number).toBe('PUR/0001')
    const voucher = getVoucher(companyId, posted.id)
    expect(voucher.taxableMinor).toBe(69_919)
    expect(voucher.cgstMinor).toBe(6_292)
    expect(voucher.sgstMinor).toBe(6_292)
    expect(voucher.roundOffMinor).toBe(-3)
    expect(voucher.totalMinor).toBe(82_500)
    expect(voucher.dueDate).toBe('2026-08-12')

    const movements = getDb()
      .prepare(`SELECT COUNT(*) AS n FROM stock_movements WHERE voucher_id = ?`)
      .get(posted.id) as { n: number }
    expect(movements.n).toBe(2)

    const balance = ledgerBalance(companyId)
    expect(balance.debit).toBe(balance.credit)
    expect(balance.debit).toBe(82_503)
  })

  it('refuses a purchase without a supplier', () => {
    const companyId = company()
    const customer = party(companyId, 'Only Customer', true, false)
    const ssd = item(companyId, 'SSD', 100000)
    expect(() =>
      postVoucher({
        requestId: 'req-bad-party',
        type: 'PURCHASE',
        date: '2026-07-13',
        partyId: customer.id,
        lines: [
          {
            itemId: ssd,
            description: 'SSD',
            qtyE4: 10_000,
            rateMinor: 100_000,
            rateIncludesTax: false,
            discountBps: 0,
            gstRateBps: 1800
          }
        ]
      })
    ).toThrow()
  })
})

describe('sale, receipt and outstanding', () => {
  it('matches the sample invoice and settles part of the bill', () => {
    const companyId = company()
    const customer = party(companyId, 'Acme Distributor', true, false)
    const ssd = item(companyId, 'EVM 256GB SSD', 385593)

    const sale = postVoucher({
      requestId: 'req-sale-1',
      type: 'SALES',
      date: '2026-09-11',
      partyId: customer.id,
      lines: [
        {
          itemId: ssd,
          description: 'EVM 256GB SATA SSD',
          qtyE4: 10_000,
          rateMinor: 385_593,
          rateIncludesTax: false,
          discountBps: 0,
          gstRateBps: 1800
        }
      ]
    })

    const voucher = getVoucher(companyId, sale.id)
    expect(voucher.taxableMinor).toBe(385_593)
    expect(voucher.cgstMinor).toBe(34_703)
    expect(voucher.sgstMinor).toBe(34_703)
    expect(voucher.roundOffMinor).toBe(1)
    expect(voucher.totalMinor).toBe(455_000)
    expect(voucher.number).toBe('INV/0001')

    const receipt = postVoucher({
      requestId: 'req-receipt-1',
      type: 'RECEIPT',
      date: '2026-10-05',
      partyId: customer.id,
      amountMinor: 200_000,
      cashAccountId: undefined,
      allocations: [{ toVoucherId: sale.id, amountMinor: 150_000, type: 'AGAINST_REF' }]
    })
    expect(receipt.number).toBe('RCT/0001')

    const open = getOutstanding(companyId, { asOf: '2026-12-31', basis: 'DUE_DATE' })
    const bill = open.find((row) => row.id === sale.id)
    expect(bill?.paidMinor).toBe(150_000)
    expect(bill?.outstandingMinor).toBe(305_000)
  })

  it('rejects an allocation larger than the bill', () => {
    const companyId = company()
    const customer = party(companyId, 'Acme', true, false)
    const ssd = item(companyId, 'SSD', 100000)
    const sale = postVoucher({
      requestId: 'req-sale-2',
      type: 'SALES',
      date: '2026-09-11',
      partyId: customer.id,
      lines: [
        {
          itemId: ssd,
          description: 'SSD',
          qtyE4: 10_000,
          rateMinor: 100_000,
          rateIncludesTax: false,
          discountBps: 0,
          gstRateBps: 1800
        }
      ]
    })
    expect(() =>
      postVoucher({
        requestId: 'req-receipt-2',
        type: 'RECEIPT',
        date: '2026-10-05',
        partyId: customer.id,
        amountMinor: 500_000,
        allocations: [{ toVoucherId: sale.id, amountMinor: 500_000, type: 'AGAINST_REF' }]
      })
    ).toThrow()
  })

  it('posts once for a repeated request id', () => {
    const companyId = company()
    const customer = party(companyId, 'Acme', true, false)
    const ssd = item(companyId, 'SSD', 100000)
    const input = {
      requestId: 'req-idempotent',
      type: 'SALES' as const,
      date: '2026-09-11',
      partyId: customer.id,
      lines: [
        {
          itemId: ssd,
          description: 'SSD',
          qtyE4: 10_000,
          rateMinor: 100_000,
          rateIncludesTax: false,
          discountBps: 0,
          gstRateBps: 1800
        }
      ]
    }
    const first = postVoucher(input)
    const second = postVoucher(input)
    expect(second.id).toBe(first.id)
    const count = getDrizzle()
      .select({ id: vouchers.id })
      .from(vouchers)
      .where(eq(vouchers.company_id, companyId))
      .all()
    expect(count).toHaveLength(1)
  })
})

describe('journals and cancellation', () => {
  it('rejects an unbalanced journal', () => {
    const companyId = company()
    const accounts = getDb()
      .prepare(`SELECT id FROM accounts WHERE company_id = ? ORDER BY id LIMIT 2`)
      .all(companyId) as { id: number }[]
    expect(() =>
      postVoucher({
        requestId: 'req-journal-bad',
        type: 'JOURNAL',
        date: '2026-09-11',
        journalLines: [{ accountId: accounts[0].id, debitMinor: 100, creditMinor: 0 }]
      })
    ).toThrow()
  })

  it('posts a balanced journal', () => {
    const companyId = company()
    const accounts = getDb()
      .prepare(`SELECT id FROM accounts WHERE company_id = ? ORDER BY id LIMIT 2`)
      .all(companyId) as { id: number }[]
    const posted = postVoucher({
      requestId: 'req-journal-ok',
      type: 'JOURNAL',
      date: '2026-09-11',
      journalLines: [
        { accountId: accounts[0].id, debitMinor: 100, creditMinor: 0 },
        { accountId: accounts[1].id, debitMinor: 0, creditMinor: 100 }
      ]
    })
    expect(posted.number).toBe('JV/0001')
  })

  it('cancels an unallocated bill and removes it from outstanding', () => {
    const companyId = company()
    const customer = party(companyId, 'Acme', true, false)
    const ssd = item(companyId, 'SSD', 100000)
    const sale = postVoucher({
      requestId: 'req-sale-cancel',
      type: 'SALES',
      date: '2026-09-11',
      partyId: customer.id,
      lines: [
        {
          itemId: ssd,
          description: 'SSD',
          qtyE4: 10_000,
          rateMinor: 100_000,
          rateIncludesTax: false,
          discountBps: 0,
          gstRateBps: 1800
        }
      ]
    })
    cancelVoucher(companyId, sale.id, 'Wrong party')
    const open = getOutstanding(companyId, { asOf: '2026-12-31', basis: 'BILL_DATE' })
    expect(open.find((row) => row.id === sale.id)).toBeUndefined()
    const detail = getVoucher(companyId, sale.id)
    expect(detail.status).toBe('CANCELLED')
  })
})
