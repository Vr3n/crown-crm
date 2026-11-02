import { describe, expect, it } from 'vitest'
import {
  describePrice,
  grossFromExclusive,
  roundHalfUpDiv,
  splitInclusivePrice
} from '../../src/shared/price'

describe('splitInclusivePrice', () => {
  it('extracts 18% GST from 2500.00 exactly like posting', () => {
    const split = splitInclusivePrice(250_000, 1_800)
    expect(split.taxableMinor).toBe(211_864)
    expect(split.gstMinor).toBe(38_136)
    expect(split.cessMinor).toBe(0)
    expect(split.taxMinor).toBe(38_136)
    expect(split.grossMinor).toBe(250_000)
  })

  it('leaves a zero-rated inclusive price untouched', () => {
    const split = splitInclusivePrice(250_000, 0)
    expect(split.taxableMinor).toBe(250_000)
    expect(split.taxMinor).toBe(0)
    expect(split.grossMinor).toBe(250_000)
  })

  it('extracts cess before GST from an inclusive price', () => {
    const split = splitInclusivePrice(250_000, 1_800, 1_200)
    expect(split.taxableMinor).toBe(192_308)
    expect(split.cessMinor).toBe(23_077)
    expect(split.gstMinor).toBe(34_615)
    expect(split.taxMinor).toBe(57_692)
    expect(split.grossMinor).toBe(250_000)
  })

  it('rounds the taxable value half up', () => {
    // 10000 / 118 = 84.7457...
    expect(splitInclusivePrice(100, 1_800).taxableMinor).toBe(85)
  })
})

describe('grossFromExclusive', () => {
  it('adds 18% GST to a 1750.00 purchase price', () => {
    const split = grossFromExclusive(175_000, 1_800)
    expect(split.taxableMinor).toBe(175_000)
    expect(split.gstMinor).toBe(31_500)
    expect(split.taxMinor).toBe(31_500)
    expect(split.grossMinor).toBe(206_500)
  })

  it('adds GST and cess on top of an exclusive price', () => {
    const split = grossFromExclusive(100_000, 1_800, 1_200)
    expect(split.gstMinor).toBe(18_000)
    expect(split.cessMinor).toBe(12_000)
    expect(split.grossMinor).toBe(130_000)
  })

  it('leaves a zero-rated exclusive price untouched', () => {
    const split = grossFromExclusive(175_000, 0)
    expect(split.grossMinor).toBe(175_000)
    expect(split.taxMinor).toBe(0)
  })
})

describe('roundHalfUpDiv', () => {
  it('rounds halves away from zero', () => {
    expect(roundHalfUpDiv(1, 2)).toBe(1)
    expect(roundHalfUpDiv(-1, 2)).toBe(-1)
    expect(roundHalfUpDiv(2, 3)).toBe(1)
    expect(roundHalfUpDiv(1, 3)).toBe(0)
  })
})

describe('describePrice', () => {
  it('prints the item form wording', () => {
    const split = splitInclusivePrice(250_000, 1_800)
    expect(describePrice(split, { includesTax: true, gstRateBps: 1_800 })).toBe(
      'Taxable 2118.64 · GST 18% 381.36 · Customer pays 2500.00'
    )
  })
})
