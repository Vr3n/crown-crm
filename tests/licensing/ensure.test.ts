import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TEST_INSTALL_DIR = join(import.meta.dirname, '..', '.tmp-ensure-test')

const MACHINE_GUID = '12345678-1234-1234-1234-123456789012'

// Make getInstallDir() resolve to the temp dir for tests.
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path')
  return {
    ...actual,
    dirname: () => TEST_INSTALL_DIR
  }
})

vi.mock('../../src/main/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

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

describe('ensureInstallLock', () => {
  beforeEach(() => {
    mkdirSync(TEST_INSTALL_DIR, { recursive: true })
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(TEST_INSTALL_DIR, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('generates a lock when none exists', async () => {
    const { ensureInstallLock } = await import('../../src/main/licensing/ensure')
    const path = join(TEST_INSTALL_DIR, 'machine.lock')

    expect(existsSync(path)).toBe(false)
    ensureInstallLock()
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf-8').trim()).toBe(MACHINE_GUID)
  })

  it('does not overwrite an existing lock', async () => {
    writeFileSync(join(TEST_INSTALL_DIR, 'machine.lock'), 'existing-guid\n', 'utf-8')

    const { ensureInstallLock } = await import('../../src/main/licensing/ensure')
    ensureInstallLock()

    expect(readFileSync(join(TEST_INSTALL_DIR, 'machine.lock'), 'utf-8')).toBe('existing-guid\n')
  })

  it('does not throw when fingerprint collection fails', async () => {
    const { execFileSync } = await import('node:child_process')
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('reg.exe unavailable')
    })

    const { ensureInstallLock } = await import('../../src/main/licensing/ensure')
    expect(() => ensureInstallLock()).not.toThrow()
    expect(existsSync(join(TEST_INSTALL_DIR, 'machine.lock'))).toBe(false)
  })
})
