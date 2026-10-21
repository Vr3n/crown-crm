import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { normalizeMachineGuid, resetFingerprintCache } from '../../src/main/licensing/fingerprint'

const MACHINE_GUID = '12345678-1234-1234-1234-123456789012'

// Mock reg.exe output.
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return {
    ...actual,
    execFileSync: vi.fn(
      () =>
        `HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\n    MachineGuid    REG_SZ    ${MACHINE_GUID}`
    )
  }
})

describe('normalizeMachineGuid', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeMachineGuid('  abc-123  ')).toBe('abc-123')
  })

  it('lowercases the value', () => {
    expect(normalizeMachineGuid('ABC-DEF')).toBe('abc-def')
  })

  it('compares equal regardless of case', () => {
    expect(normalizeMachineGuid(MACHINE_GUID)).toBe(
      normalizeMachineGuid(MACHINE_GUID.toUpperCase())
    )
  })
})

describe('collectMachineGuid', () => {
  beforeEach(() => {
    vi.resetModules()
    resetFingerprintCache()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('extracts the MachineGuid UUID from reg.exe output', async () => {
    const { collectMachineGuid } = await import('../../src/main/licensing/fingerprint')
    expect(collectMachineGuid()).toBe(MACHINE_GUID)
  })

  it('caches the result across calls', async () => {
    const { collectMachineGuid } = await import('../../src/main/licensing/fingerprint')
    collectMachineGuid()
    collectMachineGuid()
    const { execFileSync } = await import('node:child_process')
    expect(vi.mocked(execFileSync)).toHaveBeenCalledTimes(1)
  })

  it('throws when the MachineGuid is not present', async () => {
    const { execFileSync } = await import('node:child_process')
    vi.mocked(execFileSync).mockImplementationOnce(() => 'no uuid here')
    const { collectMachineGuid } = await import('../../src/main/licensing/fingerprint')
    expect(() => collectMachineGuid()).toThrow()
  })
})
