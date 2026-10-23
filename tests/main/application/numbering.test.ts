import { describe, expect, it } from 'vitest'
import { setupTestDb } from '../../helpers/db'
import { setupCompany } from '../../../src/main/application/identity'
import {
  completeOnboarding,
  listNumbering,
  updateNumbering
} from '../../../src/main/application/numbering'
import { numberingRepo } from '../../../src/main/repositories/numbering'
import { voucherRepo } from '../../../src/main/repositories/vouchers'
import { getDb } from '../../../src/main/db/connection'
import type { VoucherType } from '../../../src/shared/contracts/vouchers'

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

function update(
  voucherType: VoucherType,
  patch: Partial<{
    series: string
    prefix: string
    suffix: string
    padding: number
    startNumber: number
    resetPeriod: 'YEARLY' | 'MONTHLY' | 'NEVER'
    manualOverride: boolean
  }>
): void {
  const current = listNumbering().find((row) => row.voucherType === voucherType)
  if (!current) throw new Error('missing row')
  updateNumbering({
    requestId: `req-${voucherType}`,
    items: [
      {
        voucherType,
        series: patch.series ?? current.series,
        prefix: patch.prefix ?? current.prefix,
        suffix: patch.suffix ?? current.suffix,
        padding: patch.padding ?? current.padding,
        startNumber: patch.startNumber ?? current.startNumber,
        resetPeriod: patch.resetPeriod ?? current.resetPeriod,
        manualOverride: patch.manualOverride ?? current.manualOverride
      }
    ]
  })
}

describe('voucher numbering settings', () => {
  it('seeds one row per voucher type with the legacy series', () => {
    company()
    const rows = listNumbering()
    expect(rows).toHaveLength(9)
    expect(rows.find((row) => row.voucherType === 'PURCHASE')).toMatchObject({
      series: 'PUR',
      prefix: 'PUR/',
      padding: 4,
      startNumber: 1,
      nextNumber: 'PUR/0001'
    })
    expect(rows.every((row) => row.usedCount === 0)).toBe(true)
  })

  it('applies a new prefix, width and starting number to the next number', () => {
    company()
    update('PURCHASE', { prefix: 'BILL/', padding: 5, startNumber: 100 })

    const row = listNumbering().find((entry) => entry.voucherType === 'PURCHASE')
    expect(row?.nextNumber).toBe('BILL/00100')

    const allocated = voucherRepo.allocateNumber(1, 'PURCHASE', '2026-05-01')
    expect(allocated.number).toBe('BILL/00100')
    expect(allocated.series).toBe('PUR')
    expect(allocated.fy).toBe('2026-27')
  })

  it('keeps the high water mark when only the format changes', () => {
    company()
    update('PURCHASE', { prefix: 'BILL/', padding: 4, startNumber: 1 })
    voucherRepo.allocateNumber(1, 'PURCHASE', '2026-05-01')

    update('PURCHASE', { prefix: 'PB/', padding: 5 })

    const row = listNumbering().find((entry) => entry.voucherType === 'PURCHASE')
    expect(row?.lastUsed).toBe(1)
    expect(row?.nextNumber).toBe('PB/00002')
    expect(voucherRepo.allocateNumber(1, 'PURCHASE', '2026-05-02').number).toBe('PB/00002')
  })

  it('starts a new series without renumbering posted vouchers', () => {
    company()
    const first = voucherRepo.allocateNumber(1, 'PURCHASE', '2026-05-01')
    expect(first.number).toBe('PUR/0001')

    update('PURCHASE', { series: 'PBI', prefix: 'PBI/', startNumber: 1 })
    const second = voucherRepo.allocateNumber(1, 'PURCHASE', '2026-05-02')
    expect(second.series).toBe('PBI')
    expect(second.number).toBe('PBI/0001')

    const sequences = getDb()
      .prepare(
        'SELECT series FROM voucher_sequences WHERE company_id = 1 AND voucher_type = ? ORDER BY series'
      )
      .all('PURCHASE') as { series: string }[]
    expect(sequences.map((row) => row.series)).toEqual(['PBI', 'PUR'])
  })

  it('restarts each financial year by default', () => {
    company()
    update('PURCHASE', { startNumber: 1, padding: 4 })
    expect(voucherRepo.allocateNumber(1, 'PURCHASE', '2026-05-01').number).toBe('PUR/0001')
    expect(voucherRepo.allocateNumber(1, 'PURCHASE', '2027-05-01').number).toBe('PUR/0001')
  })

  it('continues across years when reset is off', () => {
    company()
    update('PURCHASE', { resetPeriod: 'NEVER', startNumber: 1 })
    expect(voucherRepo.allocateNumber(1, 'PURCHASE', '2026-05-01').number).toBe('PUR/0001')
    expect(voucherRepo.allocateNumber(1, 'PURCHASE', '2027-05-01').number).toBe('PUR/0002')
  })

  it('resets every month when monthly reset is on', () => {
    company()
    update('PURCHASE', { resetPeriod: 'MONTHLY', prefix: 'PUR/{YYYYMM}', padding: 3 })
    expect(voucherRepo.allocateNumber(1, 'PURCHASE', '2026-07-01').number).toBe('PUR/202607001')
    expect(voucherRepo.allocateNumber(1, 'PURCHASE', '2026-07-20').number).toBe('PUR/202607002')
    expect(voucherRepo.allocateNumber(1, 'PURCHASE', '2026-08-01').number).toBe('PUR/202608001')
  })

  it('builds the year-month example', () => {
    company()
    update('PURCHASE', { prefix: 'INV/{YYYYMM}', suffix: '', padding: 3 })
    expect(voucherRepo.allocateNumber(1, 'PURCHASE', '2026-07-13').number).toBe('INV/202607001')
  })

  it('expands the financial year token', () => {
    company()
    update('PURCHASE', { prefix: 'PUR/{FY}/', padding: 4 })
    expect(voucherRepo.allocateNumber(1, 'PURCHASE', '2026-07-13').number).toBe('PUR/2026-27/0001')
  })

  it('honours a manual number only when the series allows it', () => {
    company()
    expect(() => voucherRepo.allocateNumber(1, 'PURCHASE', '2026-05-01', 50)).toThrow(
      /Manual voucher numbers are turned off/
    )

    update('PURCHASE', { manualOverride: true })
    expect(voucherRepo.allocateNumber(1, 'PURCHASE', '2026-05-01', 50).number).toBe('PUR/0050')
    expect(() => voucherRepo.allocateNumber(1, 'PURCHASE', '2026-05-02', 50)).toThrow(
      /greater than 50/
    )
    expect(voucherRepo.allocateNumber(1, 'PURCHASE', '2026-05-02', 51).number).toBe('PUR/0051')
  })

  it('rejects an invalid setting at the boundary', () => {
    company()
    expect(() =>
      updateNumbering({
        requestId: 'req-bad',
        items: [
          {
            voucherType: 'PURCHASE',
            series: '1',
            prefix: '',
            suffix: '',
            padding: 4,
            startNumber: 1,
            resetPeriod: 'YEARLY',
            manualOverride: false
          }
        ]
      })
    ).toThrow(/Series/)
  })

  it('marks numbering setup and onboarding complete', () => {
    const companyId = company()
    expect(numberingRepo.setupState(companyId).numberingSetupAt).toBeNull()

    update('PURCHASE', { prefix: 'PUR/' })
    expect(numberingRepo.setupState(companyId).numberingSetupAt).not.toBeNull()

    expect(numberingRepo.setupState(companyId).onboardingCompletedAt).toBeNull()
    completeOnboarding()
    expect(numberingRepo.setupState(companyId).onboardingCompletedAt).not.toBeNull()
  })
})
