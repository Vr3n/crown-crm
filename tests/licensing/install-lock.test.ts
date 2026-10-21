import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TEST_INSTALL_DIR = join(import.meta.dirname, '..', '.tmp-install-lock-test')

const MACHINE_GUID = '12345678-1234-1234-1234-123456789012'

// Make getInstallDir() resolve to the temp dir for tests.
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path')
  return {
    ...actual,
    dirname: () => TEST_INSTALL_DIR
  }
})

// Mock reg.exe output — avoids touching the real registry.
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

describe('install lock', () => {
  beforeEach(() => {
    mkdirSync(TEST_INSTALL_DIR, { recursive: true })
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(TEST_INSTALL_DIR, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('writes a machine.lock containing the MachineGuid on generate', async () => {
    const { generateInstallLock } = await import('../../src/main/licensing/install-lock')
    const path = join(TEST_INSTALL_DIR, 'machine.lock')

    expect(existsSync(path)).toBe(false)
    generateInstallLock(TEST_INSTALL_DIR)
    expect(existsSync(path)).toBe(true)

    expect(readFileSync(path, 'utf-8').trim()).toBe(MACHINE_GUID)
  })

  it('verifyInstallLock is ACTIVE for the same machine', async () => {
    const { generateInstallLock, verifyInstallLock } =
      await import('../../src/main/licensing/install-lock')
    generateInstallLock(TEST_INSTALL_DIR)
    expect(verifyInstallLock(TEST_INSTALL_DIR).state).toBe('ACTIVE')
  })

  it('verifyInstallLock is ACTIVE regardless of MachineGuid letter case', async () => {
    const { generateInstallLock, verifyInstallLock } =
      await import('../../src/main/licensing/install-lock')
    const { execFileSync } = await import('node:child_process')
    vi.mocked(execFileSync).mockImplementation(
      () =>
        `HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\n    MachineGuid    REG_SZ    ${MACHINE_GUID.toUpperCase()}`
    )
    generateInstallLock(TEST_INSTALL_DIR)
    expect(verifyInstallLock(TEST_INSTALL_DIR).state).toBe('ACTIVE')
  })

  it('verifyInstallLock is LOCKED (NO_LOCK) when no lock exists', async () => {
    const { verifyInstallLock } = await import('../../src/main/licensing/install-lock')
    expect(verifyInstallLock(TEST_INSTALL_DIR)).toEqual({
      state: 'LOCKED',
      reason: 'NO_LOCK'
    })
  })

  it('verifyInstallLock is LOCKED (CORRUPT) for empty content', async () => {
    const { verifyInstallLock } = await import('../../src/main/licensing/install-lock')
    writeFileSync(join(TEST_INSTALL_DIR, 'machine.lock'), '   \n', 'utf-8')
    expect(verifyInstallLock(TEST_INSTALL_DIR)).toEqual({
      state: 'LOCKED',
      reason: 'CORRUPT'
    })
  })

  it('verifyInstallLock is LOCKED (FINGERPRINT_MISMATCH) when machine differs', async () => {
    const { generateInstallLock, verifyInstallLock } =
      await import('../../src/main/licensing/install-lock')
    generateInstallLock(TEST_INSTALL_DIR)

    // Simulate the folder being copied to another machine: different MachineGuid.
    const { execFileSync } = await import('node:child_process')
    vi.mocked(execFileSync).mockImplementation(
      () =>
        `HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\n    MachineGuid    REG_SZ    ffffffff-ffff-ffff-ffff-ffffffffffff`
    )
    const { resetFingerprintCache } = await import('../../src/main/licensing/fingerprint')
    resetFingerprintCache()

    expect(verifyInstallLock(TEST_INSTALL_DIR)).toEqual({
      state: 'LOCKED',
      reason: 'FINGERPRINT_MISMATCH'
    })
  })

  it('verifyInstallLock is LOCKED when fingerprint collection fails', async () => {
    const { generateInstallLock, verifyInstallLock } =
      await import('../../src/main/licensing/install-lock')
    generateInstallLock(TEST_INSTALL_DIR)

    const { execFileSync } = await import('node:child_process')
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('reg.exe unavailable')
    })
    const { resetFingerprintCache } = await import('../../src/main/licensing/fingerprint')
    resetFingerprintCache()

    expect(verifyInstallLock(TEST_INSTALL_DIR).state).toBe('LOCKED')
  })
})
