import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatNow } from '../../../src/main/application/pdf'

describe('formatNow (org timezone, #111)', () => {
  afterEach(() => vi.useRealTimers())

  it('renders the instant in the en-IN wall format with the date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-18T04:15:30.000Z')) // 09:45 IST
    const out = formatNow('Asia/Kolkata')
    expect(out).toContain('2026')
    expect(out).toContain('09:45')
    expect(out).toMatch(/:\d{2}\s*(am|pm)?\b/i)
  })

  it('renders different wall times for far-apart timezones', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-18T16:30:00.000Z'))
    const kolkata = formatNow('Asia/Kolkata')
    const honolulu = formatNow('Pacific/Honolulu')
    expect(kolkata).not.toBe(honolulu)
  })

  it('falls back to the default timezone when the org has none', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-18T16:30:00.000Z'))
    expect(formatNow(null)).toBe(formatNow('Asia/Kolkata'))
    expect(formatNow(undefined)).toBe(formatNow('Asia/Kolkata'))
  })
})