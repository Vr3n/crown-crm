import { describe, expect, it } from 'vitest'
import {
  filterRecords,
  formatRecord,
  isLogFileName,
  parseLogLines,
  resolveLogDir,
  summarize
} from '../../scripts/lib/logs-core.mjs'

const LINES = [
  '{"ts":"2026-11-12T10:00:00.000Z","level":"info","source":"renderer","module":"import","event":"run.start","traceId":"t-1","fields":{"bills":2}}',
  '{"ts":"2026-11-12T10:00:00.100Z","level":"info","source":"backend","module":"rpc","event":"rpc.start","traceId":"t-1","fields":{"channel":"vouchers:post"}}',
  '{"ts":"2026-11-12T10:00:00.200Z","level":"error","source":"backend","module":"vouchers","event":"post.fail","traceId":"t-1","fields":{},"error":{"code":"DUPLICATE_SUPPLIER_BILL","message":"Already posted"}}',
  'not json',
  ''
].join('\n')

describe('logs CLI core', () => {
  it('parses JSONL and skips malformed lines', () => {
    const records = parseLogLines(LINES)
    expect(records).toHaveLength(3)
    expect(records[0].module).toBe('import')
    expect(records[2].error.code).toBe('DUPLICATE_SUPPLIER_BILL')
  })

  it('filters by level, module, trace and text', () => {
    const records = parseLogLines(LINES)
    expect(filterRecords(records, { level: 'error' })).toHaveLength(1)
    expect(filterRecords(records, { module: 'rpc' })).toHaveLength(1)
    expect(filterRecords(records, { trace: 't-1' })).toHaveLength(3)
    expect(filterRecords(records, { query: 'duplicate' })).toHaveLength(1)
    expect(filterRecords(records, { module: 'import', level: 'warn' })).toHaveLength(0)
  })

  it('formats a record with the fields and error visible', () => {
    const line = formatRecord(parseLogLines(LINES)[2])
    expect(line).toContain('ERROR')
    expect(line).toContain('vouchers')
    expect(line).toContain('DUPLICATE_SUPPLIER_BILL')
    expect(line).toContain('Already posted')
  })

  it('summarises by module', () => {
    const rows = summarize(parseLogLines(LINES))
    const importRow = rows.find((row) => row.module === 'import')
    expect(importRow?.total).toBe(1)
    expect(rows.find((row) => row.module === 'vouchers')?.error).toBe(1)
  })

  it('resolves the app log directory', () => {
    expect(
      resolveLogDir({ env: { APPDATA: 'C:\\Users\\Viren\\AppData\\Roaming' } })
    ).toContain('Crown Books')
    expect(resolveLogDir({ env: { CROWN_BOOKS_USER_DATA: 'C:\\tmp\\books' } })).toBe(
      'C:\\tmp\\books\\logs'
    )
    expect(isLogFileName('app-2026-11-12.jsonl')).toBe(true)
    expect(isLogFileName('other.jsonl')).toBe(false)
  })
})
