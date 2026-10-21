import { beforeEach, afterEach, afterAll } from 'vitest'
import { openDatabase, closeDatabase } from '../../src/main/db/connection'
import { runMigrations } from '../../src/main/db/migrations'
import { seedPermissions } from '../../src/main/db/seed'
import { setSession } from '../../src/main/auth/session'

/**
 * Fresh in-memory database + migrations + permission seeds before every test, and
 * a cleared session after each. Guarantees tests are isolated from each other even
 * though the modules hold a process-wide singleton DB reference.
 */
export function setupTestDb(): void {
  beforeEach(() => {
    closeDatabase()
    openDatabase(':memory:')
    runMigrations()
    seedPermissions()
    setSession(null)
  })

  afterEach(() => {
    setSession(null)
  })

  afterAll(() => {
    closeDatabase()
  })
}
