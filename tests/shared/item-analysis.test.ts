import { describe, expect, it } from 'vitest'
import {
  REORDER_LABELS,
  analyseItems,
  deadStock,
  itemMargin,
  reorderState,
  topMovers,
  windowStart
} from '../../src/renderer/src/lib/item-analysis'
import type { ItemRow } from '../../src/shared/contracts/masters'
import type { StockFlowRow } from '../../src/shared/contracts/reports'

function item(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    id: 1,
    name: 'Toor Dal 1kg',
    sku: null,
    hsnSac: null,
    uom: 'nos',
    uomId: 1,
    gstRateBps: 1800,
    cessRateBps: 0,
    isService: false,
    salePriceMinor: 11_800,
    purchasePriceMinor: 6_000,
    salePriceIncludesTax: true,
    purchasePriceIncludesTax: false,
    openingQtyE4: 0,
    openingRateMinor: 0,
    stockQtyE4: 30_000,
    reorderLevelE4: 10_000,
    stockGroupId: null,
    stockGroup: null,
    isActive: true,
    ...overrides
  }
}

function movement(itemId: number, date: string, qtyOutE4: number, qtyInE4 = 0): StockFlowRow {
  return { itemId, date, qtyInE4, qtyOutE4, unitCostMinor: 8_000 }
}

describe('itemMargin', () => {
  it('measures taxable sale value against landed purchase cost', () => {
    const margin = itemMargin(item())
    expect(margin.saleTaxableMinor).toBe(10_000)
    expect(margin.saleGrossMinor).toBe(11_800)
    expect(margin.landedCostMinor).toBe(7_080)
    expect(margin.marginPercent).toBe(41)
  })

  it('returns a null percent when the landed cost is zero', () => {
    const margin = itemMargin(item({ purchasePriceMinor: 0 }))
    expect(margin.saleTaxableMinor).toBe(10_000)
    expect(margin.landedCostMinor).toBe(0)
    expect(margin.marginPercent).toBeNull()
  })

  it('keeps a margin for service items', () => {
    const margin = itemMargin(item({ isService: true }))
    expect(margin.marginPercent).toBe(41)
  })
})

describe('reorderState', () => {
  it('uses the same four labels everywhere', () => {
    expect(reorderState(item({ isService: true }))).toBe(REORDER_LABELS.Service)
    expect(reorderState(item({ stockQtyE4: 0 }))).toBe(REORDER_LABELS.Out)
    expect(reorderState(item({ stockQtyE4: 5_000 }))).toBe(REORDER_LABELS.Low)
    expect(reorderState(item({ stockQtyE4: 20_000 }))).toBe(REORDER_LABELS['In stock'])
  })

  it('does not call an item low when no reorder level is set', () => {
    expect(reorderState(item({ stockQtyE4: 1, reorderLevelE4: 0 }))).toBe(
      REORDER_LABELS['In stock']
    )
  })
})

describe('windowStart', () => {
  it('does date-only UTC arithmetic without timezone drift', () => {
    expect(windowStart('2026-06-15', 90)).toBe('2026-03-17')
    expect(windowStart('2026-01-01', 1)).toBe('2025-12-31')
    expect(windowStart('2026-06-15', 0)).toBe('2026-06-15')
  })
})

describe('analyseItems', () => {
  const today = '2026-06-30'

  it('computes cover from the average daily outward quantity', () => {
    const [row] = analyseItems([item()], [movement(1, '2026-06-10', 30_000)], {
      today,
      windowDays: 30
    })
    expect(row.outwardQtyE4).toBe(30_000)
    expect(row.coverDays).toBe(30)
    expect(row.lastOutwardDate).toBe('2026-06-10')
    expect(row.dead).toBe(false)
  })

  it('returns zero cover for zero stock and null cover for zero movement', () => {
    const [zeroStock] = analyseItems(
      [item({ stockQtyE4: 0 })],
      [movement(1, '2026-06-10', 30_000)],
      { today, windowDays: 30 }
    )
    expect(zeroStock.coverDays).toBe(0)

    const [noMovement] = analyseItems([item()], [], { today, windowDays: 30 })
    expect(noMovement.coverDays).toBeNull()
    expect(noMovement.dead).toBe(true)
  })

  it('separates dead stock inside the window from movement outside it', () => {
    const inside = item({ id: 1, name: 'Moved recently' })
    const outside = item({ id: 2, name: 'Moved long ago' })
    const flow = [movement(1, '2026-06-10', 1_000), movement(2, '2026-02-28', 1_000)]

    const ninety = analyseItems([inside, outside], flow, { today, windowDays: 90 })
    expect(ninety[0].dead).toBe(false)
    expect(ninety[1].dead).toBe(true)
    expect(deadStock(ninety, { windowDays: 90 }).map((row) => row.item.id)).toEqual([2])

    const halfYear = analyseItems([inside, outside], flow, { today, windowDays: 180 })
    expect(deadStock(halfYear, { windowDays: 180 })).toEqual([])
  })

  it('never counts a service item as dead stock', () => {
    const service = item({ id: 3, name: 'Installation', isService: true })
    const rows = analyseItems([service], [], { today, windowDays: 90 })
    expect(rows[0].reorder).toBe(REORDER_LABELS.Service)
    expect(rows[0].dead).toBe(true)
    expect(deadStock(rows, { windowDays: 90 })).toEqual([])
  })

  it('ranks movers by outward quantity and skips items that did not move', () => {
    const slow = item({ id: 1, name: 'Slow' })
    const fast = item({ id: 2, name: 'Fast' })
    const still = item({ id: 3, name: 'Still' })
    const rows = analyseItems(
      [slow, fast, still],
      [
        movement(1, '2026-06-01', 10_000),
        movement(2, '2026-06-02', 50_000),
        movement(2, '2026-06-03', 20_000)
      ],
      { today, windowDays: 90 }
    )

    expect(topMovers(rows, 1).map((row) => row.item.id)).toEqual([2])
    expect(topMovers(rows).map((row) => row.item.id)).toEqual([2, 1])
    expect(topMovers(rows, 10).map((row) => row.item.id)).not.toContain(3)
  })

  it('contribution sums to gross margin per unit times outward quantity', () => {
    const first = item({ id: 1 })
    const second = item({ id: 2, salePriceMinor: 5_900, purchasePriceMinor: 4_000 })
    const rows = analyseItems(
      [first, second, item({ id: 3, isService: true })],
      [movement(1, '2026-06-10', 25_000), movement(2, '2026-06-11', 10_000)],
      { today, windowDays: 90 }
    )

    // First: (10000 taxable - 7080 landed) x 2.5 = 7300 paise.
    expect(rows[0].contributionMinor).toBe(7_300)
    // Second: 5000 taxable, 4720 landed, one unit = 280 paise.
    expect(rows[1].contributionMinor).toBe(280)
    expect(rows[2].contributionMinor).toBe(0)
    expect(rows.reduce((sum, row) => sum + row.contributionMinor, 0)).toBe(7_580)
  })

  it('states the window on every row', () => {
    const [row] = analyseItems([item()], [], { today, windowDays: 60 })
    expect(row.windowDays).toBe(60)
    expect(row.from).toBe('2026-05-01')
    expect(row.to).toBe(today)
  })
})
