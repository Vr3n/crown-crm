import { describe, expect, it } from 'vitest'
import { toneForPath } from '@/lib/module-tone'

describe('module tone', () => {
  it('gives each workflow area its own accent', () => {
    expect(toneForPath('/parties').text).toBe('text-success')
    expect(toneForPath('/items').text).toBe('text-warning')
    expect(toneForPath('/reports/trial-balance').text).toBe('text-info')
    expect(toneForPath('/settings/company').text).toBe('text-stamp')
    expect(toneForPath('/purchases').text).toBe('text-stamp')
    expect(toneForPath('/').text).toBe('text-primary')
  })
})
