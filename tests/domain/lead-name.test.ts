import { describe, it, expect } from 'vitest'
import { normalizePersonName, samePersonName } from '../../src/main/domain/lead'

describe('normalizePersonName', () => {
  it('trims surrounding whitespace, collapses interior runs, and lowercases', () => {
    expect(normalizePersonName('  Rahul   Sharma ')).toBe('rahul sharma')
  })

  it('handles a single-word name', () => {
    expect(normalizePersonName('  NEHA ')).toBe('neha')
  })
})

describe('samePersonName', () => {
  it('matches names that differ only by case and whitespace', () => {
    expect(samePersonName('Rahul Sharma', '  rahul   sharma ')).toBe(true)
  })

  it('returns false when the names differ', () => {
    expect(samePersonName('Rahul', 'Rahul Sharma')).toBe(false)
    expect(samePersonName('Neha Kapoor', 'Raj Kapoor')).toBe(false)
  })

  it('matches identical names', () => {
    expect(samePersonName('Priya Verma', 'Priya Verma')).toBe(true)
  })
})