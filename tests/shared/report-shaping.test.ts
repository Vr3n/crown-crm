import { describe, expect, it } from 'vitest'
import {
  AGEING_BUCKETS,
  ageingParties,
  ageingStackRows,
  amountTone,
  bucketSlices,
  bucketTotals,
  expenseComposition,
  hasTax,
  monthKeysBetween,
  monthLabel,
  monthlyRegisterSeries,
  openBalanceStatus,
  profitMonthlySeries,
  rankedItems,
  taxSplitRows,
  trialBalanceGroups
} from '../../src/renderer/src/features/reports/report-shaping'
import type { RegisterRow } from '../../src/shared/contracts/reports'

function registerRow(overrides: Partial<RegisterRow> = {}): RegisterRow {
  return {
    id: 1,
    date: '2026-04-10',
    number: 'S-1',
    partyName: 'Acme',
    taxableMinor: 10000,
    cgstMinor: 900,
    sgstMinor: 900,
    igstMinor: 0,
    roundOffMinor: 0,
    totalMinor: 11800,
    status: 'POSTED',
    ...overrides
  }
}

describe('month keys', () => {
  it('lists every month in an inclusive range', () => {
    expect(monthKeysBetween('2026-04-01', '2026-07-31')).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07'
    ])
  })

  it('returns a single month when both dates are in it', () => {
    expect(monthKeysBetween('2026-04-01', '2026-04-30')).toEqual(['2026-04'])
  })

  it('returns nothing for an empty or reversed range', () => {
    expect(monthKeysBetween('', '')).toEqual([])
    expect(monthKeysBetween('2026-05-01', '2026-04-30')).toEqual([])
    expect(monthKeysBetween('not-a-date', '2026-04-30')).toEqual([])
  })

  it('formats a month key without relying on the local timezone', () => {
    expect(monthLabel('2026-04')).toBe('Apr 2026')
    expect(monthLabel('2026-12')).toBe('Dec 2026')
    expect(monthLabel('nope')).toBe('nope')
  })
})

describe('monthlyRegisterSeries', () => {
  it('returns zero-filled months for an empty register', () => {
    const series = monthlyRegisterSeries([], '2026-04-01', '2026-06-30')
    expect(series.map((month) => month.key)).toEqual(['2026-04', '2026-05', '2026-06'])
    for (const month of series) {
      expect(month.taxableMinor).toBe(0)
      expect(month.taxMinor).toBe(0)
      expect(month.totalMinor).toBe(0)
    }
  })

  it('aggregates a single row without inventing neighbours', () => {
    const series = monthlyRegisterSeries([registerRow()], '2026-04-01', '2026-04-30')
    expect(series).toHaveLength(1)
    expect(series[0]).toMatchObject({
      key: '2026-04',
      label: 'Apr 2026',
      taxableMinor: 10000,
      taxMinor: 1800,
      totalMinor: 11800
    })
  })

  it('sums documents inside a month and leaves gaps at zero', () => {
    const rows = [
      registerRow({ id: 1, taxableMinor: 10000, cgstMinor: 900, sgstMinor: 900, totalMinor: 11800 }),
      registerRow({
        id: 2,
        date: '2026-04-28',
        taxableMinor: 5000,
        cgstMinor: 450,
        sgstMinor: 450,
        igstMinor: 0,
        totalMinor: 5900
      }),
      registerRow({
        id: 3,
        date: '2026-06-02',
        taxableMinor: 20000,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 3600,
        totalMinor: 23600
      })
    ]
    const series = monthlyRegisterSeries(rows, '2026-04-01', '2026-06-30')
    expect(series.map((month) => month.key)).toEqual(['2026-04', '2026-05', '2026-06'])
    expect(series[0]).toMatchObject({ taxableMinor: 15000, taxMinor: 2700, totalMinor: 17700 })
    expect(series[1]).toMatchObject({ taxableMinor: 0, taxMinor: 0, totalMinor: 0 })
    expect(series[2]).toMatchObject({ taxableMinor: 20000, taxMinor: 3600, totalMinor: 23600 })
  })

  it('reconciles the series totals with the register totals', () => {
    const rows = [registerRow(), registerRow({ id: 2, date: '2026-05-04' })]
    const series = monthlyRegisterSeries(rows, '2026-04-01', '2026-05-31')
    const taxable = series.reduce((sum, month) => sum + month.taxableMinor, 0)
    const tax = series.reduce((sum, month) => sum + month.taxMinor, 0)
    expect(taxable).toBe(rows.reduce((sum, row) => sum + row.taxableMinor, 0))
    expect(tax).toBe(
      rows.reduce((sum, row) => sum + row.cgstMinor + row.sgstMinor + row.igstMinor, 0)
    )
  })
})

describe('ageing bucket shaping', () => {
  it('sums buckets across parties and pads missing ones', () => {
    expect(bucketTotals([])).toEqual([0, 0, 0, 0, 0])
    expect(bucketTotals([{ bucketsMinor: [100, 0, 0, 0, 0] }])).toEqual([100, 0, 0, 0, 0])
    expect(
      bucketTotals([
        { bucketsMinor: [100, 200, 0, 0, 0] },
        { bucketsMinor: [1, 2, 3, 4, 5] }
      ])
    ).toEqual([101, 202, 3, 4, 5])
  })

  it('turns bucket totals into one labelled layer per bucket', () => {
    const slices = bucketSlices([10, 20, 30, 40, 50])
    expect(slices).toHaveLength(AGEING_BUCKETS.length)
    expect(slices.map((slice) => slice.series)).toEqual([...AGEING_BUCKETS])
    expect(slices.every((slice) => slice.x === 'Outstanding')).toBe(true)
    expect(slices.reduce((sum, slice) => sum + slice.valueMinor, 0)).toBe(150)
  })

  it('keeps the largest parties and folds the rest so totals still match', () => {
    const rows = Array.from({ length: 13 }, (_, index) => ({
      partyName: `Party ${index + 1}`,
      bucketsMinor: [index + 1, 0, 0, 0, 0],
      totalMinor: index + 1
    }))
    const parties = ageingParties(rows, 10)
    expect(parties).toHaveLength(11)
    expect(parties[10].label).toBe('Other parties (3)')
    const total = parties.reduce((sum, party) => sum + party.totalMinor, 0)
    expect(total).toBe(rows.reduce((sum, row) => sum + row.totalMinor, 0))
    expect(bucketTotals(parties)).toEqual(bucketTotals(rows))
  })

  it('does not add a remainder row when every party fits', () => {
    const rows = [
      { partyName: 'A', bucketsMinor: [5, 0, 0, 0, 0], totalMinor: 5 },
      { partyName: 'B', bucketsMinor: [0, 7, 0, 0, 0], totalMinor: 7 }
    ]
    expect(ageingParties(rows, 10).map((party) => party.label)).toEqual(['B', 'A'])
  })

  it('builds one stacked row per party per bucket', () => {
    const rows = ageingStackRows([
      { label: 'A', bucketsMinor: [1, 2, 0, 0, 0], totalMinor: 3 }
    ])
    expect(rows).toHaveLength(5)
    expect(rows[0]).toMatchObject({ x: 'A', series: '0-30', valueMinor: 1 })
    expect(rows[1]).toMatchObject({ x: 'A', series: '31-60', valueMinor: 2 })
  })
})

describe('ranking', () => {
  it('filters zero values, sorts largest first and applies the limit', () => {
    const rows = [
      { name: 'Zero', value: 0 },
      { name: 'Small', value: 10 },
      { name: 'Large', value: 90 },
      { name: 'Middle', value: 40 }
    ]
    expect(rankedItems(rows, (row) => row.name, (row) => row.value, 2)).toEqual([
      { label: 'Large', valueMinor: 90 },
      { label: 'Middle', valueMinor: 40 }
    ])
  })

  it('returns nothing for an empty list', () => {
    expect(rankedItems([], () => '', () => 0, 8)).toEqual([])
  })

  it('folds the expense tail into one row that preserves the total', () => {
    const expenses = Array.from({ length: 11 }, (_, index) => ({
      name: `Expense ${index + 1}`,
      debitMinor: (index + 1) * 100
    }))
    const items = expenseComposition(expenses, 8)
    expect(items).toHaveLength(9)
    expect(items[8].label).toBe('Other expenses (3)')
    expect(items.reduce((sum, item) => sum + item.valueMinor, 0)).toBe(6600)
  })

  it('leaves a short expense list untouched', () => {
    expect(expenseComposition([{ name: 'Rent', debitMinor: 500 }], 8)).toEqual([
      { label: 'Rent', valueMinor: 500 }
    ])
  })
})

describe('tax split', () => {
  it('emits CGST, SGST and IGST for every month', () => {
    const months = monthlyRegisterSeries([registerRow()], '2026-04-01', '2026-04-30')
    expect(taxSplitRows(months)).toEqual([
      { x: 'Apr 2026', series: 'CGST', valueMinor: 900 },
      { x: 'Apr 2026', series: 'SGST', valueMinor: 900 },
      { x: 'Apr 2026', series: 'IGST', valueMinor: 0 }
    ])
  })

  it('reports whether there is any tax to draw', () => {
    const zero = monthlyRegisterSeries([], '2026-04-01', '2026-04-30')
    expect(hasTax(zero)).toBe(false)
    const taxed = monthlyRegisterSeries([registerRow()], '2026-04-01', '2026-04-30')
    expect(hasTax(taxed)).toBe(true)
  })
})

describe('profit monthly series', () => {
  it('zero-fills the months the RPC did not return', () => {
    const series = profitMonthlySeries(
      [{ month: '2026-05', incomeMinor: 1000, expenseMinor: 400, netProfitMinor: 600 }],
      '2026-04-01',
      '2026-06-30'
    )
    expect(series.map((point) => point.key)).toEqual(['2026-04', '2026-05', '2026-06'])
    expect(series[0]).toMatchObject({ incomeMinor: 0, expenseMinor: 0, netProfitMinor: 0 })
    expect(series[1]).toMatchObject({ incomeMinor: 1000, netProfitMinor: 600 })
  })

  it('handles a single month and an empty series', () => {
    const single = profitMonthlySeries(
      [{ month: '2026-04', incomeMinor: 10, expenseMinor: 4, netProfitMinor: 6 }],
      '2026-04-01',
      '2026-04-30'
    )
    expect(single).toHaveLength(1)
    expect(single[0].label).toBe('Apr 2026')
    expect(profitMonthlySeries([], '2026-04-01', '2026-04-30')).toHaveLength(1)
    expect(profitMonthlySeries([], '', '')).toEqual([])
  })

  it('keeps RPC months outside the requested range instead of dropping them', () => {
    const series = profitMonthlySeries(
      [{ month: '2026-03', incomeMinor: 7, expenseMinor: 1, netProfitMinor: 6 }],
      '2026-04-01',
      '2026-04-30'
    )
    expect(series.map((point) => point.key)).toEqual(['2026-04'])
  })
})

describe('trial balance groups', () => {
  it('sums debit and credit per group and sorts by group name', () => {
    expect(
      trialBalanceGroups([
        { groupName: 'Expenses', debitMinor: 1200, creditMinor: 0 },
        { groupName: 'Assets', debitMinor: 500, creditMinor: 100 },
        { groupName: 'Expenses', debitMinor: 300, creditMinor: 50 }
      ])
    ).toEqual([
      { name: 'Assets', debitMinor: 500, creditMinor: 100 },
      { name: 'Expenses', debitMinor: 1500, creditMinor: 50 }
    ])
  })

  it('drops accounts with no movement and keeps the totals reconciled', () => {
    const groups = trialBalanceGroups([
      { groupName: 'Assets', debitMinor: 0, creditMinor: 0 },
      { groupName: 'Income', debitMinor: 0, creditMinor: 900 }
    ])
    expect(groups).toEqual([{ name: 'Income', debitMinor: 0, creditMinor: 900 }])
    expect(groups.reduce((sum, group) => sum + group.creditMinor, 0)).toBe(900)
  })

  it('returns an empty list for an empty report', () => {
    expect(trialBalanceGroups([])).toEqual([])
  })
})

describe('status and amount tone', () => {
  it('puts overdue ahead of due-soon and current', () => {
    expect(openBalanceStatus({ overdueMinor: 1, dueWithin7Minor: 5 })).toBe('overdue')
    expect(openBalanceStatus({ overdueMinor: 0, dueWithin7Minor: 5 })).toBe('due-soon')
    expect(openBalanceStatus({ overdueMinor: 0, dueWithin7Minor: 0 })).toBe('current')
  })

  it('maps money to negative, positive and zero', () => {
    expect(amountTone(-1)).toBe('negative')
    expect(amountTone(0)).toBe('zero')
    expect(amountTone(1)).toBe('positive')
  })
})
