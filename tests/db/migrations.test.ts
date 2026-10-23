import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { openDatabase, closeDatabase, getDb } from '../../src/main/db/connection'
import { runMigrations } from '../../src/main/db/migrations'

const TABLES = [
  'app_meta',
  'companies',
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'company_users',
  'account_groups',
  'accounts',
  'parties',
  'party_accounts',
  'units',
  'stock_groups',
  'godowns',
  'items',
  'tax_rates',
  'voucher_sequences',
  'voucher_number_settings',
  'vouchers',
  'voucher_item_lines',
  'ledger_lines',
  'stock_movements',
  'bill_allocations',
  'payment_methods',
  'audit_events',
  'idempotency_keys'
]

beforeEach(() => {
  closeDatabase()
  openDatabase(':memory:')
})

afterAll(() => {
  closeDatabase()
})

function tableNames(): Set<string> {
  const rows = getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
    name: string
  }[]
  return new Set(rows.map((r) => r.name))
}

describe('runMigrations', () => {
  it('creates the full accounting schema on a fresh database', () => {
    runMigrations()
    const tables = tableNames()
    for (const table of TABLES) {
      expect(tables.has(table), table).toBe(true)
    }
    expect(TABLES).toHaveLength(26)
  })

  it('creates no gym tables', () => {
    runMigrations()
    const tables = tableNames()
    for (const gone of ['leads', 'people', 'memberships', 'invoices', 'payments', 'refunds']) {
      expect(tables.has(gone), gone).toBe(false)
    }
  })

  it('records the baseline and numbering migrations once', () => {
    runMigrations()
    const rows = getDb()
      .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
      .all() as { version: number; name: string }[]
    expect(rows).toEqual([
      { version: 0, name: 'accounting_core' },
      { version: 1, name: 'voucher_numbering' }
    ])
  })

  it('is idempotent', () => {
    runMigrations()
    runMigrations()
    const row = getDb().prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as {
      n: number
    }
    expect(row.n).toBe(2)
    expect(tableNames().has('vouchers')).toBe(true)
  })

  it('enforces one side per ledger line', () => {
    runMigrations()
    const db = getDb()
    db.exec(`
      INSERT INTO companies (slug, name, state_code, books_begin_date)
      VALUES ('acme', 'Acme', '27', '2026-04-01');
      INSERT INTO account_groups (company_id, name, nature) VALUES (1, 'Assets', 'ASSET');
      INSERT INTO accounts (company_id, group_id, name, type) VALUES (1, 1, 'Cash', 'ASSET');
      INSERT INTO vouchers (company_id, voucher_type, series, number, fy, voucher_date, status)
      VALUES (1, 'JOURNAL', 'JV', '0001', '2026-27', '2026-04-02', 'POSTED');
    `)

    expect(() =>
      db
        .prepare(
          `INSERT INTO ledger_lines (company_id, voucher_id, account_id, debit_minor, credit_minor)
           VALUES (1, 1, 1, 0, 0)`
        )
        .run()
    ).toThrow()

    expect(() =>
      db
        .prepare(
          `INSERT INTO ledger_lines (company_id, voucher_id, account_id, debit_minor, credit_minor)
           VALUES (1, 1, 1, 100, 100)`
        )
        .run()
    ).toThrow()

    expect(() =>
      db
        .prepare(
          `INSERT INTO ledger_lines (company_id, voucher_id, account_id, debit_minor, credit_minor)
           VALUES (1, 1, 1, 100, 0)`
        )
        .run()
    ).not.toThrow()
  })

  it('enforces one direction per stock movement', () => {
    runMigrations()
    const db = getDb()
    db.exec(`
      INSERT INTO companies (slug, name, state_code, books_begin_date)
      VALUES ('acme', 'Acme', '27', '2026-04-01');
      INSERT INTO items (company_id, name) VALUES (1, 'SSD');
      INSERT INTO vouchers (company_id, voucher_type, series, number, fy, voucher_date, status)
      VALUES (1, 'PURCHASE', 'PUR', '0001', '2026-27', '2026-04-02', 'POSTED');
    `)

    expect(() =>
      db
        .prepare(
          `INSERT INTO stock_movements
             (company_id, voucher_id, item_id, qty_in_e4, qty_out_e4, unit_cost_minor, movement_type)
           VALUES (1, 1, 1, 10000, 10000, 100, 'PURCHASE')`
        )
        .run()
    ).toThrow()
  })

  it('refuses a duplicate voucher number in the same series and year', () => {
    runMigrations()
    const db = getDb()
    db.exec(`
      INSERT INTO companies (slug, name, state_code, books_begin_date)
      VALUES ('acme', 'Acme', '27', '2026-04-01');
      INSERT INTO vouchers (company_id, voucher_type, series, number, fy, voucher_date, status)
      VALUES (1, 'SALES', 'INV', '0001', '2026-27', '2026-04-02', 'POSTED');
    `)
    expect(() =>
      db
        .prepare(
          `INSERT INTO vouchers (company_id, voucher_type, series, number, fy, voucher_date, status)
           VALUES (1, 'SALES', 'INV', '0001', '2026-27', '2026-04-03', 'POSTED')`
        )
        .run()
    ).toThrow()
  })
})
